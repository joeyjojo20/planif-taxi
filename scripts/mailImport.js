import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";
import FormData from "form-data";

const BUCKET = "rdv-pdfs"; // ⚠️ doit exister dans Supabase Storage

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

async function uploadToSupabase(filename, buffer) {
  const form = new FormData();
  form.append("file", buffer, filename);

  const cleanName = (filename || "file.pdf").replace(/[^\w.\-()+ ]/g, "_");
  const path = `${Date.now()}-${cleanName}`;

  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
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
}

(async () => {
  // --- check env ---
  assertEnv("GMAIL_EMAIL");
  assertEnv("GMAIL_PASSWORD");
  assertEnv("SUPABASE_URL");
  assertEnv("SUPABASE_SERVICE_ROLE");

  console.log("IMAP host:", config.imap.host);
  console.log("IMAP user:", process.env.GMAIL_EMAIL);

  // --- connect ---
  const connection = await imaps.connect(config);

  // Gmail: ouvrir la boîte principale
  await connection.openBox("INBOX");

  // Lire les courriels non lus
  const messages = await connection.search(["UNSEEN"], { bodies: [""] });
  console.log("UNSEEN mails:", messages.length);

  for (const item of messages) {
    const bodyPart = item.parts.find((p) => p.which === "");
    const parsed = await simpleParser(bodyPart.body);

    let uploadedAny = false;

    for (const att of parsed.attachments || []) {
      const fn = (att.filename || "").toLowerCase();
      if (fn.endsWith(".pdf")) {
        uploadedAny = true;
        console.log("Found PDF attachment:", att.filename);
        await uploadToSupabase(att.filename, att.content);
      }
    }

    // Marquer comme lu seulement si on a traité au moins un PDF
    if (uploadedAny) {
      connection.addFlags(item.attributes.uid, ["\\Seen"]);
      console.log("Marked mail as Seen:", item.attributes.uid);
    } else {
      console.log("No PDF in mail, leaving UNSEEN:", item.attributes.uid);
    }
  }

  connection.end();
  console.log("Done.");
})().catch((err) => {
  console.error("FATAL:", err?.message || err);
  process.exit(1);
});
