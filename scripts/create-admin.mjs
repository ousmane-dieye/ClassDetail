// Crée un compte ADMIN directement en base (Auth + profil), sans passer par l'UI.
//
// Usage :
//   node scripts/create-admin.mjs <email> <motdepasse>
//   ex. : node scripts/create-admin.mjs admin@classpulse.app "Admin@2026"
//
// Lit les clés dans .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[2].startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv(path.join(root, ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("ERREUR : NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents de .env.local");
    process.exit(1);
  }

  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage : node scripts/create-admin.mjs <email> <motdepasse>");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  const { data, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId = data?.user?.id;
  if (authError || !userId) {
    // Email peut-être déjà créé (exécution précédente) -> on le retrouve.
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = (users?.users ?? []).find((u) => u.email === email);
    if (!existing) throw authError ?? new Error("Impossible de créer l'utilisateur");
    userId = existing.id;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    first_name: "Admin",
    last_name: "ClassPulse",
    email,
    role: "ADMIN",
    class_id: null,
  });
  if (profileError) {
    if (profileError.code === "23505") {
      console.log(`Le profil existe déjà : ${email} — aucun changement.`);
      return;
    }
    throw profileError;
  }

  console.log(`ADMIN créé : ${email} (class_id vide -> stats globales, gestion de toutes les classes)`);
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
