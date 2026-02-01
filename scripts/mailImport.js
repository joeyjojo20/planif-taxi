import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";
import FormData from "form-data";

const config = {
  imap: {
    user: process.env.OUTLOOK_EMAIL,
    password: process.env.OUTLOOK_PASSWORD,

    host: "imap.gmail.com",
    port: 993,
    tls: true,

    // IMPORTANT : on laisse le check TLS actif (sécuritaire)
    tlsOptions: { servername: "imap.gmail.com" },

    authTimeout: 20000,
  },
};


const bucket = "pdfFiles";

async function uploadToSupabase(filename, buffer) {
  const form = new FormData();
  form.append("file", buffer, filename);

  const path = `${Date.now()}-${filename}`;

  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
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
  const connection = await imaps.connect(config);
  await connection.openBox("INBOX");

  const messages = await connection.search(["UNSEEN"], { bodies: [""] });

  console.log("UNSEEN mails:", messages.length);

  for (const item of messages) {
    const bodyPart = item.parts.find((p) => p.which === "");
    const parsed = await simpleParser(bodyPart.body);

    let uploadedAny = false;

    for (const att of parsed.attachments || []) {
      if (att.filename?.toLowerCase().endsWith(".pdf")) {
        uploadedAny = true;
        console.log("Uploading attachment:", att.filename);
        await uploadToSupabase(att.filename, att.content);
      }
    }

    // marque comme lu seulement si on a trouvé un PDF
    if (uploadedAny) {
      connection.addFlags(item.attributes.uid, ["\\Seen"]);
    }
  }

  connection.end();
})();
