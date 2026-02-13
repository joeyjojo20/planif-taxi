const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const imaps = require("imap-simple");
const fetch = require("node-fetch");

const {
  GMAIL_EMAIL,
  GMAIL_PASSWORD,
  SUPABASE_URL,
} = process.env;

if (!GMAIL_EMAIL || !GMAIL_PASSWORD || !SUPABASE_URL) {
  console.error("Missing env vars: GMAIL_EMAIL, GMAIL_PASSWORD, SUPABASE_URL");
  process.exit(1);
}

function functionsBaseFromSupabaseUrl(supabaseUrl) {
  const ref = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0];
  return `https://${ref}.functions.supabase.co/functions/v1`;
}

async function fetchMailConfig() {
  const base = functionsBaseFromSupabaseUrl(SUPABASE_URL);
  const url = `${base}/save-imap-config`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`GET save-imap-config failed: ${res.status} ${await res.text()}`);

  const cfg = await res.json();

  const folder = (cfg.imap_folder || "INBOX").trim() || "INBOX";
  const keywords = Array.isArray(cfg.keywords) ? cfg.keywords.map(s => String(s).trim()).filter(Boolean) : [];
  const senders  = Array.isArray(cfg.authorized_senders) ? cfg.authorized_senders.map(s => String(s).trim().toLowerCase()).filter(Boolean) : [];

  return { folder, keywords, senders, check_interval_minutes: cfg.check_interval_minutes ?? 3 };
}

(async () => {
  console.log("TEST 1 — Lire config depuis Supabase...");
  const cfg = await fetchMailConfig();
  console.log("Config reçue:", cfg);

  console.log("\nTEST 2 — Connexion IMAP Gmail + ouverture dossier...");
  const connection = await imaps.connect({
    imap: {
      user: GMAIL_EMAIL,
      password: GMAIL_PASSWORD,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      authTimeout: 15000,
    },
  });

  await connection.openBox(cfg.folder);
  console.log("OK mailbox ouverte:", cfg.folder);

  connection.end();
  console.log("\n✅ OK — lecture config + IMAP fonctionnent.");
})().catch((e) => {
  console.error("❌ TEST FAILED:", e);
  process.exit(1);
});
