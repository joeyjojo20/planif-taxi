// scripts/mailImport.js
// Import Gmail IMAP -> filtre via save-imap-config -> upload PDFs to Supabase Storage (rdv-pdfs)

import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";
import FormData from "form-data";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");




const BUCKET = "rdv-pdfs"; // doit exister dans Supabase Storage

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
  // https://xxxx.supabase.co -> https://xxxx.functions.supabase.co/functions/v1
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

  // 1) expéditeurs autorisés
  if (mailCfg.authorizedSenders.length > 0) {
    const okSender = mailCfg.authorizedSenders.some((s) => from.includes(s));
    if (!okSender) return false;
  }

  // 2) mots-clés
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

async function callParsePdfs({ pdfName, storagePath, text }) {
  const base = functionsBaseFromSupabaseUrl(process.env.SUPABASE_URL);
  const url = `${base}/parse-pdfs`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pdfName, storagePath, text }),
  });

  const out = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`parse-pdfs failed ${res.status}: ${out}`);
  console.log("parse-pdfs OK:", out);
}


(async () => {
  // --- check env ---
  assertEnv("GMAIL_EMAIL");
  assertEnv("GMAIL_PASSWORD");
  assertEnv("SUPABASE_URL");
  assertEnv("SUPABASE_SERVICE_ROLE");

  console.log("IMAP host:", config.imap.host);
  console.log("IMAP user:", process.env.GMAIL_EMAIL);

  // --- lire config filtres depuis Supabase ---
  const mailCfg = await getMailConfig();
  console.log("Mail config (Supabase):", mailCfg);

  // --- connect ---
  const connection = await imaps.connect(config);

  // ouvrir la mailbox configurée
  await connection.openBox(mailCfg.folder);
  console.log("Opened mailbox:", mailCfg.folder);

  // Lire les courriels non lus (comme avant)
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

    // Filtre via config (si mots-clés/expéditeurs sont définis)
    if (!matchesMailFilters({ fromEmail, subject, bodyText }, mailCfg)) {
      skippedByFilter++;
      console.log("Skip (filters):", { uid: item.attributes.uid, fromEmail, subject });
      continue;
    }

    let uploadedAny = false;

    for (const att of parsed.attachments || []) {
      const fn = (att.filename || "").toLowerCase();
      if (fn.endsWith(".pdf")) {
       
       console.log("Found PDF attachment:", att.filename);

const storagePath = await uploadToSupabase(att.filename, att.content);
uploadedTotal++;

const parsedPdf = await pdfParse.default(att.content);
await callParsePdfs({
  pdfName: att.filename,
  storagePath,
  text: parsedPdf.text || "",
});
 uploadedAny = true;
      }
    }

    // Marquer comme lu seulement si on a traité au moins un PDF
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
