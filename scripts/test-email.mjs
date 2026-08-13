#!/usr/bin/env node
/**
 * Test CLI de la configuration email administrateur (SMTP).
 *
 * Usage :
 *   node scripts/test-email.mjs
 *   node scripts/test-email.mjs destinataire@example.com
 *
 * Lit les variables EMAIL_* dans .env.local (jamais de secret dans le code,
 * jamais affiché). Envoie un email de test depuis EMAIL_FROM.
 */

import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

function loadEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    vars[key] = value.replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...process.env, ...loadEnvFile(path.resolve(process.cwd(), ".env.local")) };

const from = env.EMAIL_FROM || "admin@votredomaine.com";
const fromName = env.EMAIL_FROM_NAME || "Administration";
const to = process.argv[2] || from;
const secureRaw = env.EMAIL_SECURE;
const secure =
  secureRaw === undefined || secureRaw === ""
    ? undefined
    : !["false", "0", "no", "off"].includes(String(secureRaw).toLowerCase());

function fail(msg) {
  console.error("✗ " + msg);
  process.exitCode = 1;
}

async function main() {
  if (!env.EMAIL_HOST || !env.EMAIL_USER || !env.EMAIL_PASSWORD) {
    fail(
      "Email SMTP non configuré : renseignez EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD et EMAIL_FROM dans .env.local"
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: Number(env.EMAIL_PORT || 465),
    secure,
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD },
  });

  console.log(`→ Test de l'expéditeur : ${fromName} <${from}>`);
  console.log(`→ Destinataire       : ${to}`);
  console.log(`→ Connexion à        : ${env.EMAIL_HOST}:${env.EMAIL_PORT || 465}`);

  try {
    await transporter.verify();
    console.log("✓ Connexion SMTP réussie");
  } catch (err) {
    fail(`Connexion SMTP impossible : ${err instanceof Error ? err.message : err}`);
    return;
  }

  const info = await transporter.sendMail({
    from: `${fromName} <${from}>`,
    to,
    subject: `Email de test — ${env.PLATFORM_NAME || "ClassPulse"}`,
    text: "Cet email confirme que la configuration email administrateur fonctionne correctement.",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <h2 style="color:#111827;">Email de test réussi</h2>
      <p>Cet email confirme que la configuration <strong>email administrateur</strong> fonctionne correctement.</p>
      <p style="color:#475569;font-size:13px;">Envoyé depuis l'adresse de l'administration.</p>
    </div>`,
  });

  console.log(`✓ Email envoyé (messageId : ${info.messageId})`);
  console.log(`✓ Destinataire : ${to}`);
  console.log(`✓ Date : ${new Date().toLocaleString("fr-FR")}`);
  console.log("Test terminé avec succès.");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
