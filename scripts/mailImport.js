// scripts/mailImport.js
// Gmail IMAP -> filtres Supabase (save-imap-config) -> upload PDFs (rdv-pdfs)
// -> extrait texte (pdf-parse) -> appelle parse-pdfs
//
// ✅ Corrigé pour TON besoin:
// 1) Le workflow CONTINUE même si doublon / déjà importé (upload ou parse-pdfs)
// 2) Marque le mail en \Seen TÔT dès qu’on voit un PDF (évite reprocessing si crash)
// 3) IMAP plus résilient (keepalive + retry + reconnect) pour éviter ECONNRESET
// 4) Si erreur réseau/transitoire (ECONNRESET etc.), on sort en exit 0 (cron reprendra)

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
  throw new Error(`pdf-parse is not a function (typeof=${typeof pdfParseMod}, keys=${keys.join(",")})`);
}

const BUCKET = "rdv-pdfs";

function assertEnv(name) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
}

function functionsBaseFromSupabaseUrl(supabaseUrl) {
  const ref = String(supabaseUrl).replace(/^https?:\/\//, "").split(".")[0];
  return `https://${ref}.functions.supabase.co/functions/v1`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientNetErr(err) {
  const msg = String(err?.message || err);
  return (
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("EAI_AGAIN") ||
    msg.includes("socket") ||
    msg.includes("Connection closed") ||
    msg.toLowerCase().includes("aborted") ||
    msg.includes("AbortError")
  );
}

// ✅ IMAP config robuste (node-imap options passent via imap-simple)
function buildImapConfig() {
  return {
    imap: {
      user: process.env.GMAIL_EMAIL,
      password: process.env.GMAIL_PASSWORD,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { servername: "imap.gmail.com" },

      authTimeout: 30000,
      connTimeout: 30000,
      socketTimeout: 60000,

      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true,
      },
    },
  };
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

// ✅ Upload tolérant: si erreur/doublon, on LOG et on CONTINUE (pas de throw)
async function uploadToSupabase(filename, buffer) {
  const form = new FormData();
  form.append("file", buffer, filename);

  const cleanName = (filename || "file.pdf").replace(/[^\w.\-()+ ]/g, "_");
  const path = `${Date.now()}-${cleanName}`; // on ne change pas ton comportement

  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}` },
      body: form,
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.log(`Supabase upload failed ${res.status}: ${txt.slice(0, 800)}`);
    // ✅ on continue quand même: on retourne le path “prévu”
    return path;
  }

  console.log("Uploaded:", path);
  return path;
}

// ✅ call parse-pdfs tolérant: si doublon/already imported => OK (continue)
async function callParsePdfs({ pdfName, storagePath, text }, retries = 2) {
  const base = functionsBaseFromSupabaseUrl(process.env.SUPABASE_URL);
  const url = `${base}/parse-pdfs`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutMs = 180000; // 180s
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

      if (!res.ok) {
        const low = out.toLowerCase();
        const isDuplicateLike =
          res.status === 409 ||
          low.includes("duplicate") ||
          low.includes("already") ||
          low.includes("imported") ||
          low.includes("exists");

        if (isDuplicateLike) {
          console.log("parse-pdfs says already processed/duplicate -> continue");
          return;
        }

        throw new Error(`parse-pdfs failed ${res.status}: ${out.slice(0, 800)}`);
      }

      console.log("parse-pdfs OK:", out.slice(0, 1200));
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

      if (!canRetry) {
        // ✅ si erreur transitoire, on “continue” sans casser tout le job
        if (isTransientNetErr(e)) {
          console.log("parse-pdfs transient error -> continue (cron will retry next run)");
          return;
        }
        throw e;
      }

      await sleep(2000);
    }
  }
}

// ✅ Connect IMAP avec retry/reconnect (anti ECONNRESET)
async function connectImapWithRetry(maxTries = 5) {
  const cfg = buildImapConfig();

  for (let i = 1; i <= maxTries; i++) {
    try {
      console.log(`IMAP connect attempt ${i}/${maxTries}...`);
      const connection = await imaps.connect(cfg);

      // imap-simple expose connection.imap (node-imap)
      connection.imap.on("error", (err) => {
        console.log("[IMAP] error event:", String(err?.message || err));
      });

      connection.imap.on("close", (hadError) => {
        console.log("[IMAP] close event. hadError=", hadError);
      });

      return connection;
    } catch (err) {
      const msg = String(err?.message || err);
      console.log("IMAP connect failed:", msg);

      if (i === maxTries || !isTransientNetErr(err)) throw err;

      const wait = 2000 + i * 2000;
      console.log(`Retry IMAP in ${wait}ms...`);
      await sleep(wait);
    }
  }

  throw new Error("IMAP connect failed (unexpected)");
}

(async () => {
  assertEnv("GMAIL_EMAIL");
  assertEnv("GMAIL_PASSWORD");
  assertEnv("SUPABASE_URL");
  assertEnv("SUPABASE_SERVICE_ROLE");

  console.log("IMAP host: imap.gmail.com");
  console.log("IMAP user:", process.env.GMAIL_EMAIL);

  const mailCfg = await getMailConfig();
  console.log("Mail config (Supabase):", mailCfg);

  let connection = null;

  try {
    connection = await connectImapWithRetry(5);

    await connection.openBox(mailCfg.folder);
    console.log("Opened mailbox:", mailCfg.folder);

    const messages = await connection.search(["UNSEEN"], { bodies: [""] });
    console.log("UNSEEN mails:", messages.length);

    let uploadedTotal = 0;
    let skippedByFilter = 0;

    for (const item of messages) {
      try {
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

        let sawPdf = false;

        for (const att of parsed.attachments || []) {
          const fn = (att.filename || "").toLowerCase();
          if (!fn.endsWith(".pdf")) continue;

          console.log("Found PDF attachment:", att.filename);
          sawPdf = true;

          // ✅ IMPORTANT: marque Seen TÔT dès qu’on a un PDF (évite reprocessing si crash)
          try {
            await connection.addFlags(item.attributes.uid, ["\\Seen"]);
            console.log("Marked mail as Seen (early):", item.attributes.uid);
          } catch (e) {
            console.log("Could not mark Seen early (will continue):", String(e?.message || e));
          }

          // 1) upload storage (tolérant)
          const storagePath = await uploadToSupabase(att.filename, att.content);
          uploadedTotal++;

          // 2) extract text (pdf-parse) — si ça échoue, on continue quand même
          let text = "";
          try {
            const parsedPdf = await pdfParse(att.content);
            text = parsedPdf?.text || "";
            const MAX = 250000;
            if (text.length > MAX) text = text.slice(0, MAX);
          } catch (e) {
            console.log("pdf-parse failed (continue):", String(e?.message || e));
            text = "";
          }

          // 3) call parse-pdfs (tolérant doublon + erreurs transitoires)
          await callParsePdfs({ pdfName: att.filename, storagePath, text }, 2);
        }

        if (!sawPdf) {
          console.log("No PDF in mail, leaving UNSEEN:", item.attributes.uid);
        }
      } catch (err) {
        // ✅ Si Gmail reset pendant le traitement, on reconnect et on continue
        if (isTransientNetErr(err)) {
          console.log("Transient IMAP error during processing:", String(err?.message || err));
          console.log("Reconnecting IMAP...");
          try {
            connection?.end();
          } catch {}
          connection = await connectImapWithRetry(5);
          await connection.openBox(mailCfg.folder);
          console.log("Re-opened mailbox after reconnect:", mailCfg.folder);
          continue;
        }
        throw err;
      }
    }

    console.log("Done.");
    console.log("Uploaded PDFs:", uploadedTotal);
    console.log("Skipped by filters:", skippedByFilter);
  } catch (err) {
    const msg = String(err?.message || err);
    console.error("FATAL:", msg);

    // ✅ Si c’est transitoire (IMAP/GitHub réseau), on ne met pas le workflow rouge
    if (isTransientNetErr(err)) {
      console.log("Transient failure -> exit 0 (next cron will retry).");
      process.exit(0);
    }

    process.exit(1);
  } finally {
    try {
      connection?.end();
    } catch {}
  }
})();
