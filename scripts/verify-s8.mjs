// =============================================================================
// verify-s8.mjs — Vérifie S8 « droits du délégué alignés (documents / hints) ».
// =============================================================================
// Usage :
//   node scripts/verify-s8.mjs
//
// Lit les clés dans .env.local (comme les autres scripts verify-*.mjs).
//
// Règle métier vérifiée (via l'API REST directe, accès = colonnes de la
// policy DELETE : auteur OU délégué de la classe OU admin) :
//   T1    STUDENT DELETE son PROPRE document        -> 1 ligne (204)
//   T2    STUDENT DELETE le document d'un AUTRE     -> 0 ligne (refus)
//   T3    DELEGATE DELETE le document d'un étudiant de SA classe -> 1 ligne
//   T4    DELEGATE DELETE le document d'une AUTRE classe -> 0 ligne (refus)
//   T5    ADMIN DELETE n'importe quel document      -> 1 ligne
//   T6    PENDING DELETE n'importe quel document    -> 0 ligne (refus)
//   T7    DELEGATE DELETE le hint d'un étudiant de SA classe -> 1 ligne
//   T8    STUDENT DELETE le hint d'un AUTRE         -> 0 ligne (refus)
//
// NB : la policy RLS DELETE est la seule barrière testée ici (chaque requête
// passe par l'API REST avec le jeton de l'utilisateur concerné).
//
// Nettoyage systématique de tous les artefacts créés.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

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

async function createClass(base, adminHeaders, name) {
  const res = await req(base, "/rest/v1/classes", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: { name, level: "Licence 3", academic_year: "2026" },
  });
  if (res.status !== 201 || !res.data?.[0]?.id) {
    throw new Error(`création classe : HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data[0].id;
}

async function createSubject(base, adminHeaders, classId, name) {
  const res = await req(base, "/rest/v1/subjects", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: { class_id: classId, name },
  });
  if (res.status !== 201 || !res.data?.[0]?.id) {
    throw new Error(`création matière : HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data[0].id;
}

async function createUserWithProfile(base, adminHeaders, email, password, { role, classId = null }) {
  const user = await req(base, "/auth/v1/admin/users", {
    method: "POST",
    headers: adminHeaders,
    body: { email, password, email_confirm: true },
  });
  if (user.status !== 200 || !user.data?.id) {
    throw new Error(`création compte : HTTP ${user.status} ${JSON.stringify(user.data)}`);
  }
  const userId = user.data.id;
  const profile = await req(base, "/rest/v1/profiles", {
    method: "POST",
    headers: adminHeaders,
    body: { id: userId, first_name: "S8", last_name: "Probe", email, role, class_id: classId },
  });
  if (profile.status !== 201) {
    throw new Error(`création profil : HTTP ${profile.status} ${JSON.stringify(profile.data)}`);
  }
  return { id: userId, email, password };
}

async function createResource(base, adminHeaders, table, { classId, subjectId, authorId, title }) {
  const body =
    table === "documents"
      ? { class_id: classId, subject_id: subjectId, title, drive_url: "https://drive.google.com/fake", author_id: authorId }
      : { class_id: classId, subject_id: subjectId, title, year: "2023", type: "AUTRE", drive_url: "https://drive.google.com/fake", author_id: authorId };
  const res = await req(base, `/rest/v1/${table}`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body,
  });
  if (res.status !== 201 || !res.data?.[0]?.id) {
    throw new Error(`création ${table} : HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data[0].id;
}

async function signIn(base, anonKey, email, password) {
  const token = await req(base, "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: { email, password },
  });
  if (!token.data?.access_token) {
    throw new Error(`connexion : HTTP ${token.status} ${JSON.stringify(token.data)}`);
  }
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token.data.access_token}`,
    "User-Agent": "supabase-js/2.45.4 node",
  };
}

async function main() {
  const env = loadEnv(path.join(root, ".env.local"));
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !anonKey || !serviceKey) {
    console.error("ERREUR : clés absentes de .env.local.");
    process.exit(1);
  }

  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "User-Agent": "supabase-js/2.45.4 node",
  };

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const userIds = [];
  const resourceIds = [];
  const classIds = [];
  const subjectIds = [];
  const regReqIds = [];
  const results = {};

  try {
    // ---- Préparation : classes, matières, comptes, ressources ----
    const c1 = await createClass(base, adminHeaders, `S8-C1-${stamp}`);
    const c2 = await createClass(base, adminHeaders, `S8-C2-${stamp}`);
    classIds.push(c1, c2);
    const s1 = await createSubject(base, adminHeaders, c1, "Réseaux");
    const s2 = await createSubject(base, adminHeaders, c2, "Maths");
    subjectIds.push(s1, s2);

    const studentA = await createUserWithProfile(base, adminHeaders, `s8-a-${stamp}@classpulse.app`, `S8Verify-${stamp}!`, {
      role: "STUDENT",
      classId: c1,
    });
    const studentB = await createUserWithProfile(base, adminHeaders, `s8-b-${stamp}@classpulse.app`, `S8Verify-${stamp}!`, {
      role: "STUDENT",
      classId: c1,
    });
    const studentC = await createUserWithProfile(base, adminHeaders, `s8-c-${stamp}@classpulse.app`, `S8Verify-${stamp}!`, {
      role: "STUDENT",
      classId: c2,
    });
    const delegate = await createUserWithProfile(base, adminHeaders, `s8-del-${stamp}@classpulse.app`, `S8Verify-${stamp}!`, {
      role: "DELEGATE",
      classId: c1,
    });
    const admin = await createUserWithProfile(base, adminHeaders, `s8-admin-${stamp}@classpulse.app`, `S8Verify-${stamp}!`, {
      role: "ADMIN",
    });
    const pending = await createUserWithProfile(base, adminHeaders, `s8-pend-${stamp}@classpulse.app`, `S8Verify-${stamp}!`, {
      role: "STUDENT",
      classId: c1,
    });
    userIds.push(studentA.id, studentB.id, studentC.id, delegate.id, admin.id, pending.id);

    // Demande PENDING (l'utilisateur est en attente d'acceptation).
    const rr = await req(base, "/rest/v1/registration_requests", {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=representation" },
      body: { user_id: pending.id, class_id: c1, status: "PENDING" },
    });
    if (rr.status !== 201 || !rr.data?.[0]?.id) {
      throw new Error(`création demande PENDING : HTTP ${rr.status} ${JSON.stringify(rr.data)}`);
    }
    regReqIds.push(rr.data[0].id);

    // Documents : docA (de A, c1), docB (de B, c1), docC (de C, c2), docD (de B, c1).
    const docA = await createResource(base, adminHeaders, "documents", { classId: c1, subjectId: s1, authorId: studentA.id, title: "DocA" });
    const docB = await createResource(base, adminHeaders, "documents", { classId: c1, subjectId: s1, authorId: studentB.id, title: "DocB" });
    const docC = await createResource(base, adminHeaders, "documents", { classId: c2, subjectId: s2, authorId: studentC.id, title: "DocC" });
    const docD = await createResource(base, adminHeaders, "documents", { classId: c1, subjectId: s1, authorId: studentB.id, title: "DocD" });
    const docE = await createResource(base, adminHeaders, "documents", { classId: c1, subjectId: s1, authorId: studentB.id, title: "DocE" });
    // Hints : hintB1/hintB2 (de B, c1), hintC (de C, c2).
    const hintB1 = await createResource(base, adminHeaders, "hints", { classId: c1, subjectId: s1, authorId: studentB.id, title: "HintB1" });
    const hintB2 = await createResource(base, adminHeaders, "hints", { classId: c1, subjectId: s1, authorId: studentB.id, title: "HintB2" });
    const hintC = await createResource(base, adminHeaders, "hints", { classId: c2, subjectId: s2, authorId: studentC.id, title: "HintC" });
    resourceIds.push(docA, docB, docC, docD, docE, hintB1, hintB2, hintC);

    const [headersA, headersB, headersDelegate, headersAdmin, headersPending] = await Promise.all([
      signIn(base, anonKey, studentA.email, studentA.password),
      signIn(base, anonKey, studentB.email, studentB.password),
      signIn(base, anonKey, delegate.email, delegate.password),
      signIn(base, anonKey, admin.email, admin.password),
      signIn(base, anonKey, pending.email, pending.password),
    ]);

    const del = (table, id, headers) =>
      req(base, `/rest/v1/${table}?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=representation" },
      });

    const rowCount = (res) => (Array.isArray(res.data) ? res.data.length : 0);

    // ---- T1 : STUDENT supprime son propre document ----
    const t1 = await del("documents", docA, headersA);
    results.t1 = rowCount(t1);
    console.log("\nT1 — STUDENT DELETE son propre document :");
    console.log(`  ${results.t1} ligne(s) (attendu : 1)`);

    // ---- T2 : STUDENT supprime le document d'un autre étudiant ----
    const t2 = await del("documents", docB, headersA);
    results.t2 = rowCount(t2);
    console.log("\nT2 — STUDENT DELETE le document d'un AUTRE étudiant :");
    console.log(`  ${results.t2} ligne(s) (attendu : 0 — refus)`);

    // ---- T3 : DELEGATE supprime le document d'un étudiant de sa classe ----
    const t3 = await del("documents", docB, headersDelegate);
    results.t3 = rowCount(t3);
    console.log("\nT3 — DELEGATE DELETE le document d'un étudiant de SA classe :");
    console.log(`  ${results.t3} ligne(s) (attendu : 1)`);

    // ---- T4 : DELEGATE supprime le document d'une AUTRE classe ----
    const t4 = await del("documents", docC, headersDelegate);
    results.t4 = rowCount(t4);
    console.log("\nT4 — DELEGATE DELETE le document d'une AUTRE classe :");
    console.log(`  ${results.t4} ligne(s) (attendu : 0 — refus)`);

    // ---- T5 : ADMIN supprime n'importe quel document ----
    const t5 = await del("documents", docD, headersAdmin);
    results.t5 = rowCount(t5);
    console.log("\nT5 — ADMIN DELETE n'importe quel document :");
    console.log(`  ${results.t5} ligne(s) (attendu : 1)`);

    // ---- T6 : PENDING supprime un document ----
    const t6 = await del("documents", docE, headersPending);
    results.t6 = rowCount(t6);
    console.log("\nT6 — PENDING DELETE un document :");
    console.log(`  ${results.t6} ligne(s) (attendu : 0 — refus)`);

    // ---- T7 : DELEGATE supprime le hint d'un étudiant de sa classe ----
    const t7 = await del("hints", hintB2, headersDelegate);
    results.t7 = rowCount(t7);
    console.log("\nT7 — DELEGATE DELETE le hint d'un étudiant de SA classe :");
    console.log(`  ${results.t7} ligne(s) (attendu : 1)`);

    // ---- T8 : STUDENT supprime le hint d'un autre étudiant ----
    const t8 = await del("hints", hintB1, headersA);
    results.t8 = rowCount(t8);
    console.log("\nT8 — STUDENT DELETE le hint d'un AUTRE étudiant :");
    console.log(`  ${results.t8} ligne(s) (attendu : 0 — refus)`);

    // ---- T9 : ADMIN supprime un hint d'une autre classe (contrôle global) ----
    const t9 = await del("hints", hintC, headersAdmin);
    results.t9 = rowCount(t9);
    console.log("\nT9 — ADMIN DELETE un hint d'une autre classe :");
    console.log(`  ${results.t9} ligne(s) (attendu : 1)`);

    // ---- Bilan ----
    const ok =
      results.t1 === 1 && results.t2 === 0 && results.t3 === 1 &&
      results.t4 === 0 && results.t5 === 1 && results.t6 === 0 &&
      results.t7 === 1 && results.t8 === 0 && results.t9 === 1;
    console.log(
      ok
        ? "\nVERDICT : S8 PROTEGE (base) — la règle de suppression est appliquée via REST pour chaque rôle."
        : "\nVERDICT : ATTENTION — au moins un test S8 a échoué (détails ci-dessus)."
    );
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    // ---- Nettoyage systématique ----
    for (const id of resourceIds) {
      await req(base, `/rest/v1/documents?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/rest/v1/hints?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
    }
    for (const id of regReqIds) {
      await req(base, `/rest/v1/registration_requests?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
    }
    for (const id of userIds) {
      await req(base, `/rest/v1/profiles?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
    }
    for (const id of subjectIds) {
      await req(base, `/rest/v1/subjects?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
    }
    for (const id of classIds) {
      await req(base, `/rest/v1/classes?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
    }
    console.log(`Nettoyage : ${resourceIds.length} ressource(s), ${regReqIds.length} demande(s), ${userIds.length} compte(s), ${subjectIds.length} matière(s), ${classIds.length} classe(s) supprimé(s).`);
  }
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
