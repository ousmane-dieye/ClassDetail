// =============================================================================
// verify-s2.mjs — Vérifie (avant/après) la vulnérabilité S2
//                 « usurpation des annonces » sur la base Supabase.
// =============================================================================
// Usage :
//   node scripts/verify-s2.mjs
//
// Lit les clés dans .env.local (comme verify-s1.mjs / create-admin.mjs).
// Crée 3 comptes jetables (STUDENT, DELEGATE, ADMIN) dans une classe, teste
// l'API REST chat_messages en leur nom, puis NETTOIE TOUS les artefacts créés
// (messages, profils, comptes Auth).
//
// Matrice testée :
//   STUDENT is_announcement=false  -> doit fonctionner (201)
//   STUDENT is_announcement=true   -> doit être REFUSÉ (4xx)  [avant: 201 => VULNERABLE]
//   DELEGATE is_announcement=true  -> doit fonctionner (201)
//   ADMIN    is_announcement=true  -> doit fonctionner (201)
//   STUDENT PATCH message existant -> doit être bloqué (0 ligne affectée)
//
// Verdict :
//   - VULNERABLE : un STUDENT a inséré is_announcement=true → la migration
//                   0010 n'est PAS (encore) appliquée.
//   - PROTEGE    : l'insertion d'annonce par STUDENT est refusée.
//   - ERREUR     : problème d'environnement/réseau (rien n'a été modifié).
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

async function createTestAccount(base, adminHeaders, stamp, role, classId) {
  const email = `s2-${role.toLowerCase()}-${stamp}@classpulse.app`;
  const password = `S2Verify-${stamp}!`;
  const user = await req(base, "/auth/v1/admin/users", {
    method: "POST",
    headers: adminHeaders,
    body: { email, password, email_confirm: true },
  });
  if (user.status !== 200 || !user.data?.id) {
    throw new Error(`création compte ${role} : HTTP ${user.status} ${JSON.stringify(user.data)}`);
  }
  const userId = user.data.id;
  const profile = await req(base, "/rest/v1/profiles", {
    method: "POST",
    headers: adminHeaders,
    body: { id: userId, first_name: "S2Verify", last_name: role, email, role, class_id: classId },
  });
  if (profile.status !== 201) {
    throw new Error(`création profil ${role} : HTTP ${profile.status} ${JSON.stringify(profile.data)}`);
  }
  await req(base, "/rest/v1/registration_requests", {
    method: "POST",
    headers: adminHeaders,
    body: { user_id: userId, class_id: classId, status: "ACCEPTED" },
  });
  const token = await req(base, "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: adminHeaders.apikey, Authorization: `Bearer ${adminHeaders.apikey}` },
    body: { email, password },
  });
  if (token.status !== 200 || !token.data?.access_token) {
    throw new Error(`connexion ${role} : HTTP ${token.status} ${JSON.stringify(token.data)}`);
  }
  return {
    id: userId,
    email,
    headers: { apikey: adminHeaders.apikey, Authorization: `Bearer ${token.data.access_token}` },
  };
}

async function main() {
  const env = loadEnv(path.join(root, ".env.local"));
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !anonKey || !serviceKey) {
    console.error("ERREUR : clés absentes de .env.local (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "User-Agent": "supabase-js/2.45.4 node",
  };
  const anonAuth = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ids = [];
  const results = {};

  try {
    // ---- 1. Une classe existante pour placer les comptes de test ----
    const classes = await req(base, "/rest/v1/classes?select=id&limit=1", { headers: anonAuth });
    if (classes.status !== 200 || !Array.isArray(classes.data) || classes.data.length === 0) {
      console.error("ERREUR : aucune classe trouvée.");
      process.exit(1);
    }
    const classId = classes.data[0].id;

    // ---- 2. Comptes jetables STUDENT / DELEGATE / ADMIN ----
    const student = await createTestAccount(base, adminHeaders, stamp, "STUDENT", classId);
    const delegate = await createTestAccount(base, adminHeaders, stamp, "DELEGATE", classId);
    const admin = await createTestAccount(base, adminHeaders, stamp, "ADMIN", classId);
    ids.push(student.id, delegate.id, admin.id);

    const probeContent = `S2-PROBE-${stamp}`;

    // ---- 3. STUDENT : message normal (is_announcement=false) ----
    const normal = await req(base, "/rest/v1/chat_messages?select=id", {
      method: "POST",
      headers: { ...student.headers, Prefer: "return=representation" },
      body: { class_id: classId, author_id: student.id, content: `${probeContent}-normal`, is_announcement: false },
    });
    results.studentNormal = { status: normal.status, ok: normal.status === 201 };

    // ---- 4. STUDENT : annonce (is_announcement=true) — SONDE PRINCIPALE ----
    const ann = await req(base, "/rest/v1/chat_messages", {
      method: "POST",
      headers: student.headers,
      body: { class_id: classId, author_id: student.id, content: `${probeContent}-ann`, is_announcement: true },
    });
    results.studentAnnouncement = {
      status: ann.status,
      vuln: ann.status === 201,
      data: ann.status >= 400 ? ann.data : null,
    };

    // ---- 5. STUDENT : tentative de modification d'un message existant ----
    let patched = { status: null, rows: null };
    if (normal.status === 201) {
      const messageId = Array.isArray(normal.data) ? normal.data[0]?.id : normal.data?.id;
      if (messageId) {
        const patch = await req(base, `/rest/v1/chat_messages?id=eq.${messageId}`, {
          method: "PATCH",
          headers: { ...student.headers, Prefer: "return=representation" },
          body: { is_announcement: true },
        });
        patched = {
          status: patch.status,
          rows: Array.isArray(patch.data) ? patch.data.length : patch.data,
          flipped: Array.isArray(patch.data) && patch.data.some((r) => r?.is_announcement === true),
        };
      }
    }
    results.studentPatch = patched;

    // ---- 6. DELEGATE : annonce (doit fonctionner) ----
    const dAnn = await req(base, "/rest/v1/chat_messages", {
      method: "POST",
      headers: delegate.headers,
      body: { class_id: classId, author_id: delegate.id, content: `${probeContent}-del`, is_announcement: true },
    });
    results.delegateAnnouncement = { status: dAnn.status, ok: dAnn.status === 201 };

    // ---- 7. ADMIN : annonce (doit fonctionner) ----
    const aAnn = await req(base, "/rest/v1/chat_messages", {
      method: "POST",
      headers: admin.headers,
      body: { class_id: classId, author_id: admin.id, content: `${probeContent}-adm`, is_announcement: true },
    });
    results.adminAnnouncement = { status: aAnn.status, ok: aAnn.status === 201 };

    // ---- 8. Verdict ----
    console.log("\n== Matrice S2 ==");
    console.log(`STUDENT  normal            : HTTP ${results.studentNormal.status} (attendu 201)`);
    console.log(`STUDENT  annonce           : HTTP ${results.studentAnnouncement.status} (attendu 4xx)`);
    console.log(`STUDENT  PATCH message     : HTTP ${results.studentPatch.status ?? "-"} / ${JSON.stringify(results.studentPatch.rows)} (attendu 0 ligne)`);
    console.log(`DELEGATE annonce           : HTTP ${results.delegateAnnouncement.status} (attendu 201)`);
    console.log(`ADMIN    annonce           : HTTP ${results.adminAnnouncement.status} (attendu 201)`);

    const regressions = [];
    if (!results.studentNormal.ok) regressions.push("STUDENT message normal refusé (régression)");
    if (!results.delegateAnnouncement.ok) regressions.push("DELEGATE annonce refusée (régression)");
    if (!results.adminAnnouncement.ok) regressions.push("ADMIN annonce refusée (régression)");

    if (results.studentAnnouncement.vuln) {
      console.log(`\nVERDICT : VULNERABLE — un STUDENT a inséré is_announcement=true via l'API REST (HTTP ${results.studentAnnouncement.status}).`);
      console.log("  La migration 0010 n'est PAS (encore) appliquée sur cette base.");
      console.log("  Appliquez supabase/migrations/0010_s2_chat_announcements_restriction.sql dans le SQL Editor Supabase puis relancez ce script.");
    } else {
      console.log(`\nVERDICT : PROTEGE — l'insertion d'annonce par STUDENT est refusée (HTTP ${results.studentAnnouncement.status}).`);
    }

    if (results.studentPatch.flipped) {
      console.log("  ATTENTION : un STUDENT a PU modifier un message existant en annonce (contournement).");
    } else if (results.studentPatch.rows !== null) {
      console.log(`  Contournement UPDATE : bloqué (${JSON.stringify(results.studentPatch.rows)} ligne affectée).`);
    }

    if (regressions.length > 0) {
      console.log("\nRÉGRESSIONS DÉTECTÉES :");
      regressions.forEach((r) => console.log(`  - ${r}`));
      process.exitCode = 3;
    }
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    // ---- 9. Nettoyage systématique ----
    for (const id of ids) {
      await req(base, `/rest/v1/chat_messages?author_id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/rest/v1/registration_requests?user_id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/rest/v1/profiles?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      const del = await req(base, `/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
      if (del.status === 200 || del.status === 204) console.log(`Nettoyage : compte ${id} supprimé.`);
      else console.log(`Nettoyage : suppression ${id} -> HTTP ${del.status}.`);
    }
  }
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
