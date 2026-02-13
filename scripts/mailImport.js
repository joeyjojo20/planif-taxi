// scripts/mailImport.js
// Import Gmail IMAP -> filtre via save-imap-config -> upload PDFs to Supabase Storage (rdv-pdfs)
// + extrait le texte (pdf-parse) -> appelle Edge Function parse-pdfs (avec limite texte + retry/timeout)

import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import fetch from "node-fetch"; // node-fetch@2
import FormData from "form-data";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParseMod = require("pdf-parse");

// ✅ Résout la fonction peu importe comment le module exporte
const pdfParse =
  (pdfParseMod && typeof pdfParseMod === "function" ? pdfParseMod : null) ||
  (pdfParseMod && typeof pdfParseMod.default === "function" ? pdfParseMod.default : null) ||
  (pdfParseMod && typeof pdfParseMod.pdfParse === "function" ? pdfParseMod.pdfParse : null) ||
  (pdfParseMod && typeof pdfParseMod.parse === "function" ? pdfParseMod.parse : null);

if (typeof pdfParse !== "function") {
  const keys = pdfParseMod && typeof pdfParseMod === "object" ? Object.keys(pdfParseMod) : [];
  throw new Error(
    `pdf-parse is not a function (typeof=${typeof pdfParseMod}, keys=${keys.join(",")})`
  );
}

const BUCKET = "rdv-pdfs";

const config = {
  imap: {
    user: process.env.GMAIL_EMAIL,
    password: process.env.GMAIL_PASSWORD,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { servername: "imap.gmail.com" },
    authTimeout: 20000,
  },
};

function assertEnv(name) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
}

function functionsBaseFromSupabaseUrl(supabaseUrl) {
  const ref = String(supabaseUrl).replace(/^https?:\/\//, "").split(".")[0];
  return `https://${ref}.functions.supabase.co/functions/v1`;
}

async function getMailConfig() {
  const base = functionsBaseFromSupabaseUrl(process.env.SUPABASE_URL);
  const url = `${base}/save-imap-config`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET save-imap-config failed ${res.status}: ${txt}`);
  }

  const cfg = await res.json();

  const folder = (cfg.imap_folder || "INBOX").trim() || "INBOX";
  const keywords = Array.isArray(cfg.keywords)
    ? cfg.keywords.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const authorizedSenders = Array.isArray(cfg.authorized_senders)
    ? cfg.authorized_senders.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : [];

  const checkIntervalMinutes =
    Number.isFinite(Number(cfg.check_interval_minutes)) ? Number(cfg.check_interval_minutes) : 3;

  return { folder, keywords, authorizedSenders, checkIntervalMinutes };
}

function matchesMailFilters({ fromEmail, subject, bodyText }, mailCfg) {
  const from = (fromEmail || "").toLowerCase();
  const subj = (subject || "").toLowerCase();
  const body = (bodyText || "").toLowerCase();

  if (mailCfg.authorizedSenders.length > 0) {
    const okSender = mailCfg.authorizedSenders.some((s) => from.includes(s));
    if (!okSender) return false;
  }

  if (mailCfg.keywords.length > 0) {
    const okKeyword = mailCfg.keywords.some((k) => {
      const kk = String(k).toLowerCase();
      return subj.includes(kk) || body.includes(kk);
    });
    if (!okKeyword) return false;
  }

  return true;
}

async function uploadToSupabase(filename, buffer) {
  const form = new FormData();
  form.append("file", buffer, filename);

  const cleanName = (filename || "file.pdf").replace(/[^\w.\-()+ ]/g, "_");
  const path = `${Date.now()}-${cleanName}`;

  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed ${res.status}: ${txt}`);
  }

  console.log("Uploaded:", path);
  return path;
}

// ✅ call parse-pdfs avec timeout + retries (FIX: 25s -> 180s + logs)
async function callParsePdfs({ pdfName, storagePath, text }, retries = 2) {
  const base = functionsBaseFromSupabaseUrl(process.env.SUPABASE_URL);
  const url = `${base}/parse-pdfs`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();

    // ✅ IMPORTANT: 25s te faisait abort -> on met 180s
    const timeoutMs = 180000;
    const t = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pdfName, storagePath, text }),
        signal: controller.signal,
      });

      const out = await res.text().catch(() => "");
      clearTimeout(t);

      console.log(`[parse-pdfs] status=${res.status} in ${Date.now() - started}ms`);
      if (!res.ok) throw new Error(`parse-pdfs failed ${res.status}: ${out.slice(0, 800)}`);

      console.log("parse-pdfs OK:", out.slice(0, 1500));
      return;
    } catch (e) {
      clearTimeout(t);
      const msg = String(e?.message || e);

      const canRetry =
        attempt < retries &&
        (msg.includes("504") ||
          msg.includes("timeout") ||
          msg.toLowerCase().includes("aborted") ||
          msg.includes("AbortError"));

      console.log(`parse-pdfs attempt ${attempt + 1}/${retries + 1} failed:`, msg);

      if (!canRetry) throw e;

      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

(async () => {
  assertEnv("GMAIL_EMAIL");
  assertEnv("GMAIL_PASSWORD");
  assertEnv("SUPABASE_URL");
  assertEnv("SUPABASE_SERVICE_ROLE");

  console.log("IMAP host:", config.imap.host);
  console.log("IMAP user:", process.env.GMAIL_EMAIL);

  const mailCfg = await getMailConfig();
  console.log("Mail config (Supabase):", mailCfg);

  const connection = await imaps.connect(config);

  await connection.openBox(mailCfg.folder);
  console.log("Opened mailbox:", mailCfg.folder);

  const messages = await connection.search(["UNSEEN"], { bodies: [""] });
  console.log("UNSEEN mails:", messages.length);

  let uploadedTotal = 0;
  let skippedByFilter = 0;

  for (const item of messages) {
    const bodyPart = item.parts.find((p) => p.which === "");
    const parsed = await simpleParser(bodyPart.body);

    const fromEmail = parsed.from?.value?.[0]?.address || "";
    const subject = parsed.subject || "";
    const bodyText = parsed.text || parsed.html || "";

    if (!matchesMailFilters({ fromEmail, subject, bodyText }, mailCfg)) {
      skippedByFilter++;
      console.log("Skip (filters):", { uid: item.attributes.uid, fromEmail, subject });
      continue;
    }

    let uploadedAny = false;

    for (const att of parsed.attachments || []) {
      const fn = (att.filename || "").toLowerCase();
      if (!fn.endsWith(".pdf")) continue;

      console.log("Found PDF attachment:", att.filename);

      // 1) upload storage
      const storagePath = await uploadToSupabase(att.filename, att.content);
      uploadedTotal++;

      // 2) extract text (pdf-parse)
      const parsedPdf = await pdfParse(att.content);
      let text = parsedPdf?.text || "";

      // ✅ limite pour éviter payload trop gros
      const MAX = 250000; // 250k caractères
      if (text.length > MAX) text = text.slice(0, MAX);

      // 3) call parse-pdfs (timeout + retry)
      await callParsePdfs(
        {
          pdfName: att.filename,
          storagePath,
          text,
        },
        2
      );

      uploadedAny = true;
    }

    if (uploadedAny) {
      await connection.addFlags(item.attributes.uid, ["\\Seen"]);
      console.log("Marked mail as Seen:", item.attributes.uid);
    } else {
      console.log("No PDF in mail, leaving UNSEEN:", item.attributes.uid);
    }
  }

  connection.end();
  console.log("Done.");
  console.log("Uploaded PDFs:", uploadedTotal);
  console.log("Skipped by filters:", skippedByFilter);
})().catch((err) => {
  console.error("FATAL:", err?.message || err);
  process.exit(1);
});
