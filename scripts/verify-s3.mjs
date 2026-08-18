// =============================================================================
// verify-s3.mjs — Vérifie (avant/après) la vulnérabilité S3
//                 « relations cross-class » sur la base Supabase.
// =============================================================================
// Usage :
//   node scripts/verify-s3.mjs
//
// Lit les clés dans .env.local (comme verify-s1/s2.mjs, create-admin.mjs).
// Crée un DELEGATE jetable dans une classe, teste l'API REST sur les 4 tables
// (tasks, documents, hints, recordings), puis NETTOIE tous les artefacts.
//
// Matrice testée (par table) :
//   1. INSERT sujet même classe           -> doit fonctionner (201)
//   2. INSERT sujet autre classe          -> doit être REFUSÉ (4xx)  [avant: 201 => VULNERABLE]
//   3. UPDATE class_id -> classe autre    -> doit être REFUSÉ (4xx)
//   4. UPDATE subject_id -> matière autre -> doit être REFUSÉ (4xx)
//
// NB : les tests d'UPDATE sont faits via le service role pour isoler la
// garantie DATABASE (contrainte FK composite), indépendamment de la RLS
// (documents/hints n'ont de toute façon pas de policy UPDATE).
//
// Verdict :
//   - VULNERABLE : une insertion cross-class a été acceptée → migration 0011
//                  PAS (encore) appliquée.
//   - PROTEGE    : toutes les insertions cross-class sont refusées.
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
  const anonAuth = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ids = [];
  const results = {};

  const buildBody = (table, classId, subjectId, authorId) => {
    const title = `S3-${stamp}-${table}`;
    const baseRow = { class_id: classId, subject_id: subjectId };
    switch (table) {
      case "tasks":
        return { ...baseRow, creator_id: authorId, title, due_date: "2026-12-31T23:59:00.000Z", type: "EXERCISE" };
      case "documents":
        return { ...baseRow, author_id: authorId, title, drive_url: "https://example.com/s3-probe" };
      case "hints":
        return { ...baseRow, author_id: authorId, title, year: "2026-2027", drive_url: "https://example.com/s3-probe" };
      case "recordings":
        return { ...baseRow, creator_id: authorId, title, date: "2026-08-20", drive_url: "https://example.com/s3-probe" };
      default:
        throw new Error(`table inconnue : ${table}`);
    }
  };

  try {
    // ---- 1. Contexte : deux classes avec matières (via service role : la RLS
    //      masque les matières aux non-membres, on a besoin des 2 classes) ----
    const subjects = await req(base, "/rest/v1/subjects?select=id,class_id", { headers: adminHeaders });
    if (subjects.status !== 200 || !Array.isArray(subjects.data) || subjects.data.length < 2) {
      console.error("ERREUR : matière(s) insuffisantes pour le test.");
      process.exitCode = 1;
      return;
    }
    const classA = subjects.data[0].class_id; // classe du DELEGATE de test
    const subjectSame = subjects.data[0].id;
    const subjectCross = subjects.data.find((s) => s.class_id !== classA);
    if (!subjectCross) {
      console.error("ERREUR : aucune matière d'une autre classe pour le test cross-class.");
      process.exitCode = 1;
      return;
    }

    // ---- 2. DELEGATE jetable dans classA ----
    const email = `s3-del-${stamp}@classpulse.app`;
    const password = `S3Verify-${stamp}!`;
    const user = await req(base, "/auth/v1/admin/users", {
      method: "POST",
      headers: adminHeaders,
      body: { email, password, email_confirm: true },
    });
    if (user.status !== 200 || !user.data?.id) {
      console.error("ERREUR création compte DELEGATE :", user.status, JSON.stringify(user.data));
      process.exit(1);
    }
    const delegateId = user.data.id;
    ids.push(delegateId);
    await req(base, "/rest/v1/profiles", {
      method: "POST",
      headers: adminHeaders,
      body: { id: delegateId, first_name: "S3Verify", last_name: "Delegate", email, role: "DELEGATE", class_id: classA },
    });
    await req(base, "/rest/v1/registration_requests", {
      method: "POST",
      headers: adminHeaders,
      body: { user_id: delegateId, class_id: classA, status: "ACCEPTED" },
    });
    const token = await req(base, "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: anonAuth,
      body: { email, password },
    });
    if (token.status !== 200 || !token.data?.access_token) {
      console.error("ERREUR connexion DELEGATE :", token.status, JSON.stringify(token.data));
      process.exit(1);
    }
    const delegateHeaders = {
      apikey: anonKey,
      Authorization: `Bearer ${token.data.access_token}`,
      "User-Agent": "supabase-js/2.45.4 node",
    };

    // ---- 3. Tests par table ----
    for (const table of ["tasks", "documents", "hints", "recordings"]) {
      const res = {};

      // 1. INSERT même classe (via DELEGATE) — sert aussi de base aux tests UPDATE
      const same1 = await req(base, `/rest/v1/${table}?select=id`, {
        method: "POST",
        headers: { ...delegateHeaders, Prefer: "return=representation" },
        body: buildBody(table, classA, subjectSame, delegateId),
      });
      const same2 = await req(base, `/rest/v1/${table}?select=id`, {
        method: "POST",
        headers: { ...delegateHeaders, Prefer: "return=representation" },
        body: buildBody(table, classA, subjectSame, delegateId),
      });
      res.sameClassInsert = same1.status;
      const id1 = Array.isArray(same1.data) ? same1.data[0]?.id : same1.data?.id;
      const id2 = Array.isArray(same2.data) ? same2.data[0]?.id : same2.data?.id;

      // 2. INSERT cross-class (via DELEGATE) — SONDE PRINCIPALE
      const cross = await req(base, `/rest/v1/${table}`, {
        method: "POST",
        headers: delegateHeaders,
        body: buildBody(table, classA, subjectCross.id, delegateId),
      });
      res.crossClassInsert = cross.status;
      res.vuln = cross.status === 201;

      // 3/4. UPDATE via service role (isole la FK composite)
      let updateClass = { status: null, rows: null };
      if (id1) {
        const patch = await req(base, `/rest/v1/${table}?id=eq.${id1}`, {
          method: "PATCH",
          headers: { ...adminHeaders, Prefer: "return=representation" },
          body: { class_id: subjectCross.class_id },
        });
        updateClass = { status: patch.status, rows: Array.isArray(patch.data) ? patch.data.length : patch.data };
      }
      let updateSubject = { status: null, rows: null };
      if (id2) {
        const patch = await req(base, `/rest/v1/${table}?id=eq.${id2}`, {
          method: "PATCH",
          headers: { ...adminHeaders, Prefer: "return=representation" },
          body: { subject_id: subjectCross.id },
        });
        updateSubject = { status: patch.status, rows: Array.isArray(patch.data) ? patch.data.length : patch.data };
      }
      res.updateClass = updateClass;
      res.updateSubject = updateSubject;
      results[table] = res;
    }

    // ---- 4. Affichage + verdict ----
    console.log("\n== Matrice S3 (attendu : 201 / 4xx / 4xx / 4xx) ==");
    const tables = Object.keys(results);
    for (const table of tables) {
      const r = results[table];
      console.log(
        `${table.padEnd(10)} INSERT même classe: ${r.sameClassInsert} | cross: ${r.crossClassInsert}${r.vuln ? "  <-- VULNERABLE" : ""} | ` +
          `UPD class: ${r.updateClass.status}/${JSON.stringify(r.updateClass.rows)} | UPD subject: ${r.updateSubject.status}/${JSON.stringify(r.updateSubject.rows)}`
      );
    }

    const vulnTables = tables.filter((t) => results[t].vuln);
    const regressions = tables.filter((t) => results[t].sameClassInsert !== 201);

    if (vulnTables.length > 0) {
      console.log(`\nVERDICT : VULNERABLE — insertion cross-class acceptée (${vulnTables.join(", ")}) via l'API REST.`);
      console.log("  La migration 0011 n'est PAS (encore) appliquée sur cette base.");
      console.log("  Appliquez supabase/migrations/0011_s3_cross_class_restriction.sql dans le SQL Editor Supabase puis relancez ce script.");
    } else {
      console.log("\nVERDICT : PROTEGE — toute insertion cross-class est refusée par la base.");
    }

    for (const table of tables) {
      const r = results[table];
      if (r.updateClass.status !== null && r.updateClass.status < 400 && r.updateClass.rows > 0)
        console.log(`  ATTENTION ${table} : le changement de class_id vers une autre classe a été accepté.`);
      if (r.updateSubject.status !== null && r.updateSubject.status < 400 && r.updateSubject.rows > 0)
        console.log(`  ATTENTION ${table} : le changement de subject_id vers une autre matière a été accepté.`);
    }

    if (regressions.length > 0) {
      console.log("\nRÉGRESSIONS DÉTECTÉES (INSERT même classe refusé) :", regressions.join(", "));
      process.exitCode = 3;
    }
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    // ---- 5. Nettoyage systématique ----
    for (const table of ["tasks", "documents", "hints", "recordings"]) {
      await req(base, `/rest/v1/${table}?title=like.S3-*`, { method: "DELETE", headers: adminHeaders });
    }
    if (ids.length) {
      await req(base, `/rest/v1/registration_requests?user_id=eq.${ids[0]}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/rest/v1/profiles?id=eq.${ids[0]}`, { method: "DELETE", headers: adminHeaders });
      const del = await req(base, `/auth/v1/admin/users/${ids[0]}`, { method: "DELETE", headers: adminHeaders });
      console.log(del.status === 200 || del.status === 204 ? "Nettoyage : compte DELEGATE supprimé." : `Nettoyage : suppression -> HTTP ${del.status}.`);
    }
  }
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
