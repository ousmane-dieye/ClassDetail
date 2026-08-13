# ClassPulse

Plateforme SaaS académique multi-classes pour étudiants : tâches, documents, Hints (anciens devoirs/examens), cours enregistrés, chat de classe temps réel, centre de notifications unifié, assistant IA contextuel et statistiques.

> Budget : 0 FCFA. Stack 100 % free-tier : Next.js + Supabase (PostgreSQL, Auth, Realtime) + Vercel + SMTP (email administrateur) + Google Drive (stockage externe des liens uniquement) + OpenAI (assistant, optionnel).

---

## Sommaire

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Rôles](#rôles)
- [Architecture](#architecture)
- [Architecture temps réel](#architecture-temps-réel)
- [Stack](#stack)
- [Centre de notifications](#centre-de-notifications)
- [Assistant IA contextuel](#assistant-ia-contextuel)
- [Outils IA](#outils-ia)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration Supabase](#configuration-supabase)
- [Migrations PostgreSQL](#migrations-postgresql)
- [Auth Supabase](#auth-supabase)
- [Variables d'environnement](#variables-denvironnement)
- [Configuration OpenAI](#configuration-openai)
- [Emails automatiques (J-3 / J-1)](#emails-automatiques-j-3--j-1)
- [Scheduler (Vercel Cron)](#scheduler-vercel-cron)
- [Configuration Resend / SMTP](#configuration-resend--smtp)
- [Configuration Google Drive](#configuration-google-drive)
- [Sécurité](#sécurité)
- [RLS (Row Level Security)](#rls-row-level-security)
- [Performance](#performance)
- [Structure du projet](#structure-du-projet)
- [Développement local](#développement-local)
- [Production](#production)
- [Tests](#tests)
- [Dépannage](#dépannage)

---

## Présentation

ClassPulse centralise la vie académique d'une classe : ce qu'il y a à faire, les ressources pédagogiques, les anciens sujets, les cours enregistrés, la discussion de groupe et le suivi statistique — pour plusieurs classes en même temps, chacune isolée des autres.

L'application n'est pas destinée aux enseignants : elle est pensée pour les étudiants, avec un système de délégués qui assurent une partie de la modération et de la gestion, sous la supervision d'administrateurs.

## Fonctionnalités

- **Authentification** par email/mot de passe (Supabase Auth), inscription avec sélection obligatoire d'une classe et validation par un délégué ou un administrateur.
- **Classes & matières** : gestion multi-classes, matières rattachées à chaque classe.
- **Tâches** : création par ADMIN/DELEGATE, complétion individuelle par chaque étudiant (table `task_completions` séparée de `tasks`), code couleur automatique selon l'échéance, expiration automatique après 24h via Vercel Cron.
- **Rappels automatiques** (J-3 et J-1) par notification interne + email, sans doublon (contrainte unique en base).
- **Documents** et **Hints** (anciens devoirs/examens) : ajoutés par tous les étudiants, liens Google Drive uniquement (aucun upload de fichier dans l'app).
- **Cours enregistrés** : gérés par délégués/admins, consultables par tous.
- **Chat de classe en temps réel** via Supabase Realtime, isolé par classe, avec **annonces** épinglées (délégués/admins) notifiant toute la classe.
- **Centre de notifications unifié** : compteur temps réel, filtres par catégorie, marquage lu/tout lu, regroupement par date, navigation vers l'élément.
- **Assistant IA contextuel** : répond avec les vraies données de la plateforme (RBAC respecté), propose des actions de navigation validées par une liste blanche, streaming de la réponse.
- **Statistiques** calculées en direct depuis PostgreSQL (aucune donnée fictive/hardcodée) : par classe pour les délégués, globales + par classe pour les admins.
- **Sécurité par Row Level Security** : chaque règle métier (isolation par classe, permissions par rôle) est appliquée au niveau PostgreSQL, pas seulement côté frontend.

## Rôles

| Rôle | Description |
|---|---|
| `STUDENT` | Étudiant validé. Consulte les ressources, complète ses tâches, participe au chat de classe. |
| `DELEGATE` | Un `STUDENT` promu par un `ADMIN`. Toutes les permissions `STUDENT` + gestion des tâches/cours/inscriptions/chat/statistiques **de sa seule classe**. |
| `ADMIN` | Vision et gestion globale : classes, matières, rôles, toutes les données. |

Un étudiant ne peut jamais modifier lui-même son rôle ou sa classe (bloqué à la fois par un trigger PostgreSQL et par les policies RLS).

## Architecture

```
Navigateur (React / Next.js App Router)
        │
        ▼
Server Actions & Route Handlers (Next.js, côté serveur)
        │
        ▼
Supabase (Auth + PostgreSQL + Realtime)
        │
        ▼
PostgreSQL (source de vérité, RLS actif sur toutes les tables sensibles)
```

- **Server Actions** pour toutes les mutations (validation Zod serveur + RLS).
- **Route Handlers** : `/api/assistant` (streaming IA), `/api/cron/reminders`, `/api/cron/cleanup`.
- **Emails** : SMTP (nodemailer) avec l'adresse de l'administration en expéditeur, déclenchés côté serveur. Repli optionnel sur Resend.
- **Fichiers** : jamais uploadés — seuls les liens Google Drive sont stockés et validés.

## Architecture temps réel

Supabase Realtime (WebSocket) est utilisé pour **toutes** les données importantes — aucun polling agressif.

**Abonnements `postgres_changes`** (sous réserve de RLS — un utilisateur ne reçoit que ce qu'il a le droit de lire) :

| Table | Usage |
|---|---|
| `notifications` | Compteur de la cloche + centre de notifications en direct |
| `tasks` / `documents` / `hints` / `recordings` | Listes rafraîchies sans F5 |
| `task_completions` | Badge de complétion en direct |
| `chat_messages` | Chat de classe |

**Canaux Broadcast éphémères** :
- `presence-<class_id>` : présence en ligne (rien n'est persisté).

**Reconnexion** : le client Supabase se reconnecte automatiquement. L'état de connexion est affiché (bannière "Connexion perdue — reconnexion…"). Les données manquées sont resynchronisées au retour (rafraîchissement ciblé).

**Polling intelligent** : uniquement pour les données non couvertes par Realtime, avec pause automatique quand l'onglet est inactif (`useSmartPolling` / `usePageActive` dans `lib/realtime/hooks.ts`).

## Stack

- Next.js 14 (App Router) + TypeScript strict (`noUncheckedIndexedAccess`)
- PostgreSQL via Supabase, Supabase Auth, Supabase Realtime
- Tailwind CSS (classes utilitaires façon shadcn/ui), Lucide Icons
- Zod pour la validation serveur
- SMTP (nodemailer) pour les emails transactionnels — repli optionnel sur Resend
- OpenAI (optionnel pour les emails, requis pour l'assistant) — appel **uniquement côté serveur**
- Vercel (hébergement + Cron) — free tier
- Vitest pour les tests unitaires

## Centre de notifications

Page : `/dashboard/notifications`. Cloche : `/dashboard` (compteur en temps réel).

- **NotificationService** : `lib/notifications/service.ts` — `createNotification({ userId, type, title, message, entityType, entityId, link })` + `notifyClassMembers`.
- Chaque notification : type, titre, message, utilisateur concerné, date, lien interne, statut lu/non lu, catégorie dérivée du type.
- Filtres : Toutes / Non lues / Devoirs / Cours / Documents / Hints / Annonces / Système.
- Actions : "Tout marquer comme lu", clic → ouvre l'élément (devoir, document…), pagination incrémentale, regroupement par date (Aujourd'hui / Hier / date).

Types couverts : `TASK_CREATED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_UPDATED`, `TASK_COMPLETED`, `TASK_REMINDER`, `DOCUMENT_ADDED`, `HINT_ADDED`, `COURSE_SAVED`, `COURSE_UPDATED`, `RECORDING_ADDED`, `ANNOUNCEMENT_CREATED`, `REGISTRATION_ACCEPTED`, `REGISTRATION_REJECTED`, `DELEGATE_APPOINTED`, `DELEGATE_REMOVED`.

## Assistant IA contextuel

Bouton flottant ✨ accessible sur tout le tableau de bord (`/dashboard`). Panneau : header (historique, nouveau chat, suppression), messages avec markdown sécurisé, actions rapides ("Mes devoirs", "Mes tâches", "Mes cours", "Mes deadlines", "Mes notifications"), streaming de la réponse (SSE).

- **`/api/assistant`** (Route Handler, serveur uniquement) : rate limiting (10/min, 60/h), validation Zod, historique (30 derniers échanges), boucle d'outils (ReAct, max 4 itérations), persistance, streaming SSE.
- **Contexte** : prénom, rôle, classe, date/heure actuelles injectés dans le prompt système.
- **RBAC strict** : les outils utilisent le client Supabase **de l'utilisateur** (cookies de session), jamais le service role → un étudiant ne peut jamais lire les données d'un autre, même en interrogeant l'IA.
- **Dégradable** : sans `OPENAI_API_KEY`, l'assistant répond avec un message explicatif + actions de navigation (jamais de crash).
- L'IA ne peut jamais inventer d'URL : les actions passent par `sanitizeAssistantActions` + liste blanche (`/dashboard…`).

## Outils IA

`lib/ai/tools.ts` (function calling) :

- `getUpcomingDeadlines` — devoirs à venir dans N jours (défaut 7).
- `getMyAssignments` / `getMyTasks` — tous les devoirs de la classe.
- `getMyCourses` / `getMySavedCourses` — cours enregistrés.
- `getMyDocuments` — documents pédagogiques.
- `getMyHints` — anciens devoirs/examens.
- `getMyNotifications` — dernières notifications (lu/non lu).
- `searchPlatform` — recherche dans les ressources (limitée à la classe via RLS).
- `suggestActions` — boutons de navigation (liste blanche uniquement).

## Prérequis

- Node.js ≥ 18.18
- Un compte [Supabase](https://supabase.com) (gratuit)
- Un compte SMTP dont l'expéditeur (`EMAIL_FROM`) est autorisé — ou un compte [Resend](https://resend.com) en repli
- (Optionnel) Une clé API [OpenAI](https://platform.openai.com) pour l'assistant IA

## Installation

```bash
cd classpulse
npm install
cp .env.example .env.local
# puis remplir .env.local (voir "Variables d'environnement")
npm run dev
```

## Configuration Supabase

1. Créez un projet sur [supabase.com](https://supabase.com/dashboard).
2. Dans **Project Settings → API** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, jamais exposée au navigateur).
3. **Authentication → Providers** : laissez uniquement **Email** activé.
4. **Authentication → URL Configuration** : ajoutez l'URL de production (et `http://localhost:3000` en dev) dans les "Redirect URLs".
5. **Realtime** : la publication `supabase_realtime` est activée par les migrations (tables listées en "Architecture temps réel"). `chat_messages` y est garanti par `0007_chat_realtime.sql`. Vérifiez que le projet Supabase est sur un plan qui autorise Realtime.

## Migrations PostgreSQL

Le schéma complet est dans `supabase/schema.sql` (tables, enums, contraintes, index, triggers, fonctions, policies RLS, publication realtime).

Pour une base **nouvelle** : exécutez `supabase/schema.sql` dans le SQL Editor, puis optionnellement `supabase/seed.sql`.

Pour une base **existante** déjà déployée avant la plateforme temps réel, exécutez dans l'ordre :
1. `supabase/migrations/0001_email_notifications.sql`
2. `supabase/migrations/0002_realtime_platform.sql`
3. `supabase/migrations/0003_presence_realtime.sql`
4. `supabase/migrations/0004_announcements.sql` (annonces de classe)
5. `supabase/migrations/0005_security_realtime_fixes.sql` (sécurité + `task_completions` temps réel)
6. `supabase/migrations/0006_remove_messaging.sql` (suppression des tables de messagerie privée)
7. `supabase/migrations/0007_chat_realtime.sql` (publication Realtime du chat de classe)

Tout est écrit pour être ré-exécutable sans erreur (`if not exists` / `drop policy if exists`).

Puis créez votre premier utilisateur via `/register` et promouvez-le :

```sql
update profiles set role = 'ADMIN' where email = 'votre.email@exemple.com';
```

## Auth Supabase

1. L'utilisateur remplit prénom / nom / email / mot de passe / classe.
2. `supabase.auth.signUp` crée le compte ; un profil `profiles` est créé (`STUDENT`), avec une ligne `registration_requests` (`PENDING`).
3. Le premier utilisateur est automatiquement `ADMIN` (sinon personne ne pourrait valider les suivants).
4. Un `ADMIN`/`DELEGATE` accepte ou refuse (`decideRegistrationAction`) — décision définitive.
5. Le layout `app/dashboard/layout.tsx` vérifie le statut de la dernière demande avant d'autoriser l'accès.

## Variables d'environnement

```env
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Email administrateur / SMTP ---
EMAIL_HOST=smtp.votredomaine.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=admin@votredomaine.com
EMAIL_PASSWORD=xxxxxxxx
EMAIL_FROM=admin@votredomaine.com
EMAIL_FROM_NAME=Administration - ClassPulse

# --- Repli optionnel si SMTP non configuré ---
RESEND_API_KEY=
RESEND_FROM_EMAIL=ClassPulse <noreply@votredomaine.com>

# --- OpenAI (assistant IA) ---
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# --- Identité de la plateforme ---
PLATFORM_NAME=ClassPulse
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_TIMEZONE=Africa/Dakar
ADMIN_CONTACT_EMAIL=admin@votredomaine.com
EMAIL_TEST_ALLOWLIST=admin@votredomaine.com

# --- Vercel Cron ---
CRON_SECRET=
```

`CRON_SECRET` : valeur aléatoire forte (`openssl rand -hex 32`). Sans le header `Authorization: Bearer <CRON_SECRET>`, les endpoints `/api/cron/*` répondent 401.

⚠️ Les clés (`EMAIL_PASSWORD`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) ne sont **jamais** exposées au frontend ni préfixées `NEXT_PUBLIC_`.

## Configuration OpenAI

- `OPENAI_API_KEY` : requise uniquement pour l'assistant IA contextuel. L'appel se fait exclusivement côté serveur (Route Handler `/api/assistant`), jamais dans le navigateur.
- `OPENAI_MODEL` : modèle utilisé (défaut `gpt-4o-mini`).
- Si la clé est absente ou si l'API est en erreur, l'assistant répond en mode dégradé (message explicatif + navigation) et l'envoi des emails n'est jamais bloqué.
- Rate limiting : 10 messages/minute et 60/heure par utilisateur.

## Emails automatiques (J-3 / J-1)

Deux emails automatiques par devoir non rendu, déclenchés chaque jour par `/api/cron/reminders` :

```
DATE LIMITE
   │
   ▼  J-3  →  "Rappel : devoir à rendre dans 3 jours"
   ▼  J-1  →  "⚠️ Dernier rappel : devoir à rendre demain"
   ▼  DATE LIMITE
```

- Décompte en jours calendaires dans le fuseau de l'application (`NEXT_PUBLIC_APP_TIMEZONE`).
- Un devoir déjà rendu, supprimé, ou déjà notifié ne déclenche rien (anti-doublon : contrainte unique + table `assignment_email_notifications`).
- Logique pure testée dans `lib/email/reminders.ts`, templates dans `lib/email/templates.ts`, orchestration dans `lib/email/notifications.ts`.

## Scheduler (Vercel Cron)

`vercel.json` :

```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 6 * * *" },
    { "path": "/api/cron/cleanup", "schedule": "0 * * * *" }
  ]
}
```

- `/api/cron/reminders` : rappels J-3/J-1 (notification + email).
- `/api/cron/cleanup` : marque les tâches `EXPIRED` puis supprime définitivement celles expirées depuis plus de 24h.

## Configuration Resend / SMTP

- SMTP : `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME`. En dev, `smtp.resend.com` fonctionne avec une clé Resend.
- Repli Resend : si SMTP non configuré, `RESEND_API_KEY` + `RESEND_FROM_EMAIL` sont utilisés.
- Test : Administration → « Emails & Notifications » → « Envoyer un email de test », ou `node scripts/test-email.mjs`.

## Configuration Google Drive

ClassPulse ne gère aucun upload : chaque utilisateur crée son fichier dans son Google Drive, le partage en "Lecteur : toute personne disposant du lien", puis colle l'URL. L'application valide `drive.google.com` / `docs.google.com` (Zod) et ouvre le lien avec `rel="noopener noreferrer"`.

## Sécurité

- **Frontend jamais la couche de sécurité** : chaque Server Action revalide avec Zod puis s'appuie sur RLS.
- **RBAC PostgreSQL** : rôles, isolation par classe, `prevent_self_privilege_escalation`.
- **Clés secrètes côté serveur uniquement** (`lib/supabase/admin.ts`, Route Handlers).
- **Protection IDOR** : policies RLS qui vérifient `class_id`/`role`/`author_id`.
- **Assistant IA** : rate limiting (10/min, 60/h), outils via client utilisateur (RLS), actions filtrées par liste blanche, clé API jamais exposée, logs sans secret (`sanitizeError`).
- **XSS** : rendu React (échappé), markdown maison avec URLs filtrées (aucun HTML injecté).
- **WebSocket/Realtime** : chaque souscription passe par RLS ; les canaux Broadcast ne transportent que des données minimales.

## RLS (Row Level Security)

Toutes les tables métier ont RLS activé. Exemples (voir `supabase/schema.sql`) :

- `tasks_write` : `is_admin() OR is_delegate_of(class_id)`.
- `documents_delete` : auteur, délégué de la classe, ou admin.
- `chat_select` / `chat_insert` : membres de la classe (`is_member_of`).
- `notifications_select` : `recipient_id = auth.uid()`.
- `assistant_chats_*` / `assistant_msgs_*` : propriétaire uniquement (`user_id = auth.uid()`).

## Performance

- **Temps réel au lieu du polling** : `postgres_changes` pour toutes les données importantes.
- **Mises à jour ciblées** : un événement Realtime ne recharge jamais la page — seul le composant concerné est mis à jour (ajout d'un message, incrément du compteur, tri de la liste).
- **Chargements SSR ciblés** : `router.refresh()` debouncé (500 ms) pour les listes, jamais de reload complet.
- **Caches** : cache de noms d'utilisateurs côté client (`nameMapRef` dans `ChatRoom`).
- **Index PostgreSQL** : index sur les colonnes de filtrage (`class_id`, `recipient_id`, `created_at`…).
- **Limites de pagination** : notifications (30 + "charger plus"), historique IA (30).
- **Images** : `loading="lazy"` pour les pièces jointes ; `rel="noopener noreferrer"` sur les liens externes.
- Aucune librairie superflue : tout est construit sur Supabase Realtime + React, sans dépendance ajoutée sans justification.

## Structure du projet

```
classpulse/
├── app/
│   ├── (auth)/login, register, pending
│   ├── dashboard/
│   │   ├── layout.tsx                       # Garde d'accès + cloche + assistant
│   │   ├── student/ delegate/ admin/         # Tableaux de bord par rôle
│   │   ├── tasks/ documents/ hints/ recordings/
│   │   ├── chat/ notifications/ stats/
│   ├── api/assistant/route.ts               # Assistant IA (SSE + outils)
│   ├── api/cron/reminders, cleanup          # Rappels + expiration
├── actions/                                 # Server Actions (mutations)
├── components/
│   ├── notifications/NotificationsCenter.tsx
│   ├── assistant/                           # AssistantFab, AssistantPanel, Markdown
│   ├── Sidebar, ChatRoom, NotificationBell, RealtimeListSync, TaskCard, …
├── lib/
│   ├── ai/ (openai.ts, tools.ts, personalize.ts)
│   ├── messaging/ (helpers.ts, presence.ts, markdown.ts)
│   ├── notifications/service.ts             # NotificationService
│   ├── realtime/hooks.ts                    # Hooks temps réel + polling intelligent
│   ├── security/rateLimit.ts
│   ├── supabase/ (client, server, admin)
│   ├── email/ (emailService, reminders, templates, notifications)
│   ├── validation/schemas.ts
│   └── business/ (taskStatus, permissions)
├── types/database.types.ts
├── tests/                                   # 73 tests unitaires
├── supabase/schema.sql, seed.sql, migrations/
├── vercel.json, .env.example, .eslintrc.json
└── README.md
```

## Développement local

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # ESLint (next/core-web-vitals)
npm run test         # Vitest (73 tests)
npm run test:watch
```

## Production

```bash
npm run build
npm run start
```

Déploiement Vercel : poussez sur un dépôt, importez sur [vercel.com](https://vercel.com/new), ajoutez les variables d'environnement (Production **et** Preview), déployez. Ajoutez l'URL de production dans les Redirect URLs de Supabase Auth. `vercel.json` configure les Cron Jobs automatiquement.

## Tests

`npm run test` — 52 tests couvrent :

- **Tâches** : couleurs J-6→J, jours restants, suppression 24h (`tests/taskStatus.test.ts`).
- **Emails** : expéditeur admin, anti-doublon, statut FAILED sans mot de passe, OpenAI down → email envoyé (`tests/emailService.test.ts`).
- **Rappels** : J-3/J-1, devoir rendu, sélection (`tests/reminders.test.ts`).
- **Notifications** : catégorisation des types, insertion, notification de classe avec exclusion (`tests/notifications.test.ts`).
- **Assistant** : liste blanche des liens, sanitisation des actions (`tests/assistantTools.test.ts`).
- **Permissions** : matrice RBAC complète (`tests/permissions.test.ts`).

## Dépannage

**"Aucune classe n'apparaît sur la page d'inscription"**
→ Vérifiez que `schema.sql` a bien été exécuté et que la policy `classes_select` existe.

**"Erreur 401 sur les routes /api/cron/*"**
→ Le header `Authorization: Bearer <CRON_SECRET>` doit correspondre à `CRON_SECRET` configuré sur Vercel.

**"new row violates row-level security policy"**
→ RLS fonctionne : l'utilisateur n'a pas la permission. Vérifiez rôle/classe, ou la policy concernée.

**"Realtime ne met pas à jour la page"**
→ Vérifiez que la table est dans la publication `supabase_realtime` (`select * from pg_publication_tables where pubname='supabase_realtime'`). Pour le chat de classe, exécutez `supabase/migrations/0007_chat_realtime.sql` si `chat_messages` n'y figure pas. Vérifiez aussi que l'utilisateur a le droit de LIRE la ligne (RLS).

**"L'assistant répond 'pas configuré'"**
→ `OPENAI_API_KEY` absente côté serveur. Ajoutez-la (et éventuellement `OPENAI_MODEL`). Vérifiez le rate limit si l'erreur mentionne "Limite".

**"Emails non reçus"**
→ Vérifiez `EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASSWORD` (SMTP) ou `RESEND_API_KEY` + domaine vérifié.

**"Impossible de supprimer une classe"**
→ Comportement voulu : une classe contenant encore des membres ne peut pas être supprimée.

---

Projet réalisé dans le cadre d'un exercice de conception SaaS étudiant — Génie Informatique, ESP Dakar.
"# ClassDetail" 
