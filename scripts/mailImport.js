import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";
import FormData from "form-data";

const config = {
  imap: {
    user: process.env.OUTLOOK_EMAIL,
    password: process.env.OUTLOOK_PASSWORD,
    host: "outlook.office365.com",
    port: 993,
    tls: true,
    authTimeout: 10000
  }
};

const bucket = "pdfFiles";

async function uploadToSupabase(filename, buffer) {
  const form = new FormData();
  form.append("file", buffer, filename);

  await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${Date.now()}-${filename}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`
      },
      body: form
    }
  );
}

(async () => {
  const connection = await imaps.connect(config);
  await connection.openBox("INBOX");

  const messages = await connection.search(["UNSEEN"], { bodies: [""] });

  for (const item of messages) {
    const parsed = await simpleParser(item.parts[0].body);

    for (const att of parsed.attachments) {
      if (att.filename?.toLowerCase().endsWith(".pdf")) {
        console.log("Uploading:", att.filename);
        await uploadToSupabase(att.filename, att.content);
      }
    }

    connection.addFlags(item.attributes.uid, ["\\Seen"]);
  }

  connection.end();
})();
