// =============================================================================
// verify-s6.mjs — Vérifie S6 « notifications en lecture seule (sauf read_at) ».
// =============================================================================
// Usage :
//   node scripts/verify-s6.mjs
//
// Lit les clés dans .env.local (comme les autres scripts verify-*.mjs).
//
// Tests :
//   T1    STUDENT PATCH {read_at}  sur sa notification        -> 2xx (lu)
//   T2    STUDENT PATCH {read_at:null}                         -> 2xx (non-lu)
//   T3    STUDENT PATCH {title}                                -> 4xx
//   T4    STUDENT PATCH {message}                              -> 4xx
//   T5    STUDENT PATCH {link} (lien externe)                  -> 4xx
//   T6    STUDENT PATCH {type}                                 -> 4xx
//   T7    STUDENT PATCH {entity_id}                            -> 4xx
//   T8    STUDENT PATCH {recipient_id} (transfert)             -> 4xx
//   T8b   STUDENT PATCH {user_id} (colonne inexistante)        -> 4xx
//   T9    ADMIN  PATCH {title} sur sa notification             -> 4xx (aucun
//         droit supplémentaire accordé aux rôles)
//   T10   DELEGATE PATCH {link} sur sa notification            -> 4xx (idem)
//   T11   service role PATCH {title}                           -> 4xx (trigger
//         trg_notifications_readonly : défense en profondeur)
//   T12   read_at reste intact après toutes les tentatives refusées.
//
// NB : la colonne « propriétaire » de la table notifications est recipient_id
// (le champ user_id n'existe pas dans cette table).
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

// Crée un compte Auth + profil (rôle explicite) via le service role.
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
    body: { id: userId, first_name: "S6", last_name: "Probe", email, role, class_id: classId },
  });
  if (profile.status !== 201) {
    throw new Error(`création profil : HTTP ${profile.status} ${JSON.stringify(profile.data)}`);
  }
  return { id: userId, email, password };
}

// Crée une notification pour l'utilisateur via le service role
// (exactement comme NotificationService.createNotification).
async function createNotification(base, adminHeaders, userId) {
  const notif = await req(base, "/rest/v1/notifications", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: {
      recipient_id: userId,
      type: "TASK_CREATED",
      title: "Devoir créé",
      message: "Un nouveau devoir est disponible.",
      read_at: null,
      entity_type: "task",
      entity_id: "22222222-2222-2222-2222-222222222222",
      link: "/dashboard/tasks",
      category: "tasks",
    },
  });
  if (notif.status !== 201 || !notif.data?.[0]?.id) {
    throw new Error(`création notification : HTTP ${notif.status} ${JSON.stringify(notif.data)}`);
  }
  return { id: notif.data[0].id };
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
  const notifIds = [];
  const results = {};

  try {
    // ---- Préparation : 1 STUDENT, 1 ADMIN, 1 DELEGATE + leurs notifications ----
    const student = await createUserWithProfile(base, adminHeaders, `s6-student-${stamp}@classpulse.app`, `S6Verify-${stamp}!`, {
      role: "STUDENT",
      classId: "22222222-2222-2222-2222-222222222222",
    });
    const admin = await createUserWithProfile(base, adminHeaders, `s6-admin-${stamp}@classpulse.app`, `S6Verify-${stamp}!`, {
      role: "ADMIN",
    });
    const delegate = await createUserWithProfile(base, adminHeaders, `s6-delegate-${stamp}@classpulse.app`, `S6Verify-${stamp}!`, {
      role: "DELEGATE",
      classId: "22222222-2222-2222-2222-222222222222",
    });
    userIds.push(student.id, admin.id, delegate.id);

    const studentNotif = await createNotification(base, adminHeaders, student.id);
    const adminNotif = await createNotification(base, adminHeaders, admin.id);
    const delegateNotif = await createNotification(base, adminHeaders, delegate.id);
    notifIds.push(studentNotif.id, adminNotif.id, delegateNotif.id);

    const studentHeaders = await signIn(base, anonKey, student.email, student.password);
    const adminHeadersClient = await signIn(base, anonKey, admin.email, admin.password);
    const delegateHeadersClient = await signIn(base, anonKey, delegate.email, delegate.password);

    const patch = (id, body, headers) =>
      req(base, `/rest/v1/notifications?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body,
      });
    const getOwn = (id, headers) => req(base, `/rest/v1/notifications?select=id,title,message,link,type,recipient_id,entity_id,read_at&id=eq.${id}`, { headers });

    // ---- T1 : marquer comme lue (read_at autorisé) ----
    const t1 = await patch(studentNotif.id, { read_at: new Date().toISOString() }, studentHeaders);
    const t1row = (await getOwn(studentNotif.id, studentHeaders)).data?.[0];
    results.t1 = { status: t1.status, readAt: t1row?.read_at };
    console.log("\nT1 — PATCH {read_at} (STUDENT, sa notification) :");
    console.log(`  HTTP ${results.t1.status}, read_at=${results.t1.readAt} (attendu : 2xx / non-null)`);

    // ---- T2 : marquer comme non-lue (read_at -> null autorisé) ----
    const t2 = await patch(studentNotif.id, { read_at: null }, studentHeaders);
    const t2row = (await getOwn(studentNotif.id, studentHeaders)).data?.[0];
    results.t2 = { status: t2.status, readAt: t2row?.read_at };
    console.log("\nT2 — PATCH {read_at:null} (STUDENT) :");
    console.log(`  HTTP ${results.t2.status}, read_at=${String(results.t2.readAt)} (attendu : 2xx / null)`);

    // ---- T3 à T8b : tentatives refusées (champs protégés) ----
    const attempts = [
      ["T3", "title", { title: "Titre piraté" }],
      ["T4", "message", { message: "Message piraté" }],
      ["T5", "link", { link: "https://evil.example.com" }],
      ["T6", "type", { type: "TASK_COMPLETED" }],
      ["T7", "entity_id", { entity_id: "33333333-3333-3333-3333-333333333333" }],
      ["T8", "recipient_id", { recipient_id: "44444444-4444-4444-4444-444444444444" }],
      ["T8b", "user_id", { user_id: "55555555-5555-5555-5555-555555555555" }],
    ];
    for (const [label, field, body] of attempts) {
      const res = await patch(studentNotif.id, body, studentHeaders);
      results[label] = res.status;
      console.log(`\n${label} — PATCH {${field}:...} (STUDENT) :`);
      console.log(`  HTTP ${res.status} (attendu : 4xx — refus)`);
    }

    // ---- T9 : ADMIN n'obtient pas de droits supplémentaires ----
    const t9 = await patch(adminNotif.id, { title: "Titre admin piraté" }, adminHeadersClient);
    results.t9 = t9.status;
    console.log("\nT9 — PATCH {title} (ADMIN, sa notification) :");
    console.log(`  HTTP ${t9.status} (attendu : 4xx — aucun droit supplémentaire)`);

    // ---- T10 : DELEGATE idem ----
    const t10 = await patch(delegateNotif.id, { link: "https://evil.example.com" }, delegateHeadersClient);
    results.t10 = t10.status;
    console.log("\nT10 — PATCH {link} (DELEGATE, sa notification) :");
    console.log(`  HTTP ${t10.status} (attendu : 4xx — aucun droit supplémentaire)`);

    // ---- T11 : service role bloqué par le trigger (défense en profondeur) ----
    const t11 = await patch(studentNotif.id, { title: "Titre via service role" }, adminHeaders);
    results.t11 = t11.status;
    console.log("\nT11 — PATCH {title} via service role (trigger) :");
    console.log(`  HTTP ${t11.status} (attendu : 4xx — trigger trg_notifications_readonly)`);

    // ---- T12 : intégrité — read_at/title inchangés après les tentatives ----
    const finalRow = (await getOwn(studentNotif.id, adminHeaders)).data?.[0];
    results.t12 = {
      title: finalRow?.title,
      link: finalRow?.link,
      readAt: finalRow?.read_at,
      recipient: finalRow?.recipient_id,
    };
    console.log("\nT12 — Intégrité après tentatives refusées :");
    console.log(`  title=${results.t12.title} link=${results.t12.link} read_at=${String(results.t12.readAt)} recipient=${results.t12.recipient}`);
    console.log("  (attendu : title='Devoir créé', link='/dashboard/tasks', read_at=null, recipient=STUDENT)");

    // ---- Bilan ----
    const is2xx = (s) => s >= 200 && s < 300;
    const ok =
      is2xx(results.t1) && results.t1.readAt != null &&
      is2xx(results.t2) && results.t2.readAt == null &&
      results.t3 >= 400 && results.t4 >= 400 && results.t5 >= 400 &&
      results.t6 >= 400 && results.t7 >= 400 && results.t8 >= 400 && results.t8b >= 400 &&
      results.t9 >= 400 && results.t10 >= 400 && results.t11 >= 400 &&
      results.t12.title === "Devoir créé" &&
      results.t12.link === "/dashboard/tasks" &&
      results.t12.readAt == null;
    console.log(
      ok
        ? "\nVERDICT : S6 PROTEGE (base) — seul read_at est modifiable, les champs de contenu sont immuables."
        : "\nVERDICT : ATTENTION — au moins un test S6 a échoué (détails ci-dessus)."
    );
  } catch (err) {
    console.error("ERREUR :", err.message);
    process.exitCode = 2;
  } finally {
    // ---- Nettoyage systématique ----
    for (const id of notifIds) {
      await req(base, `/rest/v1/notifications?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
    }
    for (const id of userIds) {
      await req(base, `/rest/v1/profiles?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
      await req(base, `/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
    }
    console.log(`Nettoyage : ${notifIds.length} notification(s) et ${userIds.length} compte(s) de test supprimé(s).`);
  }
}

main().catch((e) => {
  console.error("ERREUR :", e.message);
  process.exit(1);
});
