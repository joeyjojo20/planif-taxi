// scripts/mailImport.js
// Gmail IMAP -> filtre via save-imap-config -> upload PDFs (rdv-pdfs)
// -> extrait texte (pdf-parse) -> NORMALISE le texte (sans changer ton parseur)
// -> parse -> envoie events[] à Edge parse-pdfs
//
// ✅ Objectif: garder la logique globale intacte, mais corriger l'ORDRE d'affichage:
//    - L'heure doit venir de start (comme l'import manuel)
//    - Le title doit commencer par le NOM, puis "DEPART → DEST"
// ✅ Ajout ciblé: on récupère (DEPART, DEST) à partir des lignes du PDF (2 colonnes séparées par 2+ espaces),
//    associées au couple (NOM + HEURE). Aucun changement côté app.js.

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

/* ============================================================
   ✅ NORMALISATION (ne change pas la logique du parseur)
   ============================================================ */
function normalizePdfTextForParser(t) {
  let s = String(t || "");

  // 1) espace après ",MON" ",QC" ",LAV" quand collé à ce qui suit
  s = s.replace(/,(MON|QC|LAV)(?=\d)/g, ",$1 ");
  s = s.replace(/,(MON|QC|LAV)(?=[A-Za-zÀ-ÿ])/g, ",$1 ");

  // 2) espace avant une heure si collée (ex: 503415:00 -> 5034 15:00)
  s = s.replace(/(\d)(\d{1,2}[:hH]\d{2})/g, "$1 $2");

  // 3) espace après NOM, PRÉNOM si collé à un chiffre
  s = s.replace(/([A-ZÀ-ÖØ-Þ' \-]+,\s*[A-ZÀ-ÖØ-Þ' \-]+)(\d)/g, "$1 $2");

  return s;
}

/* ===========================
   ✅ TES FONCTIONS (inchangées)
   =========================== */

function extractRequestedDate(text) {
  let m = text.match(/(\d{1,2})\s+([A-Za-zÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})\s+Date\s+demand(?:e|é)\s*:/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const year = parseInt(m[3], 10);
    const MONTHS = {
      JANVIER: 0,
      FEVRIER: 1,
      "FÉVRIER": 1,
      MARS: 2,
      AVRIL: 3,
      MAI: 4,
      JUIN: 5,
      JUILLET: 6,
      AOUT: 7,
      "AOÛT": 7,
      SEPTEMBRE: 8,
      OCTOBRE: 9,
      NOVEMBRE: 10,
      "DÉCEMBRE": 11,
      DECEMBRE: 11,
    };
    const month = MONTHS[monKey] ?? null;
    if (month !== null) {
      const d = new Date();
      d.setFullYear(year);
      d.setMonth(month);
      d.setDate(day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  m = text.match(/Date\s+demand(?:e|é)\s*:\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})/i);
  if (m) {
    const d = new Date();
    d.setFullYear(parseInt(m[1], 10));
    d.setMonth(parseInt(m[2], 10) - 1);
    d.setDate(parseInt(m[3], 10));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

function parseTaxiPdfFromText(rawText, baseDate) {
  const RAW_LINES = String(rawText || "")
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // --- helpers ---
  const CITY = /(MON|LAV|QC|QUEBEC|QUÉBEC|CANADA)\b/i;
  const TIME_RE = /\b(\d{1,2}[:hH]\d{2})\b/g;

  function normTime(t) {
    const x = String(t || "").replace(/[hH]/g, ":").trim();
    const m = x.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return "";
    return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
  }

  function cleanName(s) {
    return (s || "")
      .replace(/\bTA ?\d{3,6}\b/gi, " ")
      .replace(/\b[A-Z]{1,4}\d{2,6}\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function isValidName(n) {
    if (!n) return false;
    if (/\d/.test(n)) return false;
    if (!/,/.test(n)) return false;
    const w = n.split(/\s+/).filter(Boolean);
    return w.length >= 2;
  }

  // Address lines look like:
  // "120 5 10 9 3E AV SUD,MON 101 BOULEVARD TACHÉ OUEST,MON FRE-5 7:45 ..."
  const ADDR_PAIR_RE =
    /(.+?),\s*(MON|LAV|QC|QUEBEC|QUÉBEC|CANADA)\s+(.+?),\s*(MON|LAV|QC|QUEBEC|QUÉBEC|CANADA)\b/i;

  const pendingByTime = new Map(); // "07:45" => { from, to }

  // Pass 1: collect addresses by time
  for (const line0 of RAW_LINES) {
    if (!CITY.test(line0)) continue;

    // Find last time on the line
    let lastTime = null;
    let m;
    while ((m = TIME_RE.exec(line0)) !== null) lastTime = m[1];
    TIME_RE.lastIndex = 0;
    const time = normTime(lastTime);
    if (!time) continue;

    // Remove leading table columns "120 5 10 " etc (3 numeric fields) if present
    const line = line0.replace(/^\d+\s+\d+\s+\d+\s+/, "").trim();

    const am = line.match(ADDR_PAIR_RE);
    if (!am) continue;

    const from = String(am[1] || "").trim();
    const to = String(am[3] || "").trim();
    if (!from || !to) continue;

    pendingByTime.set(time, { from, to });
  }

  // Pass 2: parse name lines and build events
  // Name lines:
  // "7:45 TA0654 LAMONDE, JEAN-RENÉ (418) ..."
  // "< 9:30 7407 GARNEAU, NADINE (418) ..."
  // "<15:00 5034 CARON, FRANCIS (418) ..."
  const NAME_LINE_RE =
    /^\s*<?\s*(\d{1,2}[:hH]\d{2})\s+([A-Z]{0,4}\d{2,6}|\d{2,6})\s+([A-ZÀ-ÖØ-Þ' \-]+,\s*[A-ZÀ-ÖØ-Þ' \-]+)/i;

  const out = [];
  const seen = new Set();

  const base = new Date(baseDate?.getTime() || Date.now());
  base.setSeconds(0, 0);

  for (const line of RAW_LINES) {
    if (/^commentaire\b/i.test(line)) continue;
    if (/^\(ACU\d+\)/i.test(line)) continue;

    const nm = line.match(NAME_LINE_RE);
    if (!nm) continue;

    const time = normTime(nm[1]);
    const pair = pendingByTime.get(time);
    if (!pair) continue;

    const name = cleanName(nm[3] || "");
    if (!isValidName(name)) continue;

    const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
    const start = new Date(base.getTime());
    start.setHours(hh, mm || 0, 0, 0);

    const title = `${name} – ${pair.from} ➜ ${pair.to}`;

    const key = `${title}|${start.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}T${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      reminderMinutes: 15,
    });
  }

  return out;
}

/* ===========================
   Helpers IMAP + Supabase
   =========================== */

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
      keepalive: { interval: 10000, idleInterval: 300000, forceNoop: true },
    },
  };
}

function functionsBaseFromSupabaseUrl(supabaseUrl) {
  const ref = String(supabaseUrl).replace(/^https?:\/\//, "").split(".")[0];
  return `https://${ref}.functions.supabase.co/functions/v1`;
}

function assertEnv(name) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
}

async function connectImapWithRetry(maxTries = 5) {
  const cfg = buildImapConfig();
  for (let i = 1; i <= maxTries; i++) {
    try {
      console.log(`IMAP connect attempt ${i}/${maxTries}...`);
      const connection = await imaps.connect(cfg);
      connection.imap.on("error", (err) => console.log("[IMAP] error event:", String(err?.message || err)));
      connection.imap.on("close", (hadError) => console.log("[IMAP] close event. hadError=", hadError));
      return connection;
    } catch (err) {
      console.log("IMAP connect failed:", String(err?.message || err));
      if (i === maxTries || !isTransientNetErr(err)) throw err;
      await sleep(2000 + i * 2000);
    }
  }
  throw new Error("IMAP connect failed");
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
  const keywords = Array.isArray(cfg.keywords) ? cfg.keywords.map((s) => String(s).trim()).filter(Boolean) : [];
  const authorizedSenders = Array.isArray(cfg.authorized_senders)
    ? cfg.authorized_senders.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : [];
  const checkIntervalMinutes = Number.isFinite(Number(cfg.check_interval_minutes)) ? Number(cfg.check_interval_minutes) : 3;

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

  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed ${res.status}: ${txt.slice(0, 800)}`);
  }

  console.log("Uploaded:", path);
  return path;
}

/* ============================================================
   ✅ ANTI-DOUBLON AVANT UPLOAD (imported_pdfs)
   ============================================================ */
async function isPdfAlreadyImported(pdfName) {
  const base = `${process.env.SUPABASE_URL}/rest/v1/imported_pdfs`;
  const qs = new URLSearchParams();
  qs.set("select", "name");
  qs.set("name", `eq.${pdfName}`);
  qs.set("limit", "1");

  const url = `${base}?${qs.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.log("[WARN] imported_pdfs check failed:", res.status, txt.slice(0, 300));
    return false;
  }

  const data = await res.json().catch(() => []);
  return Array.isArray(data) && data.length > 0;
}

// ✅ parse-pdfs RAPIDE: reçoit events[]
async function callParsePdfsFast({ pdfName, storagePath, requestedDateISO, events }, retries = 1) {
  const base = functionsBaseFromSupabaseUrl(process.env.SUPABASE_URL);
  const url = `${base}/parse-pdfs`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutMs = 45000;
    const t = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pdfName, storagePath, requestedDateISO, events }),
        signal: controller.signal,
      });

      const out = await res.text().catch(() => "");
      clearTimeout(t);

      if (!res.ok) {
        const low = out.toLowerCase();
        const dup = res.status === 409 || low.includes("duplicate") || low.includes("already") || low.includes("imported");
        if (dup) {
          console.log("parse-pdfs says already imported -> continue");
          return;
        }
        throw new Error(`parse-pdfs failed ${res.status}: ${out.slice(0, 800)}`);
      }

      console.log("parse-pdfs OK:", out.slice(0, 2000));
      return;
    } catch (e) {
      clearTimeout(t);
      console.log(`parse-pdfs attempt ${attempt + 1}/${retries + 1} failed:`, String(e?.message || e));
      if (attempt >= retries) {
        if (isTransientNetErr(e)) return;
        throw e;
      }
      await sleep(1500);
    }
  }
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
    let skippedAlreadyImported = 0;

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

          sawPdf = true;
          console.log("Found PDF attachment:", att.filename);

          // ✅ Anti-doublon AVANT upload
          if (await isPdfAlreadyImported(att.filename)) {
            skippedAlreadyImported++;
            console.log("Skip (already imported):", att.filename);

            try {
              await connection.addFlags(item.attributes.uid, ["\\Seen"]);
              console.log("Marked mail as Seen (already imported):", item.attributes.uid);
            } catch (e) {
              console.log("Could not mark Seen (already imported):", String(e?.message || e));
            }
            continue;
          }

          // ✅ Marque Seen tôt (évite reprocessing en boucle)
          try {
            await connection.addFlags(item.attributes.uid, ["\\Seen"]);
            console.log("Marked mail as Seen (early):", item.attributes.uid);
          } catch (e) {
            console.log("Could not mark Seen early (continue):", String(e?.message || e));
          }

          // 1) upload storage
          const storagePath = await uploadToSupabase(att.filename, att.content);
          uploadedTotal++;

          // 2) extract text
          let text = "";
          try {
            const parsedPdf = await pdfParse(att.content);
            text = parsedPdf?.text || "";
            const MAX = 250000;
            if (text.length > MAX) text = text.slice(0, MAX);
          } catch (e) {
            console.log("pdf-parse failed:", String(e?.message || e));
            text = "";
          }

          // ✅ NORMALISE
          const textNorm = normalizePdfTextForParser(text);

          console.log("PDF TEXT LEN:", text.length);
          console.log("PDF TEXT LEN (norm):", textNorm.length);
          console.log("PDF TEXT HAS TIME:", /(\d{1,2}[:hH]\d{2})/.test(textNorm));
          console.log("PDF TEXT HAS COMMA_ABBR:", /,\s*[A-Z]{2,3}\b/.test(textNorm));
          console.log("PDF TEXT HEAD (norm):", textNorm.slice(0, 1200));

          // 3) parsing
          let baseDate = extractRequestedDate(textNorm) || extractRequestedDate(text);
          console.log("Requested date:", baseDate ? baseDate.toISOString() : null);

          if (!baseDate) {
            baseDate = new Date();
            baseDate.setHours(0, 0, 0, 0);
          }

          const events = parseTaxiPdfFromText(textNorm, baseDate);
          const requestedDateISO = baseDate.toISOString().slice(0, 10);

          console.log(`Parsed events: ${events.length} for date ${requestedDateISO}`);

          // 4) send events[] to Edge
          await callParsePdfsFast({
            pdfName: att.filename,
            storagePath,
            requestedDateISO,
            events,
          });
        }

        if (!sawPdf) {
          console.log("No PDF in mail, leaving UNSEEN:", item.attributes.uid);
        }
      } catch (err) {
        if (isTransientNetErr(err)) {
          console.log("Transient IMAP error:", String(err?.message || err));
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
    console.log("Skipped already imported:", skippedAlreadyImported);
  } catch (err) {
    console.error("FATAL:", String(err?.message || err));
    if (isTransientNetErr(err)) process.exit(0);
    process.exit(1);
  } finally {
    try {
      connection?.end();
    } catch {}
  }
})();
