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
//
// ✅ FIX IMPORTANT (2026-02-24):
//    Jean-René skippé car la ligne RAW contient "JEAN-RENÉTA 0654 7:45..." (TA collé)
//    => findAddrPairNear ne matchait pas "LAMONDE, JEAN-RENÉ".
//    On normalise RAW_LINES (supprime TAxxxx même collé, diacritiques, espaces) pour matcher correctement.

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

  // 1) espace après ",XXX" (ville 2-3 lettres) quand collé à ce qui suit
  //    Ex: "OUEST,CAP140" -> "OUEST,CAP 140", "RUE,MON145" -> "RUE,MON 145"
  s = s.replace(/,([A-Z]{2,3})(?=\d)/g, ",$1 ");
  s = s.replace(/,([A-Z]{2,3})(?=[A-Za-zÀ-ÿ])/g, ",$1 ");

  // 2) espace avant une heure si collée (ex: 503415:00 -> 5034 15:00)
  s = s.replace(/(\d)(\d{1,2}[:hH]\d{2})/g, "$1 $2");

  // 3) espace après NOM, PRÉNOM si collé à un chiffre
  s = s.replace(/([A-ZÀ-ÖØ-Þ' \-]+?,\s*[A-ZÀ-ÖØ-Þ' \-]+)(\d)/g, "$1 $2");

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
  // ✅ Conserver les lignes avant de les "aplatir" (pour retrouver DEPART + DEST)
  const RAW_LINES = String(rawText || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Texte aplati (logique actuelle)
  const text = (" " + (rawText || "")).replace(/\s+/g, " ").trim() + " ";

  // ⚠️ On garde ton RE actuel pour trouver (time) + (nom) de façon stable
  const RE =
    /([0-9A-Za-zÀ-ÿ' .\-]+?,\s*[A-Z]{2,3})\s+([0-9A-Za-zÀ-ÿ' .\-]{3,80}?)\s+(\d{1,2}[:hH]\d{2}).{0,200}?([A-ZÀ-ÖØ-Þ' \-]+,\s*[A-ZÀ-ÖØ-Þ' \-]+)/gms;

  const CITY_ABBR = /\s*,\s*(MON|LAV|QC|QUEBEC|QUÉBEC|CANADA)\b/gi;
  const COST_HEAD = /^\s*\d{1,3}\s*Co[uû]t\s*/i;
  const NOISE = /\b(NIL\s*TRA|NILTRA|NIL|COMMENTAIRE|#\d{3,8}|FRE|INT|ETUA)\b/gi;

  const STREET =
    /\b(RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH(?:\.)?|C[ÈE]TE|CÔTE|COTE|ROUTE|RT|AUT(?:OROUTE)?|AUTE?R?T?E?|PROMENADE|PROM|PLACE|PL|IMPASSE|IMP|VOIE|CARREFOUR|QUAI|QAI|ALL[ÉE]E?|ALLEE|PARC|SENTIER|SENT|COUR|SQ|RANG|CIR|TERRASSE|TER|PONT|PKWY|PK|BOULEVARD|BLVD|JARDINS?|RUELLE|FAUBOURG|FG|CAMPUS|ESPLANADE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\b)\b/i;

  const SUBADDR_WIDE =
    /\b\d{1,5}[A-Za-zÀ-ÿ0-9' .\-]{3,80}?\b(?:RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH(?:\.)?|C[ÈE]TE|CÔTE|COTE|ROUTE|RT|AUT(?:OROUTE)?|AUTE?R?T?E?|PROMENADE|PROM|PLACE|PL|IMPASSE|IMP|VOIE|CARREFOUR|QUAI|QAI|ALL[ÉE]E?|ALLEE|PARC|SENTIER|SENT|COUR|SQ|RANG|CIR|TERRASSE|TER|PONT|PKWY|PK|BOULEVARD|BLVD|JARDINS?|RUELLE|FAUBOURG|FG|CAMPUS|ESPLANADE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\b)\b[^\-,;)]*/gi;

  function cleanName(s) {
    return (s || "")
      // ✅ FIX #1: enlève TA même si collé (ex: "JEAN-RENÉTA 0654", "JUNIORTA 0292")
      .replace(/TA\s*\d{0,6}/gi, " ")
      // garde aussi l'ancien cas
      .replace(/\bTA ?\d{3,6}\b/gi, " ")
      .replace(/(?:M(?:me|me\.)|M(?:r|r\.)|Madame|Monsieur)\b/gi, " ")
      .replace(NOISE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function isValidName(n) {
    if (!n) return false;
    if (/\d/.test(n)) return false;
    return n.split(/\s+/).length >= 2;
  }

  function refineAddr(seg) {
    const s = (seg || "")
      .replace(COST_HEAD, "")
      .replace(CITY_ABBR, " ")
      .replace(NOISE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const matches = s.match(SUBADDR_WIDE);
    if (!matches || matches.length === 0) return s;

    let pick = matches[matches.length - 1].trim();
    pick = pick.replace(/^(?:0{1,2}|[01]?\d|2[0-3])\s+(?=\d)/, "");
    const lastTight = pick.match(
      /\d{1,5}\s*(?:[A-Za-zÀ-ÿ0-9' .\-]{0,20}\s)?(?:RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH(?:\.)?|C[ÈE]TE|CÔTE|COTE|ROUTE|RT|AUT(?:OROUTE)?|AUTE?R?T?E?|PROMENADE|PROM|PLACE|PL|IMPASSE|IMP|VOIE|CARREFOUR|QUAI|QAI|ALL[ÉE]E?|ALLEE|PARC|SENTIER|SENT|COUR|SQ|RANG|CIR|TERRASSE|TER|PONT|PKWY|PK|BOULEVARD|BLVD|JARDINS?|RUELLE|FAUBOURG|FG|CAMPUS|ESPLANADE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\b)\b/i
    );
    if (lastTight) {
      const idx = pick.lastIndexOf(lastTight[0]);
      if (idx > 0) pick = pick.slice(idx);
    }
    return pick.replace(CITY_ABBR, " ").replace(/\s{2,}/g, " ").trim();
  }

  // ✅ FIX #2: support "addr1,MON addr2,MON" (1 espace) en plus de "2 colonnes"
  const ADDR_PAIR_LINE_RE =
    /(.{5,}?),\s*([A-ZÉÈÊÎÔÛÂÄËÏÖÜÇ]{2,3})\s+(.{5,}?),\s*([A-ZÉÈÊÎÔÛÂÄËÏÖÜÇ]{2,3})/i;

  // ✅ Normalise heure (7:45 -> 07:45) pour matcher plus facilement
  function normalizeTimeHHMM(t) {
    const s = String(t || "").replace(/[hH]/, ":").trim();
    const mm = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!mm) return s;
    return `${String(parseInt(mm[1], 10)).padStart(2, "0")}:${mm[2]}`;
    }

  // ✅ Comparaison robuste (diacritiques, TA collé, espaces)
  function normCmp(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")   // enlève accents
      .toUpperCase()
      // enlève TAxxxx même collé (RENÉTA 0654 / RENÉTA0654 / TA 0654)
      .replace(/TA\s*\d{0,6}/g, " ")
      .replace(/\bTA\b/g, " ")
      .replace(/\bNILTRA\b/g, " ")
      .replace(/\bNIL\b/g, " ")
      .replace(/\bTRA\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ✅ Retrouver (DEPART, DEST) près d'un couple (NOM + HEURE) dans les lignes brutes
  function findAddrPairNear(name, time) {
    const nmClean = cleanName(name || "");
    const tmNorm = normalizeTimeHHMM(time || "");
    if (!nmClean || !tmNorm) return null;

    const nmKey = normCmp(nmClean);
    const tmKey = tmNorm; // on compare time en "HH:MM" dans la ligne brute

    for (let i = 0; i < RAW_LINES.length; i++) {
      const L = RAW_LINES[i];
      const Lcmp = normCmp(L);

      // ✅ On accepte la ligne même si TA est collé dans RAW, car normCmp l’enlève
      if (!Lcmp.includes(nmKey)) continue;

      // time: peut être "7:45" dans RAW ; on check aussi sans zéro
      const hasTime =
        L.includes(tmKey) ||
        L.includes(tmKey.replace(/^0/, "")) ||
        normCmp(L).includes(tmKey); // au cas où (rare)

      if (!hasTime) continue;

      // On remonte quelques lignes pour trouver la ligne d'adresses
      for (let j = i; j >= Math.max(0, i - 14); j--) {
        const A = RAW_LINES[j];

        // ✅ Cas "une ligne": "173 rue...,MON 145 8E...,MON"
        const mm = A.match(ADDR_PAIR_LINE_RE);
        if (mm) {
          const from = mm[1].trim();
          const to = mm[3].trim();
          // petite barrière : au moins un mot de rue
          if (STREET.test(from) && STREET.test(to)) {
            return { from, to };
          }
        }

        // ✅ Cas "2 colonnes" (ton ancien)
        if (!/ {2,}/.test(A)) continue; // 2 colonnes
        if (!STREET.test(A)) continue;

        const parts = A.split(/ {2,}/).map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) continue;

        return { from: parts[0], to: parts[1] };
      }
    }
    return null;
  }

  const out = [];
  const seen = new Set();
  let m;

  const base = new Date(baseDate?.getTime() || Date.now());
  base.setSeconds(0, 0);

  while ((m = RE.exec(text)) !== null) {
    // On garde addr1 (peut être imperfect) comme fallback, mais on va prioriser la paire trouvée dans RAW_LINES
    const addr1Fallback = refineAddr(m[1] || "");
    const timeRaw = (m[3] || "").replace(/[hH]/, ":");
    const time = normalizeTimeHHMM(timeRaw);

    // ✅ Le nom est bien dans m[4] (confirmé par ton log)
    let name = cleanName(m[4] || "");
    if (!isValidName(name)) continue; // pas de "client inconnu" : on skip

    // ✅ Paire adresse depuis les lignes (corrigée pour TA collé)
    const pair = findAddrPairNear(name, time);
    const fromAddr = refineAddr(pair?.from || addr1Fallback || "");
    const toAddr = refineAddr(pair?.to || "");

    // On veut un affichage ordonné comme manuel => départ ET destination obligatoires
    if (!fromAddr || !toAddr) continue;

    const [hhStr, mmStr] = time.split(":");
    const hh = parseInt(hhStr, 10);
    const mn = parseInt(mmStr || "0", 10);

    const start = new Date(base.getTime());
    start.setHours(hh, mn || 0, 0, 0);

    // ✅ IMPORTANT: PAS d'heure dans title (l'heure est déjà affichée via start, comme import manuel)
    const title = `${name} – ${fromAddr} → ${toAddr}`;

    const key = `${title}|${start.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(
        2,
        "0"
      )}T${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
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
