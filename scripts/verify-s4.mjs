// =============================================================================
// verify-s4.mjs — Vérifie S4 « aucun ADMIN automatique » sur la base Supabase.
// =============================================================================
// Usage :
//   node scripts/verify-s4.mjs
//
// Lit les clés dans .env.local (comme les autres scripts verify-*.mjs).
//
// Tests :
//   T1/T2  Workflow d'inscription (simulation exacte de registerAction via le
//          service role) : rôle STUDENT + class_id NULL + demande PENDING, puis
//          acceptation -> STUDENT (jamais ADMIN).
//   T3     Deux inscriptions « simultanées » (Promise.all) : toutes deux
//          STUDENT + PENDING, aucune ADMIN.
//   T4     STUDENT POST /rest/v1/profiles {role:'ADMIN'} -> REFUS (42501), 0 ligne.
//   T5a    STUDENT PATCH de son propre rôle -> REFUS (P0001 trigger).
//   T5b    STUDENT PATCH du rôle d'un AUTRE -> REFUS (0 ligne).
//   T6     Inventaire des ADMIN existants (lecture seule — aucune modification).
//
// NB : la logique applicative du bootstrap (adminCount === 0) n'existe plus
// dans actions/auth.ts ; ce script vérifie les garanties côté base + workflow.
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

// Crée un compte Auth + profil STUDENT (class_id NULL) + demande PENDING,
// exactement comme le fait registerAction (via le service role).
async function createPendingUser(base, adminHeaders, stamp, suffix) {
  const email = `s4-${stamp}-${suffix}@classpulse.app`;
  const password = `S4Verify-${stamp}!`;
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
    body: { id: userId, first_name: "S4", last_name: "Probe", email, role: "STUDENT", class_id: null },
  });
  if (profile.status !== 201) {
    throw new Error(`création profil : HTTP ${profile.status} ${JSON.stringify(profile.data)}`);
  }
  const regreq = await req(base, "/rest/v1/registration_requests", {
    method: "POST",
    headers: adminHeaders,
    body: { user_id: userId, class_id: "22222222-2222-2222-2222-222222222222", status: "PENDING" },
  });
  if (regreq.status !== 201) {
    throw new Error(`création demande : HTTP ${regreq.status} ${JSON.stringify(regreq.data)}`);
  }
  return { id: userId, email, password };
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
  const results = {};

  try {
    // ---- T6 : inventaire des ADMIN existants (lecture seule) ----
    const admins = await req(base, "/rest/v1/profiles?select=id,email,first_name,last_name,role,class_id&role=eq.ADMIN", {
      headers: adminHeaders,
    });
    results.existingAdmins = Array.isArray(admins.data) ? admins.data : [];
    console.log(`\nT6 — ADMIN existants (${results.existingAdmins.length}, aucune modification) :`);
    for (const a of results.existingAdmins) {
      console.log(`  - ${a.first_name} ${a.last_name} <${a.email}> class_id=${a.class_id}`);
    }

    // ---- T1 : workflow d'inscription (simulation registerAction) ----
    const u1 = await createPendingUser(base, adminHeaders, stamp, "u1");
    userIds.push(u1.id);
    const p1 = (await req(base, `/rest/v1/profiles?select=id,role,class_id&id=eq.${u1.id}`, { headers: adminHeaders })).data?.[0];
    const r1 = (await req(base, `/rest/v1/registration_requests?select=id,status&user_id=eq.${u1.id}`, { headers: adminHeaders })).data?.[0];
    results.t1 = { role: p1?.role, classId: p1?.class_id, status: r1?.status };
    console.log("\nT1 — Inscription publique (simulation registerAction) :");
    console.log(`  role=${results.t1.role} class_id=${String(results.t1.classId)} demande=${results.t1.status} (attendu : STUDENT / null / PENDING)`);

    // ---- T2 : acceptation -> STUDENT (jamais ADMIN) ----
    await req(base, `/rest/v1/registration_requests?id=eq.${r1?.id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: { status: "ACCEPTED" },
    });
    await req(base, `/rest/v1/profiles?id=eq.${u1.id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: { class_id: "22222222-2222-2222-2222-222222222222" },
    });
    const p1b = (await req(base, `/rest/v1/profiles?select=id,role,class_id&id=eq.${u1.id}`, { headers: adminHeaders })).data?.[0];
    results.t2 = { role: p1b?.role, classId: p1b?.class_id };
    console.log("\nT2 — Acceptation (simulation decideRegistrationAction) :");
    console.log(`  role=${results.t2.role} class_id=${results.t2.classId} (attendu : STUDENT / 22222222...)`);

    // ---- T3 : deux inscriptions simultanées ----
    const [u2, u3] = await Promise.all([
      createPendingUser(base, adminHeaders, stamp, "u2"),
      createPendingUser(base, adminHeaders, stamp, "u3"),
    ]);
    userIds.push(u2.id, u3.id);
    const rows = (await req(base, `/rest/v1/profiles?select=id,role&id=in.(${u2.id},${u3.id})`, { headers: adminHeaders })).data ?? [];
    results.t3 = rows.map((r) => r.role);
    console.log("\nT3 — Deux inscriptions simultanées :");
    console.log(`  rôles=[${results.t3.join(", ")}] (attendu : STUDENT, STUDENT — aucun ADMIN)`);

    // ---- Session STUDENT pour T4/T5 ----
    const token = await req(base, "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: { email: u1.email, password: u1.password },
    });
    const studentHeaders = {
      apikey: anonKey,
      Authorization: `Bearer ${token.data.access_token}`,
      "User-Agent": "supabase-js/2.45.4 node",
    };

    // ---- T4 : POST profiles {role:'ADMIN'} ----
    const t4Id = crypto.randomUUID();
    const t4 = await req(base, `/rest/v1/profiles?select=id,role`, {
      method: "POST",
      headers: { ...studentHeaders, Prefer: "return=representation" },
      body: { id: t4Id, first_name: "X", last_name: "Y", email: `s4-new-${stamp}@x.app`, role: "ADMIN" },
    });
    const t4check = (await req(base, `/rest/v1/profiles?id=eq.${t4Id}`, { headers: adminHeaders })).data;
    results.t4 = { status: t4.status, rowCreated: Array.isArray(t4check) ? t4check.length : t4check };
    console.log("\nT4 — POST /rest/v1/profiles {role:ADMIN} (STUDENT) :");
    console.log(`  HTTP ${results.t4.status}, ligne créée=${JSON.stringify(results.t4.rowCreated)} (attendu : 4xx / 0)`);

    // ---- T5a : PATCH de son propre rôle ----
    const t5a = await req(base, `/rest/v1/profiles?id=eq.${u1.id}`, {
      method: "PATCH",
      headers: { ...studentHeaders, Prefer: "return=representation" },
      body: { role: "ADMIN" },
    });
    const selfAfter = (await req(base, `/rest/v1/profiles?select=id,role&id=eq.${u1.id}`, { headers: adminHeaders })).data?.[0];
    results.t5a = { status: t5a.status, role: selfAfter?.role };
    console.log("\nT5a — PATCH de son propre rôle STUDENT->ADMIN :");
    console.log(`  HTTP ${results.t5a.status}, rôle resté=${results.t5a.role} (attendu : 4xx / STUDENT)`);

    // ---- T5b : PATCH du rôle d'un AUTRE utilisateur ----
    const t5b = await req(base, `/rest/v1/profiles?id=eq.${u2.id}`, {
      method: "PATCH",
      headers: { ...studentHeaders, Prefer: "return=representation" },
      body: { role: "ADMIN" },
    });
    const otherAfter = (await req(base, `/rest/v1/profiles?select=id,role&id=eq.${u2.id}`, { headers: adminHeaders })).data?.[0];
    results.t5b = { status: t5b.status, rows: Array.isArray(t5b.data) ? t5b.data.length : t5b.data, role: otherAfter?.role };
    console.log("\nT5b — PATCH du rôle d'un AUTRE utilisateur ->ADMIN :");
    console.log(`  HTTP ${results.t5b.status} (${JSON.stringify(results.t5b.rows)} ligne), rôle resté=${results.t5b.role} (attendu : 0 ligne / STUDENT)`);

    // ---- Bilan ----
    const ok =
      results.t1.role === "STUDENT" &&
      results.t1.status === "PENDING" &&
      results.t2.role === "STUDENT" &&
      results.t3.every((r) => r === "STUDENT") &&
      results.t4.status >= 400 &&
      results.t5a.status >= 400 &&
      results.t5a.role === "STUDENT" &&
      results.t5b.role === "STUDENT";
    console.log(ok ? "\nVERDICT : S4 PROTEGE (base) — aucun mécanisme de promotion automatique exploitable." : "\nVERDICT : ATTENTION — au moins un test S4 a échoué (détails ci-dessus).");
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    // ---- Nettoyage systématique ----
    for (const id of userIds) {
      await req(base, `/rest/v1/registration_requests?user_id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/rest/v1/profiles?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
    }
    console.log(`Nettoyage : ${userIds.length} compte(s) de test supprimé(s).`);
  }
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
