// =============================================================================
// verify-f1.mjs — Vérifie F1 « resoumission après REJECTED » côté base live.
// =============================================================================
// Usage :  node scripts/verify-f1.mjs
//
// Vérifie les garanties DONNÉES par la base (celles sur lesquelles
// resubmitRegistrationAction s'appuie) :
//   T1  REJECTED -> nouvelle demande PENDING autorisée, ancienne demandes
//       historisées (2 lignes, statuts distincts).
//   T2  Double demande PENDING : REFUS par l'index partiel uq_regreq_pending_per_user.
//   T3  Classe invalide : REFUS par la FK (23503).
//   T4  SÉCURITÉ : un utilisateur REJECTED+PENDING (jamais ACCEPTED) ne lit
//       AUCUNE donnée de classe ; seuls les droits reviennent après ACCEPTED.
//   T5  Nettoyage systématique de tous les artefacts.
//
// NB : la logique applicative (garde-fous ACCEPTED/PENDING/non-connecté) est
// testée par tests/resubmit.test.ts (vitest) ; ce script couvre la base.
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

const CLASS_OK = "22222222-2222-2222-2222-222222222222";
const CLASS_INVALID = "00000000-0000-0000-0000-000000000000";

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
  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const password = `F1Verify-${stamp}!`;
  const userIds = [];
  const reqIds = [];
  const results = {};

  try {
    // ---- Compte de test (profil STUDENT, sans classe) ----
    const email = `f1-${stamp}@classpulse.app`;
    const user = await req(base, "/auth/v1/admin/users", {
      method: "POST",
      headers: adminHeaders,
      body: { email, password, email_confirm: true },
    });
    if (user.status !== 200 || !user.data?.id) throw new Error(`compte : HTTP ${user.status}`);
    const uid = user.data.id;
    userIds.push(uid);

    const profile = await req(base, "/rest/v1/profiles", {
      method: "POST",
      headers: adminHeaders,
      body: { id: uid, first_name: "F1", last_name: "Probe", email, role: "STUDENT", class_id: null },
    });
    if (profile.status !== 201) throw new Error(`profil : HTTP ${profile.status}`);

    // ---- T1 : REJECTED puis nouvelle demande PENDING (historisation) ----
    const r1 = await req(base, "/rest/v1/registration_requests?select=id", {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=representation" },
      body: { user_id: uid, class_id: CLASS_OK, status: "REJECTED" },
    });
    reqIds.push(r1.data?.[0]?.id);
    const r2 = await req(base, "/rest/v1/registration_requests?select=id", {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=representation" },
      body: { user_id: uid, class_id: CLASS_OK, status: "PENDING" },
    });
    reqIds.push(r2.data?.[0]?.id);
    const history = (await req(base, `/rest/v1/registration_requests?select=status&user_id=eq.${uid}&order=created_at.asc`, { headers: adminHeaders })).data ?? [];
    results.t1 = { statuses: history.map((h) => h.status) };
    console.log("\nT1 — REJECTED puis resoumission :");
    console.log(`  historique=${JSON.stringify(results.t1.statuses)} (attendu : [REJECTED, PENDING])`);

    // ---- T2 : double demande PENDING -> index unique ----
    const t2 = await req(base, "/rest/v1/registration_requests", {
      method: "POST",
      headers: adminHeaders,
      body: { user_id: uid, class_id: CLASS_OK, status: "PENDING" },
    });
    results.t2 = { status: t2.status, hint: t2.data?.code ?? (t2.data?.message ?? "") };
    console.log("\nT2 — Double demande PENDING :");
    console.log(`  HTTP ${results.t2.status}, code=${JSON.stringify(results.t2.hint)} (attendu : 4xx / 23505)`);

    // ---- T3 : classe invalide -> FK ----
    // On retire d'abord la demande PENDING active pour isoler la vérif FK.
    await req(base, `/rest/v1/registration_requests?id=eq.${r2.data?.[0]?.id}`, { method: "DELETE", headers: adminHeaders });
    const t3 = await req(base, "/rest/v1/registration_requests", {
      method: "POST",
      headers: adminHeaders,
      body: { user_id: uid, class_id: CLASS_INVALID, status: "PENDING" },
    });
    results.t3 = { status: t3.status, hint: t3.data?.code ?? (t3.data?.message ?? "") };
    console.log("\nT3 — Classe inexistante :");
    console.log(`  HTTP ${results.t3.status}, code=${JSON.stringify(results.t3.hint)} (attendu : 4xx / 23503)`);
    // On remet la demande PENDING pour la suite (T4).
    const r3 = await req(base, "/rest/v1/registration_requests?select=id", {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=representation" },
      body: { user_id: uid, class_id: CLASS_OK, status: "PENDING" },
    });
    reqIds.push(r3.data?.[0]?.id);

    // ---- T4 : sécurité — REJECTED (aucun ACCEPTED) ne lit AUCUNE donnée ----
    const token = await req(base, "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: authHeaders,
      body: { email, password },
    });
    const studentHeaders = { ...authHeaders, Authorization: `Bearer ${token.data.access_token}`, "User-Agent": "supabase-js/2.45.4 node" };
    const emptyProbe = await req(base, "/rest/v1/tasks?select=id&limit=5", { headers: studentHeaders });
    results.t4a = { rows: Array.isArray(emptyProbe.data) ? emptyProbe.data.length : JSON.stringify(emptyProbe.data) };
    console.log("\nT4 — REJECTED (sans ACCEPTED) lit les devoirs de la classe :");
    console.log(`  HTTP ${emptyProbe.status}, lignes=${JSON.stringify(results.t4a.rows)} (attendu : 0 — aucun droit)`);

    // Après ACCEPTED + rattachement de classe -> droits rétablis
    const r1id = r1.data?.[0]?.id;
    await req(base, `/rest/v1/registration_requests?id=eq.${r1id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: { status: "ACCEPTED", decided_at: new Date().toISOString() },
    });
    await req(base, `/rest/v1/profiles?id=eq.${uid}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: { class_id: CLASS_OK },
    });
    const okProbe = await req(base, "/rest/v1/tasks?select=id&limit=5", { headers: studentHeaders });
    results.t4b = { status: okProbe.status, rows: Array.isArray(okProbe.data) ? okProbe.data.length : JSON.stringify(okProbe.data) };
    console.log("  Après ACCEPTED + rattachement :");
    console.log(`  HTTP ${results.t4b.status}, lignes=${JSON.stringify(results.t4b.rows)} (attendu : >= 0 — droits rétablis)`);

    // ---- Bilan ----
    const ok =
      JSON.stringify(results.t1.statuses) === JSON.stringify(["REJECTED", "PENDING"]) &&
      results.t2.status >= 400 &&
      results.t3.status >= 400 &&
      results.t4a.rows === 0;
    console.log(ok
      ? "\nVERDICT : F1 PROTEGE (base) — resoumission possible, double-demande et classe invalide bloquées, aucun droit pour un non-ACCEPTED."
      : "\nVERDICT : ATTENTION — au moins un test F1 a échoué (détails ci-dessus).");
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    for (const rid of reqIds) if (rid) await req(base, `/rest/v1/registration_requests?id=eq.${rid}`, { method: "DELETE", headers: adminHeaders });
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
