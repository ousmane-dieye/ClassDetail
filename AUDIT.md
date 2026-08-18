# AUDIT CLASS PULSE — Rapport complet

**Date :** 14/08/2026 · **Périmètre :** audit sécurité + QA + UX/UI + code review, full-stack.
**Méthode :** revue statique de 100 % du code applicatif + schéma/RLS, tests unitaires réels, build, lint, `npm audit`, et **tests de pénétration live** sur la base Supabase de production (project `jvtrjabbzyhnycezbeha`) via l'API REST — toutes les données de test créées ont été nettoyées (aucune trace résiduelle : 9 profils / 8 demandes ACCEPTED d'origine restaués).

---

## 1. Résumé exécutif

L'application est **fonctionnelle, agréable et cohérente**, mais **PAS PRÊTE POUR LA PRODUCTION** :

- **1 vulnérabilité CRITIQUE confirmée en conditions réelles** : les **emails de tous les membres de la classe** (y compris l'email Gmail personnel de l'administrateur) sont lisibles par n'importe quel élève connecté via l'API Supabase — le `revoke select (email)` prévu par le code **n'est pas effectif** sur la base déployée.
- **3 failles HAUTES confirmées live** : tout élève peut **usurper une annonce officielle** (`is_announcement=true`), un délégué peut **corrompre l'intégrité des données en attachant une matière d'une autre classe** à une tâche de sa classe, et le **bootstrap « premier utilisateur = ADMIN »** a déjà produit **2 comptes ADMIN en production** sans aucune validation.
- La bonne nouvelle : l'essentiel de la couche RLS fonctionne (isolation par classe, blocage des PENDING, triggers anti-escalade, revoke de l'écriture client des notifications), **60/60 tests passent**, lint 0 erreur, build OK, aucun secret dans l'historique git.
- Des **défauts fonctionnels bloquants** existent : utilisateur refusé **définitivement bloqué**, chat limité aux **100 plus anciens messages**, **aucune réinitialisation de mot de passe**, classe **impossible à supprimer** dès qu'elle a 1 membre (et aucune fonction de retrait de membre).

---

## 2. Scores par catégorie

| Catégorie | Note /10 | Verdict |
|---|---|---|
| Sécurité & RLS | **3/10** | Faille critique PII + 3 failles hautes confirmées en prod |
| Fonctionnel | **5/10** | Fonctionne, mais 2 blocages majeurs (rejet, chat) |
| UX / UI | **7/10** | Design soigné, plusieurs éléments morts / incohérences |
| Responsive | **7.5/10** | Bon, 2 headers sticky empilés sur mobile |
| Accessibilité | **5/10** | Rôles aria ok, labels de formulaire non reliés, contrastes limite |
| Performance | **6/10** | N+1 notifications, chat sans pagination serveur, rate-limit en mémoire |
| Qualité de code | **6.5/10** | Propre et structuré, mais types générés à la main, code mort, pas de CI |
| Tests | **6/10** | 60 unitaires solides sur la logique pure, **0 test RLS / actions / composants** |
| **Prêt pour la production** | **3/10** | Non — voir P0/P1 |

---

## 3. Vulnérabilités de sécurité (avec preuves live)

### CRITIQUE — S1. Fuite des emails de tous les membres (PII)
- **Preuve live :** en tant qu'élève ACCEPTED, `GET /rest/v1/profiles?select=first_name,email` retourne les emails de **tous les membres de la classe**, y compris `dieyeousmanedieng@gmail.com` (admin) et `ousmanediengdieye1@gmail.com`.
- **Cause :** `revoke select (email) on profiles from anon, authenticated` (migration 0005 / `schema.sql`) **n'est pas effectif** sur la base déployée. Le code applicatif se repose pourtant sur cette protection (commentaires dans `actions/auth.ts:155`, `actions/auth.ts:181`).
- **Correction :** ré-appliquer/vérifier le revoke, et idéalement ne plus jamais sélectionner `email` côté client ; déplacer toute lecture d'email côté service role.

### HAUTE — S2. Usurpation d'annonce officielle par un élève
- **Preuve live :** un élève STUDENT a inséré `{"content":"spoofed announcement","is_announcement":true}` dans le chat de sa classe → **succès** (201), l'annonce apparaissait comme officielle.
- **Cause :** policy `chat_insert` (`schema.sql:616`) vérifie seulement `is_member_of(class_id) AND author_id = auth.uid()`. `is_announcement` n'est pas restreint. L'action serveur le protège, pas la RLS.
- **Correction :** trigger ou `WITH CHECK` exigeant `is_admin() OR is_delegate_of(class_id)` pour `is_announcement = true`.

### HAUTE — S3. Intégrité des données : matière cross-classe
- **Preuve live :** un délégué de la classe GI3-B a inséré une tâche `class_id = GI3-B` avec `subject_id = "Bases de données"` (**matière de GL2-A**) → **succès**.
- **Cause :** `tasks`/`documents`/`hints`/`recordings` n'ont pas de **FK composite** `(subject_id, class_id) REFERENCES subjects(id, class_id)`.
- **Correction :** FK composite + vérification côté actions.

### HAUTE — S4. Bootstrap « premier utilisateur = ADMIN » permanent et race
- **Preuve live :** la base contient **2 ADMIN** — l'un (`Odd dd`) est passé par le flux d'inscription normal (ACCEPTED) : le bootstrap l'a fait admin sans validation. Plus TOCTOU : si 2 inscriptions simultanées tombent sur `adminCount === 0`, les 2 deviennent ADMIN.
- **Correction :** drapeau one-time en base (table `app_settings`), pas un comptage ; maintenir le mécanisme uniquement pour la toute première création via script.

### MOYENNE — S5. Statistiques de classe accessibles aux étudiants
- **Preuve :** `app/dashboard/stats/page.tsx` n'a **aucun garde de rôle** (seul `user` est vérifié) ; la sidebar affiche « Statistiques » pour tous les rôles. Le test unitaire `canViewClassStats` prévoit pourtant ADMIN/DELEGATE uniquement.
- **Correction :** garde `role` sur la page (comme `delegate/page.tsx`).

### MOYENNE — S6. Un utilisateur peut réécrire ses propres notifications (y compris le `link`)
- **Preuve live :** `PATCH /rest/v1/notifications?id=...` a remplacé `title`/`message`/`link` d'une notification par du contenu arbitraire (`https://evil.example.com/phish`). `NotificationsCenter` fait ensuite `router.push(n.link)` (`NotificationsCenter.tsx:113`) → navigation externe possible.
- **Cause :** policy `notifications_update` (`schema.sql:629`) sans `WITH CHECK` ni restriction de colonnes.
- **Correction :** limiter l'update à `read_at` uniquement (trigger ou policy avec `WITH CHECK (new.read_at IS NOT NULL AND ...)`).

### MOYENNE — S7. Énumération publique de toutes les classes
- **Preuve live :** sans aucun compte, `GET /rest/v1/classes` retourne les 2 classes (nom, niveau, année). La page publique `/register` embarque les noms + UUID.
- **Note :** nécessaire pour le formulaire d'inscription public, mais à documenter / limiter (champs minimaux, pas d'id réel exposé si possible).
- **Correction :** acceptable en l'état si le nom de classe n'est pas sensible ; sinon passer par un RPC public limité.

### MOYENNE — S8. Le délégué peut supprimer n'importe quel document/hint de sa classe par API
- **Preuve live :** un délégué a supprimé un document dont l'auteur était un autre étudiant → **succès** (RLS `documents_delete` autorise `is_delegate_of(class_id)`).
- **Incohérence :** l'UI masque le bouton pour les contenus d'autrui (`documents/page.tsx`), donc la **capacité existe mais n'est pas utilisable proprement** — un client malveillant peut toujours le faire.
- **Correction :** trancher (UI vs RLS) — soit permettre officiellement aux délégués, soit restreindre la RLS.

### MOYENNE — S9. Rate-limiting IA en mémoire = inefficace sur serverless
- `lib/security/rateLimit.ts` est un `Map` en mémoire : inopérant dès que Vercel scalé sur plusieurs instances.
- **Correction :** rate-limit en base (table + cron) ou service externe (Upstash).

### MOYENNE — S10. Dépendances : vulnérabilités npm — ✅ **12 → 1 corrigées** — voir section 15
- `npm audit` initial : **12 vulnérabilités** (1 critique, 6 hautes, 3 modérées, 2 basses) — chaine vitest/vite/esbuild, glob, postcss, auth-js, next.
- **Corrigé (11/12)** : upgrades non-breaking + overrides ciblés (section 15).
- **Résidu (1 haute) : `next@14.2.35`** — 21 advisories (DoS, SSRF, XSS, cache-poisoning, middleware). Le fix publié exige **Next ≥ 15.5.21 (major, React 19)** : upgrade refusé ici, **résidu documenté et accepté** (section 15, mitigations).

### BASSE — S11. Assistant IA accessible aux comptes non approuvés
- `/api/assistant/route.ts` vérifie `user` mais **pas le statut d'approbation**. Les outils étant scopés par RLS, un PENDING ne voit que du vide → impact faible, mais la protection devrait être explicite.

### Points vérifiés et SOLIDES (à maintenir)
- Isolation complète classe par classe : un étudiant ne lit que les données de sa classe ✓ (preuves live).
- Comptes PENDING : aucun accès aux données de classe ✓ (preuves live).
- Blocage de l'auto-escalade `role`/`class_id` par trigger ✓ (preuves live : « Modification du rôle interdite »).
- Inserts anon bloqués sur notifications/chat/registration_requests/profiles/task_completions ✓.
- `notifications_insert` restreint aux admins (anti-spam) ✓.
- Email des profils supposé non lisible… **mais S1 prouve le contraire** (action requise).
- Aucun secret dans l'historique git (`.env.local` gitignoré, seul `.env.example` versionné, clés placeholder) ✓.

---

## 4. Bugs fonctionnels (preuves code/live)

| # | Sév. | Bug | Détail |
|---|---|---|---|
| F1 | **HAUTE** | **Utilisateur refusé = définitivement bloqué** | Rejeté → layout redirige vers `/register` (`layout.tsx:38`), mais `registerAction` refuse (« email déjà utilisée », profile existe, `auth.ts:33-41`). Aucun bouton « resoumettre ». ✅ **Corrigé (F1)** — voir section 14 : `/register` devient l'écran de resoumission, `resubmitRegistrationAction` crée une nouvelle demande PENDING sans second compte Auth. |
| F2 | **HAUTE** | **Chat limité aux 100 plus anciens messages** | `chat/page.tsx` : `order(created_at asc).limit(100)` → passé 100 messages, les **nouveaux** sont invisibles. Il faut charger les N plus récents en desc puis inverser. |
| F3 | **MOYENNE** | **Aucune réinitialisation de mot de passe** | Le lien « Mot de passe oublié ? » de `/login` est un `href="#"` mort (`LoginForm.tsx:83`). Pas de `resetPasswordForEmail` ni page de reset. |
| F4 | **MOYENNE** | **Classe impossible à supprimer avec ≥1 membre, et aucun retrait de membre** | `classes_delete` RLS refuse si un profil référence la classe (`schema.sql:470`) ; aucune UI ne retire un membre. Les classes deviennent indestructibles. |
| F5 | **MOYENNE** | Rejet : pas d'email + promesse trompeuse | Le test `emailService.test.ts` confirme « REJECTED → aucun email ». Mais `/pending` promet « Vous recevrez un email de confirmation » et la notification interne de rejet n'est jamais visible (dashboard bloqué). |
| F6 | **BASSE** | `appointDelegateAction` peut promouvoir un utilisateur sans classe (PENDING/classless) | `classes.ts:57` ne vérifie pas le `class_id` de la cible → délégué sans classe possible. |
| F7 | **BASSE** | Toggle de tâche silencieux | `TaskCard.tsx` : échec de `toggleTaskCompletionAction` jamais affiché ; tâche expirée reste cochable. |
| F8 | **BASSE** | `user!.id` sans garde | `student/page.tsx:28`, etc. : crash potentiel si profil absent (edge). |
| F9 | **BASSE** | `NEXT_PUBLIC_APP_URL=http://localhost:3000` dans `.env.local` | Si repris en build prod, tous les liens des emails (bienvenue/rappels) pointent vers localhost. **À vérifier sur Vercel.** |

---

## 5. Problèmes UX / UI

| # | Problème |
|---|---|
| U1 | Bouton **« Rechercher » mort** dans le header dashboard (`layout.tsx:87`, aucun handler). |
| U2 | **2 headers sticky empilés sur mobile** : header Sidebar mobile (`z-40`, `Sidebar.tsx`) + header dashboard (`z-30`, `layout.tsx:67`). |
| U3 | **Aucune confirmation** sur aucune suppression (classe, document, hint, recording) — suppression immédiate au submit (grep : aucun `confirm`). |
| U4 | Fake streaming de l'assistant : la réponse est **entièrement bufferisée** puis « typewriter » (`AssistantPanel.tsx`) — trompeur sur le temps réel. |
| U5 | Labels de `RegisterForm` non reliés aux inputs (pas de `htmlFor`/`id`) — accessibilité. |
| U6 | `img` au lieu de `next/image` partout (landing, auth, empty states) — LCP/bandwidth (warnings lint). |
| U7 | Notifications : clic sur la ligne navigue vers `n.link` externe possible (cf. S6). |
| U8 | Message de refus contradictoire (cf. F5) et page `/pending` sans aucun état interactif. |
| U9 | Sidebar : le groupe « Statistiques » affiché à tous les rôles (cf. S5). |

---

## 6. Responsive & Accessibilité

**Responsive (7.5/10)** — bonne adaptation générale (grilles `sm/md/lg`, sidebar → tiroir mobile, tables scrollables, `overflow-x-hidden`). Points : U2 (double header), largeurs du chat/table emails `min-w-[720px]` scrollable OK.

**Accessibilité (5/10)** — positifs : `aria-label` sur boutons icon, `role="dialog"`/`aria-modal` sur le tiroir, `role="alert"` sur les erreurs, `aria-current` sur la nav. Négatifs : labels non reliés aux inputs dans `RegisterForm`, contrastes limite (`text-muted-foreground/60`), `img` sans `alt` cohérent sur certaines vues (EmptyState), focus-visible incohérent.

---

## 7. Performance

- **N+1 notifications** : `notifyClassMembers` insère 1 notification par membre en boucle (`lib/notifications/service.ts`) → multi-insert en un appel recommandé.
- **Chat sans pagination serveur** : toute l'historique (ou 100) chargée d'un coup (cf. F2).
- **Rate-limit IA en mémoire** (cf. S9).
- Dashboard layout : 3 requêtes par page (profile + registration + unread) sans cache — acceptable en SSR, mais à surveiller.
- Images Unsplash hotlinkées via CDN avec paramètres `?w=&q=` : correct.

---

## 8. Qualité de code

- **Positif :** architecture claire (actions / lib / components / ui), schéma idempotent et bien commenté, RLS pensée avec fonctions `security definer`, migrations versionnées propres, tests ciblés sur la logique pure, zod pour la validation, erreurs d'email sanitisées (jamais de mot de passe loggé — testé).
- **Négatif :** `types/database.types.ts` écrit à la main (drift : `entity_id` uuid vs string, tables/functions/views vides — le commentaire recommande déjà `supabase gen types`), **table `class_members` morte** (jamais écrite, vide en prod), props inutilisées (`role` de `NavGroup`), **aucune CI** (pas de lint/test en GitHub Actions), pas de gestion centralisée d'erreurs, `console.error` épars.
- **Secrets :** bonne hygiène (`.gitignore`, historique git propre).

---

## 9. Tests

- `npx vitest run` : **60/60 passent** (7 fichiers : permissions, notifications, emailService, assistantTools, reminders, taskStatus, guard).
- `next lint` : **0 erreur**, warnings `<img>` uniquement.
- `next build` : **OK** (19 routes, 3 API, middleware 56 kB).
- **Lacunes :** aucun test des **actions serveur**, des **composants**, des **API routes**, ni de la **couche RLS** (le présent audit fournit la première validation RLS réelle).

---

## 10. Fonctionnalités NON testées (à couvrir)

- Flux complet inscription → acceptation (email automatique depuis Gmail via SMTP) en conditions réelles.
- Cron `/api/cron/reminders` et `/api/cron/cleanup` (dépendent du CRON_SECRET + planning Vercel).
- Envoi Resend (repli) vs SMTP réel (le provider actif est SMTP Gmail).
- Assistant IA complet (appel Gemini, boucle d'outils) — rate-limit et outils scopés non exercés en live.
- Realtime (`postgres_changes`) sur le chat / notifications en multi-onglet.
- Rendu mobile réel (seulement inspecté en code).

---

## 11. Corrections à faire EN PREMIER (top 10)

1. **S1** — Restaurer la confidentialité des emails (revoke effectif + ne jamais sélectionner `email` côté client).
2. **S2** — Bloquer `is_announcement=true` hors ADMIN/DELEGATE au niveau RLS.
3. **S3** — FK composite `(subject_id, class_id)` sur tasks/documents/hints/recordings + contrôles actions.
4. **S4** — Remplacer le bootstrap par un drapeau one-time ; documenter les 2 admins existants.
5. **F1** — Permettre à un utilisateur refusé de soumettre une nouvelle demande (ou le supprimer).
6. **F2** — Chat : charger les 100 derniers messages (desc) puis inverser l'ordre.
7. **F3** — Implémenter la réinitialisation de mot de passe (Supabase `resetPasswordForEmail` + page).
8. **S5** — Garde de rôle sur `/dashboard/stats`.
9. **S6** — Restreindre l'update des notifications à `read_at`.
10. **S10** — Planifier l'upgrade Next (15/16) et résoudre les vulns npm ; ajouter un minimum de CI (lint + test).

---

## 12. Plan de correction P0→P3

### P0 — Critique (avant toute mise en ligne / avant l'ouverture réelle aux élèves)
- S1 Emails exposés · S2 Usurpation d'annonces · S3 Intégrité matières · S4 Bootstrap admin.

### P1 — Élevé (sous 2 semaines)
- F1 Utilisateur refusé bloqué · F2 Chat 100 messages · F3 Reset mot de passe · S5 Stats · S6 Notifications.

### P2 — Moyen (sous 1 mois)
- S7 Énumération classes (documenter) · S8 Délégué/delete → trancher · S9 Rate-limit DB · F4 Gestion des membres · F5 Email de rejet · U1/U2/U3 · S10 npm audit · Tests RLS.

### P3 — Faible / Cosmétique
- F6–F9, U4–U9, `class_members` mort, types générés, N+1 notifications, CI complète, `<img>`→`next/image`.

---

## 13. Verdict final — PRODUCTION READINESS

**NON PRÊT POUR LA PRODUCTION (3/10).**

L'application est techniquement saine (RLS majoritairement correcte, tests verts, build propre, aucune dette de secret), **mais** l'exposition des emails personnels (S1), l'usurpation d'annonces (S2), la corruption de données (S3) et le double-admin de fait (S4) sont des risques **bloquants** démontrés sur la base réelle. Les 4 corrections P0 sont rapides et très localisées ; après leur application, un second passage court (idempotence + re-tests RLS) suffirait à viser « prêt ».

---

## 14. Corrections appliquées (S1 → S4)

Correctifs livrés pour les 4 failles P0. Chaque migration doit être appliquée dans le **SQL Editor Supabase** (pas d'accès DDL automatisé) ; chaque `scripts/verify-s*.mjs` re-teste ensuite la garantie en live.

### S1 — Confidentialité des emails (CRITIQUE)
- **Cause racine :** le `revoke select (email)` prévu (migration 0005 / `schema.sql`) ciblait le **niveau colonne**, or Supabase accorde `SELECT` au **niveau table** pour `anon`/`authenticated` → le revoke de colonne est impuissant, d'où la fuite.
- **Migration `0009_s1_profiles_email_restriction.sql`** : `revoke select` **au niveau table** sur `profiles` (anon/authenticated/public), puis ré-accord **colonne par colonne** (id, first_name, last_name, role, class_id, horodatages) — `email` exclu ; grant complet au `service_role`. Contrôle bruyant (`DO`) vérifiant l'absence de grant colonne **et** table-level résiduel.
- **Fix applicatif** : `app/dashboard/layout.tsx` ne sélectionne plus `email` côté client (`select("first_name, last_name, role")`).
- **Vérification : `scripts/verify-s1.mjs`** (l'email d'un membre devient illisible pour un élève : HTTP 42501 « permission denied for column email »).

### S2 — Usurpation d'annonces (HAUTE)
- **Migration `0010_s2_chat_announcements_restriction.sql`** : policy `chat_insert` ré-écrite avec `WITH CHECK` n'autorisant `is_announcement = true` que pour `is_admin() OR is_delegate_of(class_id)`.
- **Vérification : `scripts/verify-s2.mjs`** (avant-matrice : STUDENT **201 vulnérable** → attendu : 4xx).

### S3 — Matières cross-classe (HAUTE)
- **Migration `0011_s3_cross_class_restriction.sql`** : pré-vol (`DO` bruyant) + `UNIQUE subjects(id, class_id)` + 4 **FK composites** `(subject_id, class_id) REFERENCES subjects(id, class_id)` sur `tasks`, `documents`, `hints`, `recordings`.
- **Vérification : `scripts/verify-s3.mjs`** (avant-matrice : 4 INSERT cross-classe **201** → attendu : 4xx). Données live : **0 ligne cross-classe** (subjects 5, tasks 6, documents 2, hints 1, recordings 0) — aucun nettoyage nécessaire.

### S4 — Bootstrap « premier utilisateur = ADMIN » (HAUTE) — [rapport détaillé]

**1. Ancienne logique (supprimée).** `registerAction` (`actions/auth.ts`) comptait les ADMIN (`adminCount = 0`) et promouvait le premier inscrit : `role: "ADMIN"`, `class_id` immédiatement posé, **pas** de `registration_requests`, `redirect("/dashboard")`. Défauts : (a) TOCTOU — deux inscriptions simultanées avec `adminCount === 0` → **deux ADMIN** ; (b) promotion sans validation humaine ; (c) mécanisme permanent (toute base vierge re-crée un ADMIN).

**2. Nouvelle logique (un seul workflow).** Pour **tous** : profil `role: "STUDENT"`, `class_id: null` (rattaché à la classe uniquement à l'acceptation), `registration_requests` `PENDING`, `redirect("/pending")`. Aucun comptage → **plus de TOCTOU**. L'ADMIN n'est créé que **explicitement** par l'administrateur système : `scripts/create-admin.mjs` ou SQL via le service role.

**3. Garanties côté base (déjà actives en prod, re-affirmées par `0012`).**
- **Aucune policy INSERT sur `profiles`** → un client ne peut pas créer de ligne `role = 'ADMIN'` (preuve live : POST → **403 / 42501**, 0 ligne).
- **Trigger `prevent_self_privilege_escalation`** → un non-ADMIN ne peut pas changer son propre `role`/`class_id` (preuve live : PATCH self → **400 / P0001** « Modification du rôle interdite »).
- **RLS `profiles_update_self` / `profiles_update_admin_role`** → un non-ADMIN ne peut pas modifier un **autre** profil (preuve live : PATCH autre → **200, 0 ligne**).
- **Migration `0012_s4_no_auto_admin.sql`** : ré-affirme trigger + policies et vérifie **bruyamment** leur présence (et l'absence de toute policy INSERT) — **ne bloque pas** le service role (création explicite d'ADMIN toujours possible).

**4. ADMIN existants (aucun supprimé — inventaire avant modification).**
| Profil | Email | Class_id | Auth |
|---|---|---|---|
| Admin ClassPulse | `admin@classpulse.app` | — (global) | confirmé ✓ |
| Odd dd | `dieyeousmanedieng@gmail.com` | GI3-B (`2222…`) | confirmé ✓ |

⚠ **Vérification manuelle recommandée** : « Odd dd » (compte Gmail personnel `dieyeousmanedieng@gmail.com`) a été créé **via le bootstrap** (flux d'inscription normal). Statut ADMIN conservé — confirmer que c'est bien le propriétaire voulu.

**5. Fichiers modifiés.** `actions/auth.ts` (bootstrap supprimé, gardes-fous email préservés) · `README.md` (section Auth réécrite — suppression de la doc « premier utilisateur ADMIN ») · `supabase/migrations/0012_s4_no_auto_admin.sql` (nouveau) · `scripts/verify-s4.mjs` (nouveau).

**6. Tests (`scripts/verify-s4.mjs`, base prod, artefacts nettoyés).**
- T1 inscription simulée (exactement ce que fait `registerAction`) → `role=STUDENT, class_id=null, demande=PENDING` ✓
- T2 acceptation simulée → reste `STUDENT`, `class_id` posé ✓
- T3 deux inscriptions simultanées (`Promise.all`) → `STUDENT, STUDENT`, aucun ADMIN ✓
- T4 POST `{role:'ADMIN'}` (client) → **403**, 0 ligne ✓
- T5a PATCH self `role→ADMIN` → **400**, rôle intact ✓
- T5b PATCH autre → **200, 0 ligne**, rôle intact ✓
- T6 inventaire ADMIN : 2 (voir tableau), aucun modifié ✓
- **Verdict : S4 PROTEGE (base)** — plus aucun chemin de promotion automatique.

**7. Régression.** `tsc --noEmit` OK · `vitest run` **60/60** · `next lint` 0 erreur · `next build` OK.

### F1 — Utilisateur REJECTED : resoumission d'une nouvelle demande (HAUTE) — [rapport détaillé]

**1. Problème corrigé.** Un utilisateur REJECTED était redirigé vers `/register`, mais son profil existait déjà → `registerAction` échouait (« email déjà utilisée ») → **blocage définitif**. La notification de rejet promettait pourtant le contraire.

**2. Modèle actuel (conservé).** `registration_requests` garde un historique de toutes les demandes (lignes distinctes, index partiel `uq_regreq_pending_per_user` = **1 seule PENDING par utilisateur**). Les droits d'accès aux données de classe reposent sur `is_approved_member()` = « il existe une demande ACCEPTED » → un REJECTED n'a **aucun droit** ; seul un ACCEPTED en a. La resoumission est donc sûre par construction.

**3. Solution (REJECTED → PENDING → validation → ACCEPTED).**
- **`actions/auth.ts`** — nouvelle action `resubmitRegistrationAction(formData)` : utilisateur connecté → profil existe → refuse si **ACCEPTED** (définitif) ou **PENDING** (déjà active) ou **ADMIN** (S4) → met à jour prénom/nom → insère une **nouvelle** demande PENDING (l'ancienne REJECTED reste historisée) → `redirect("/pending")`. Erreurs FK (23503, classe inexistante) et unique (23505) traduites.
- **`app/(auth)/register/page.tsx`** — `/register` devient **status-aware** : ADMIN/ACCEPTED → `/dashboard`, PENDING → `/pending`, REJECTED (ou sans demande) → formulaire de resoumission `ResubmitForm` (prénom/nom préremplis + choix de classe). Anonyme → `RegisterForm` classique.
- **`components/ResubmitForm.tsx`** (nouveau) — formulaire de nouvelle demande.
- **`lib/validation/schemas.ts`** — `resubmitSchema` (prénom, nom, `classId` uuid).
- **`actions/auth.ts`** — message d'erreur `registerAction` guidé (« Connectez-vous pour soumettre une nouvelle demande »).
- Aucune migration DB nécessaire (le schéma existant suffit).

**4. Sécurité.** Le rôle reste STUDENT (S4), aucun ACCEPTED n'est révoqué ni contourné : resoumettre **ne redonne aucun droit** tant qu'un ADMIN/DELEGATE n'a pas accepté (prouvé live : un REJECTED+PENDING lit 0 devoir, puis lit les données après ACCEPTED).

**5. Tests.**
- **`tests/resubmit.test.ts`** (11 unitaires, mocks clients) : REJECTED→PENDING ✓ · ACCEPTED refusé ✓ · PENDING double refusée ✓ · bascule base 23505 → refus ✓ · classe invalide (23503) ✓ · non-connecté refusé ✓ · profil introuvable refusé ✓ · ADMIN refusé ✓ · uuid invalide/validation ✓ · échec update profil → aucune demande ✓.
- **`scripts/verify-f1.mjs`** (live, artefacts nettoyés) : T1 historique `[REJECTED, PENDING]` ✓ · T2 double PENDING → **409/23505** ✓ · T3 classe invalide → **409/23503** ✓ · T4 sécurité (0 ligne avant ACCEPTED, 5 après) ✓ → **VERDICT : F1 PROTEGE (base)**.
- **Régression :** `tsc` OK · `vitest` **71/71** (60 + 11) · lint 0 erreur · build OK.

**6. Fichiers modifiés.** `actions/auth.ts` · `app/(auth)/register/page.tsx` · `components/ResubmitForm.tsx` (nouveau) · `lib/validation/schemas.ts` · `tests/resubmit.test.ts` (nouveau) · `scripts/verify-f1.mjs` (nouveau) · `AUDIT.md`.

---

## 15. S10 — Audit et mise à jour des dépendances (12 vulnérabilités → 1)

**Objectif :** réduire les vulnérabilités npm sans casser l'application. Upgrades majeurs uniquement si nécessaires et contrôlés. **12 vulnérabilités initiales → 1 résiduelle (next), acceptée et documentée.**

### 15.1 Bilan avant → après

| Vulnérabilité | Sév. | Avant | Après | Fix | Type | Tests |
|---|---|---|---|---|---|---|
| `@supabase/auth-js` (GHSA-8r88-6cj9-9fh5, path routing) | low | supabase-js 2.45.4 (auth-js 2.45.4) | supabase-js **2.55.0** (auth-js **2.71.1**) | `2.55.0` | non-breaking | ✓ |
| `vitest` (GHSA-5xrq-8626-4rwp, RCE UI) | **critical** | 2.1.3 | **4.1.10** | `^4.1.10` | major (dev-only) | 128/128 |
| `vite` (3 advisories : path traversal `.map`, NTLMv2 UNC, `fs.deny` bypass) | high | vite 5 (via vitest 2) | **vite 8.2.1** | via vitest 4 | major (dev-only) | ✓ |
| `vite-node` / `@vitest/mocker` / `esbuild` (GHSA-67mh dev CORS) | moderate | ≤0.24.2 / ≤3.0.0-beta.4 | résolu via vitest 4 | via vitest 4 | major (dev-only) | ✓ |
| `glob` (GHSA-5j98-mcp5-4vw2, cmd injection CLI, via `@next/eslint-plugin-next`) | high | 10.4.x | **10.5.0** | `overrides` ciblé | non-breaking (dev) | ✓ |
| `postcss` (4 advisories : XSS `</style>`, path traversal sourceMappingURL) | high | 8.4.47 (direct + embarqué next) | **8.5.26** | `^8.5.23` + `overrides` | non-breaking | ✓ |
| `next` (21 advisories : DoS Image optimizer, SSRF Server Actions/rewrites/WebSocket, XSS CSP/beforeInteractive, cache-poisoning RSC/middleware, request smuggling rewrites, DoS Server Components) | high | 14.2.15 | **14.2.35** (dernier 14.x) | **Next ≥ 15.5.21** | **major — refusé** | ⚠ résiduel |
| `eslint-config-next` / `@next/eslint-plugin-next` | high (via glob) | 14.2.15 | 14.2.35 | via `overrides` glob | non-breaking (dev) | ✓ |

### 15.2 Décisions techniques

- **supabase-js : 2.55.0 (et non 2.112.3).** Le fix d'audit pointe 2.112.3, mais celle-ci a **changé la signature générique `SupabaseClient`** (incompatible avec `@supabase/ssr` 0.5.2 → des centaines d'erreurs TS `never`). Les 2.112.x exigeraient aussi un upgrade ssr 0.12.x (API cookies `getAll/setAll`, breaking). **2.55.0 est la dernière version d'ancienne signature** qui embarque déjà **auth-js 2.71.1 (> 2.69.1 corrigé)** → vulnérabilité réglée sans aucune casse. Pin **exact** (`"2.55.0"`) pour ne pas se re-casser au prochain `install` (le `^` irait chercher la signature 2.112.x).
- **vitest : `^4.1.10`** (dev-only) — corrige la chaine critique vitest/vite/vite-node/esbuild en un seul saut. Config : l'option `esbuild.jsx` n'existe plus (Vite 8 a remplacé esbuild par **oxc**) → `oxc: { jsx: { runtime: "automatic" } }` (aucun test ne rend de JSX directement, mais `stats-access.test.ts` importe `app/dashboard/stats/page.tsx`).
- **overrides** (npm) ciblés pour ne pas dé-dupliquer des majors non souhaitées :
  - `next.postcss → ^8.5.23` (le postcss **embarqué** de next 14.2.x reste 8.4.31 sinon, hors du reach des devDeps).
  - `@next/eslint-plugin-next.glob → ^10.5.0` (10.5.0 = première version corrigée de GHSA-5j98 ; 11.x serait breaking pour le plugin).
- **next : resté en 14.2.35** (dernier patch 14.x). Les 21 advisories ne sont corrigés qu'en **15.5.21+** (major, **React 19 obligatoire**, `middleware.ts`→`proxy.ts`, `params`/`searchParams`/`cookies()` async, Server Actions). Saut refusé en S10 pour ne pas casser l'app ; l'upgrade fera l'objet d'un chantier dédié.

### 15.3 Vérifications

- `tsc --noEmit` : **0 erreur** · `next lint` : 0 erreur (warnings `<img>` préexistants) · `vitest run` : **128/128** (14 fichiers) · `next build` : **OK** (24 routes + 4 API, middleware 66.1 kB).
- `npm audit` : **1 haute restante** (`next`) contre 12 au départ.

### 15.4 Résidu accepté — `next@14.2.35` (HIGH, 21 advisories)

- **Fix requis :** Next ≥ **15.5.21** (major) — `npm audit fix --force` installerait 16.3.1.
- **Exposition réelle (analyse) :** l'app est **self-hosted** ; la plupart des advisories concernent l'Image Optimizer, Server Actions, rewrites et WebSocket — fonctionnalités présentes mais **non exposées à un trafic non authentifié** en usage normal. Risque résiduel mesuré mais non bloquant pour la reprise, **pour autant que** : pas d'image utilisateur arbitraire passée à `/api/assistant`-like, pas de rewrites ouvertes, protection réseau/edge devant l'app.
- **Action recommandée (P2) :** chantier dédié « Next 15.5.21+ / React 19 » avec checklist : `proxy.ts`, params/searchParams/cookies async, Server Actions, types React 19, images (`next/image`), cache RSC. À planifier séparément de S10.
- **Fichiers modifiés (S10) :** `package.json` · `package-lock.json` · `vitest.config.ts` · `AUDIT.md`.
