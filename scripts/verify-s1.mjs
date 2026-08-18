// =============================================================================
// verify-s1.mjs — Vérifie (et corrige la vérification de) la vulnérabilité S1
//                 « fuite des emails des profils » sur la base Supabase.
// =============================================================================
// Usage :
//   node scripts/verify-s1.mjs
//
// Lit les clés dans .env.local (comme create-admin.mjs).
// Crée un compte STUDENT jetable, teste l'API REST en son nom, puis NETTOIE
// TOUS les artefacts créés (compte Auth, profil, demande d'inscription).
//
// Verdict :
//   - VULNERABLE  : un STUDENT lit l'email des autres membres → la migration
//                   0009 n'est PAS (encore) appliquée.
//   - PROTEGE     : la requête échoue (42501) ou ne renvoie aucun email
//                   d'autrui → migration 0009 appliquée.
//   - ERREUR      : problème d'environnement/réseau (rien n'a été modifié).
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function req(base, pathname, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  const env = loadEnv(path.join(root, ".env.local"));
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !anonKey || !serviceKey) {
    console.error("ERREUR : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY absents de .env.local");
    process.exit(1);
  }

  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "User-Agent": "supabase-js/2.45.4 node",
  };

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const email = `s1-verify-${stamp}@classpulse.app`;
  const password = `S1Verify-${stamp}!`;
  let userId = null;
  let created = false;

  try {
    // ---- 1. Une classe existante (pour placer le STUDENT de test) ----
    const classes = await req(base, "/rest/v1/classes?select=id&limit=1", {
      headers: authHeaders,
    });
    if (classes.status !== 200 || !Array.isArray(classes.data) || classes.data.length === 0) {
      console.error("ERREUR : aucune classe trouvée — impossible de créer le contexte de test.");
      process.exit(1);
    }
    const classId = classes.data[0].id;

    // ---- 2. Compte Auth jetable ----
    const createdUser = await req(base, "/auth/v1/admin/users", {
      method: "POST",
      headers: adminHeaders,
      body: { email, password, email_confirm: true },
    });
    if (createdUser.status !== 200 || !createdUser.data?.id) {
      console.error("ERREUR création compte de test :", createdUser.status, JSON.stringify(createdUser.data));
      process.exit(1);
    }
    userId = createdUser.data.id;
    created = true;

    // ---- 3. Profil STUDENT + demande ACCEPTED (contexte de classe) ----
    const profile = await req(base, "/rest/v1/profiles", {
      method: "POST",
      headers: adminHeaders,
      body: {
        id: userId,
        first_name: "S1Verify",
        last_name: "Probe",
        email,
        role: "STUDENT",
        class_id: classId,
      },
    });
    if (profile.status !== 201) {
      console.error("ERREUR création profil de test :", profile.status, JSON.stringify(profile.data));
      process.exit(1);
    }
    const regreq = await req(base, "/rest/v1/registration_requests", {
      method: "POST",
      headers: adminHeaders,
      body: { user_id: userId, class_id: classId, status: "ACCEPTED" },
    });
    if (regreq.status !== 201) {
      console.error("ERREUR création demande d'inscription de test :", regreq.status, JSON.stringify(regreq.data));
      process.exit(1);
    }

    // ---- 4. Connexion STUDENT (session réelle) ----
    const token = await req(base, "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: authHeaders,
      body: { email, password },
    });
    if (token.status !== 200 || !token.data?.access_token) {
      console.error("ERREUR connexion du compte de test :", token.status, JSON.stringify(token.data));
      process.exit(1);
    }
    const studentHeaders = {
      apikey: anonKey,
      Authorization: `Bearer ${token.data.access_token}`,
      "User-Agent": "supabase-js/2.45.4 node",
    };

    // ---- 5. Sonde : lire first_name,email de la classe ----
    const probe = await req(base, "/rest/v1/profiles?select=first_name,email", {
      headers: studentHeaders,
    });

    // ---- 6. Verdict ----
    let verdict = "ERREUR : réponse inattendue";
    if (probe.status >= 400) {
      const msg = JSON.stringify(probe.data);
      verdict = `PROTEGE — API REST a refusé la requête (HTTP ${probe.status}${msg ? " : " + msg : ""}).`;
      console.log(`\nVERDICT : ${verdict}`);
      console.log("  La migration 0009 est bien appliquée : SELECT(email) est refusé pour le rôle authenticated.");
    } else if (Array.isArray(probe.data) && probe.data.length > 0) {
      const others = probe.data.filter((p) => p.email && p.email !== email);
      if (others.length > 0) {
        verdict = `VULNERABLE — ${others.length} email(s) de la classe lus via l'API REST (ex : ${others[0].email}).`;
        console.log(`\nVERDICT : ${verdict}`);
        console.log("  La migration 0009 n'est PAS (encore) appliquée sur cette base.");
        console.log("  Appliquez supabase/migrations/0009_s1_profiles_email_restriction.sql dans le SQL Editor Supabase puis relancez ce script.");
      } else {
        verdict = "PROTEGE — aucune donnée lue (table vide ou seul votre propre email, aucun email d'autrui).";
        console.log(`\nVERDICT : ${verdict}`);
      }
    } else {
      verdict = "PROTEGE — aucune donnée lue (table vide).";
      console.log(`\nVERDICT : ${verdict}`);
    }

    console.log(`\nDétail de la sonde (HTTP ${probe.status}) :`);
    console.log(JSON.stringify(probe.data, null, 2));
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    // ---- 7. Nettoyage systématique (aucune trace en base) ----
    if (userId) {
      await req(base, `/rest/v1/registration_requests?user_id=eq.${userId}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE", headers: adminHeaders });
      const del = await req(base, `/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
      console.log(del.status === 200 || del.status === 204
        ? "Nettoyage : compte de test supprimé."
        : `Nettoyage : suppression du compte renvoyé HTTP ${del.status}.`);
    }
  }
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
