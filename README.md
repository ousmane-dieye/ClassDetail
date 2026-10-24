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
- [Emploi du temps](#emploi-du-temps)
- [Évaluations](#évaluations)
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
- **Emploi du temps** : calendrier hebdomadaire sur desktop, agenda journalier sur mobile, séances récurrentes avec exceptions ponctuelles datées, couleur stable par matière, publication contrôlée par les délégués, notifications de publication et d'annulation.
- **Évaluations** : CC, devoirs surveillés, examens, rattrapages, TP… créés par les délégués/admins en brouillon ou publiés directement, **chapitres concernés et ressources de révision toujours facultatifs**, annulation tracée avec motif, report daté, avertissements de conflit (non bloquants) avec les autres évaluations et avec les cours.
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
- Filtres : Toutes / Non lues / Devoirs / Emploi du temps / Évaluations / Cours / Documents / Hints / Annonces / Système.
- Actions : "Tout marquer comme lu", clic → ouvre l'élément (devoir, document…), pagination incrémentale, regroupement par date (Aujourd'hui / Hier / date).

Types couverts : `TASK_CREATED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_UPDATED`, `TASK_COMPLETED`, `TASK_REMINDER`, `DOCUMENT_ADDED`, `HINT_ADDED`, `COURSE_SAVED`, `COURSE_UPDATED`, `RECORDING_ADDED`, `ANNOUNCEMENT_CREATED`, `REGISTRATION_ACCEPTED`, `REGISTRATION_REJECTED`, `DELEGATE_APPOINTED`, `DELEGATE_REMOVED`, `SCHEDULE_PUBLISHED`, `SCHEDULE_UPDATED`, `SESSION_CANCELLED` (catégorie `schedule`), `EVALUATION_PUBLISHED`, `EVALUATION_UPDATED`, `EVALUATION_CANCELLED` (catégorie `evaluations`).

## Paramètres de notifications

Page : `/dashboard/settings/notifications` (entrée « Mon compte » de la sidebar desktop et menu « Plus » mobile, tous rôles).

Chaque utilisateur choisit **par catégorie** ses deux canaux, indépendamment l'un de l'autre :

| Catégorie | Identifiant | Canal interne (défaut) | E-mail (défaut) | Événements réellement branchés |
|---|---|---|---|---|
| Devoirs | `ASSIGNMENTS` | activé | désactivé | `ASSIGNMENT_CREATED`, `ASSIGNMENT_UPDATED` (email) / + `TASK_CREATED`, `TASK_COMPLETED` (interne uniquement) |
| Rappels de devoirs | `ASSIGNMENT_REMINDERS` | activé | **activé** | `TASK_REMINDER` (cron J-3 / J-1) + emails `ASSIGNMENT_3_DAYS` / `ASSIGNMENT_1_DAY` |
| Évaluations | `EVALUATIONS` | activé | **activé** | `EVALUATION_PUBLISHED`, `EVALUATION_UPDATED`, `EVALUATION_CANCELLED` |
| Emploi du temps | `SCHEDULE` | activé | désactivé | `SCHEDULE_PUBLISHED`, `SCHEDULE_UPDATED`, `SESSION_CANCELLED` |
| Annonces et communications | `ANNOUNCEMENTS` | activé | désactivé | `ANNOUNCEMENT_CREATED` |
| Ressources pédagogiques | `RESOURCES` | activé | désactivé | `DOCUMENT_ADDED`, `HINT_ADDED`, `RECORDING_ADDED` |
| Chat et messages | `CHAT` | activé | désactivé | *aucun événement notifié aujourd'hui* : les messages du chat ne déclenchent aucune notification, la catégorie est prête pour leur arrivée |

- **Absence de préférence = valeurs par défaut** : les comptes créés avant la migration conservent exactement le comportement de ClassPulse (rien à enregistrer, rien perdu). Une préférence enregistrée est toujours respectée ; seule l'action « Rétablir les défauts » supprime les lignes pour revenir aux valeurs par défaut.
- **Événements système hors préférences** : `REGISTRATION_ACCEPTED`, `REGISTRATION_REJECTED`, `DELEGATE_APPOINTED`, `DELEGATE_REMOVED` sont toujours notifiés en interne.
- **Emails essentiels hors préférences** : confirmation d'inscription, réinitialisation de mot de passe, e-mail d'acceptation de compte et e-mails de sécurité restent indépendants de cette page.
- **Application côté serveur uniquement** : `lib/notifications/preferences.ts` (`loadChannels`, lecture groupée) filtre la création des notifications (`lib/notifications/service.ts`), le dispatch d'emails (`lib/email/dispatch.ts`) et le cron des rappels — l'interface ne fait qu'afficher et enregistrer.
- **Mode dégradé** : si la lecture des préférences échoue, ce sont les valeurs par défaut qui s'appliquent (jamais une coupure généralisée ni une ouverture générale) et l'erreur est journalisée.
- **RLS** : `notification_preferences` n'a que des policies « propriétaire » (`user_id = auth.uid()`) — aucun utilisateur, aucun administrateur, ne peut lire ou modifier les préférences d'autrui.

Code : `lib/constants/notificationPreferences.ts` (identifiants, défauts, libellés, mapping type → catégorie), `lib/notifications/preferences.ts` (lecture), `actions/notification-preferences.ts` (enregistrement / réinitialisation), `components/settings/NotificationPreferencesForm.tsx`, `components/ui/Switch.tsx` (interrupteur accessible).

## Emploi du temps

Page : `/dashboard/schedule` (entrée de la sidebar desktop et du menu « Plus » mobile — les 5 emplacements de la bottom nav ne changent pas). Carte « Aujourd'hui » sur le dashboard étudiant.

- **Deux expériences selon la largeur réelle de l'écran** (bascule CSS, aucun sniflage d'appareil) : grille hebdomadaire sur desktop (≥ lg) avec jour actuel et trait d'heure courante ; agenda journalier + strip de jours sur mobile/tablette (< lg), jamais une grille rétrécie. Navigation semaine/jour locale, sans rechargement.
- **Séances récurrentes** : jour ISO (lundi → dimanche), plage horaire, validité (bornes inclusives, fin inclusive), salle, enseignant, statut `DRAFT` / `PUBLISHED`.
- **Exceptions ponctuelles datées** : annulation, déplacement horaire ou changement de salle sur une occurrence précise — la règle récurrente n'est jamais altérée.
- **Couleur par matière persistée en base** (`subjects.color_key`) : palette contrôlée de **20 couleurs** accessible en clair/sombre (`lib/constants/subjectColors.ts`, synchronisée avec le CHECK SQL par test) — chaque matière d'une classe a sa propre couleur jusqu'à 20 matières (ensuite la couleur boucle modulo 20, mais le nom reste toujours affiché : la couleur n'est jamais le seul identifiant). Un délégué ne peut changer que les couleurs des matières **de sa classe** (trigger `subjects_guard_update`, seule la colonne `color_key` est modifiable hors admin).
- **Conflits interdits, garantis en base** : pré-détecteur serveur (`lib/schedule/conflicts.ts`, message clair) doublé d'une contrainte d'exclusion GiST (`schedule_sessions_no_overlap`) — l'anti-course contre la double écriture est assuré au niveau PostgreSQL (SQLSTATE `23P01`).
- **Fuseau unique `Africa/Dakar`** : les dates/heures circulent en ISO local, aucun calcul de fuseau côté client.
- **Permissions** : `STUDENT` = lecture des séances publiées ; `DELEGATE` = gestion complète de **sa** classe (brouillons visibles) ; `ADMIN` = toutes les classes (sélecteur de classe via `?class=`). Les brouillons ne sont jamais notifiés.
- **Notifications** (système unifié, catégorie `schedule`) : `SCHEDULE_PUBLISHED` regroupée lors d'une publication de semaine, `SCHEDULE_UPDATED` ciblée par classe modifiée, `SESSION_CANCELLED` sur les classes impactées par l'annulation.
- **Realtime** : la page s'abonne aux insertions/mises à jour/suppressions de `schedule_sessions` et `schedule_session_exceptions` (filtre par classe), et le badge « Gestion active / Lecture seule » reflète le rôle courant.
- **Carte « Aujourd'hui »** (`TodayScheduleCard`) : prochain cours, cours en cours, états vides distincts (« aucun cours » vs « emploi du temps non publié »).

Migration : `supabase/migrations/0016_schedule.sql` (jamais exécutée automatiquement — voir l'ordre ci-dessous). Pour une base neuve, la section « Emploi du temps » est incluse dans `supabase/schema.sql`. Code : `actions/schedule.ts`, `components/schedule/*`, `lib/schedule/*`, page `app/dashboard/schedule/page.tsx`.

## Évaluations

Pages : `/dashboard/evaluations` (liste, entrée sidebar desktop + menu « Plus » mobile) et `/dashboard/evaluations/:id` (détail, lien des notifications). Carte « Prochaines évaluations » sur le dashboard étudiant et dans l'emploi du temps (bandeau facultatif — l'emploi du temps reste entier sans lui).

- **Cycle de vie simple** : `DRAFT` → `PUBLISHED` → `CANCELLED` (aucun statut « reportée » : un report est un changement de date, tracé en `rescheduled_from` et signalé par un badge). Les brouillons ne sont **jamais** exposés aux étudiants (RLS + contrôles serveur).
- **Chapitres concernés : 100 % facultatifs** — colonne `chapters text[] not null default '{}'`, aucun RLS/schema Zod n'exige leur présence, aucune valeur artificielle (« À définir »…) n'est jamais injectée. Huit tests dédiés verrouillent la règle (`tests/evaluations-validation.test.ts`).
- **Ressources de révision facultatives** : réutilisation pure des modules `documents` / `hints` existants (aucun second stockage de fichiers) via les tables de jointure `evaluation_documents` / `evaluation_hints` (FK composite vers `(id, class_id)`, isolation S3).
- **Rôles** : `STUDENT` lecture seule, `DELEGATE` gestion de sa classe, `ADMIN` toutes classes — vérifié côté serveur dans **chaque** Server Action + RLS PostgreSQL en dernière ligne (l'UI ne décide de rien).
- **Conflits = avertissements non bloquants** : chevauchement avec une autre évaluation ou avec un cours de l'emploi du temps, détecté uniquement quand l'horodatage est complet, renvoyé sur le succès et affiché en bandeau (`lib/evaluations/conflicts.ts`, pur et testé).
- **Notifications unifiées** (catégorie `evaluations`) : `EVALUATION_PUBLISHED` à la publication, `EVALUATION_UPDATED` sur modification matérielle ou report, `EVALUATION_CANCELLED` à l'annulation et au retrait d'une publiée — **jamais** pour un brouillon, **jamais** pour une édition de détail (chapitres/description seuls).
- **Annulation tracée** : l'évaluation reste visible avec son statut, un motif facultatif (300 car.) et sa date d'origine ; la suppression d'une publiée notifie explicitement un retrait.
- **Realtime** : la liste s'abonne aux `evaluations` de la classe (insert/update/delete) comme l'emploi du temps.

Migration : `supabase/migrations/0017_evaluations.sql` (jamais exécutée automatiquement — voir l'ordre ci-dessous). Pour une base neuve, la section « Évaluations » est incluse dans `supabase/schema.sql`. Code : `actions/evaluations.ts`, `components/evaluations/*`, `lib/evaluations/*`, pages `app/dashboard/evaluations/*`.

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
- `getMySchedule` — emploi du temps d'un jour. Le jour demandé (« lundi », « mardi »… ou numéro ISO 1-7) est transcrit dans le paramètre `weekday` et **converti en date par le serveur** (prochaine occurrence selon la pendule de l'app) : le modèle IA ne calcule jamais de date lui-même (correction d'un bug où « lundi » renvoyait une date fausse). Annulations et créneaux modifiés via exceptions datées ; séances publiées uniquement.
- `getMyEvaluations` — évaluations à venir (type, date, heures, salle, chapitres si renseignés, signalement « reportée ») ; brouillons jamais exposés, annulées conservées.
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
8. `supabase/migrations/0008_unique_profile_email.sql` (unicité d'email insensible à la casse)
9. `supabase/migrations/0009_s1_profiles_email_restriction.sql` (confidentialité des emails de profil)
10. `supabase/migrations/0010_s2_chat_announcements_restriction.sql` (anti-usurpation d'annonces)
11. `supabase/migrations/0011_s3_cross_class_restriction.sql` (anti-relations cross-class)
12. `supabase/migrations/0012_s4_no_auto_admin.sql` (aucun ADMIN automatique à l'inscription)
13. `supabase/migrations/0013_s6_notifications_readonly_fields.sql` (notifications en lecture seule)
14. `supabase/migrations/0014_s8_delegate_rights_alignment.sql` (droits délégué documents/hints)
15. `supabase/migrations/0015_s9_ai_rate_limits.sql` (rate limiting IA distribué)
16. `supabase/migrations/0016_schedule.sql` (emploi du temps : couleurs de matières, séances récurrentes, exceptions datées, contrainte anti-chevauchement GiST, RLS, notifications `schedule`)
17. `supabase/migrations/0017_evaluations.sql` (évaluations : enums, chapitres facultatifs, jointures ressources à FK composite, RLS (brouillons invisibles aux étudiants), Realtime, notifications `evaluations`)
18. `supabase/migrations/0018_notification_preferences.sql` (préférences de notifications : table `notification_preferences` + RLS propriétaire, colonnes d'entité et index d'anti-doublon des emails pédagogiques)

Tout est écrit pour être ré-exécutable sans erreur (`if not exists` / `drop policy if exists`).

⚠️ Les migrations ne s'exécutent **jamais** automatiquement : `0016_schedule.sql`, `0017_evaluations.sql` et `0018_notification_preferences.sql` doivent être appliquées manuellement dans le SQL Editor (staging d'abord, dans cet ordre) — elles n'ont encore été exécutées sur aucune base.

Puis créez votre premier ADMIN (jamais automatiquement) :

```bash
node scripts/create-admin.mjs admin@classpulse.app "VotreMotDePasse"
```

## Auth Supabase

1. L'utilisateur remplit prénom / nom / email / mot de passe / classe.
2. `supabase.auth.signUp` crée le compte ; un profil `profiles` est créé (`STUDENT`, sans classe), avec une ligne `registration_requests` (`PENDING`).
3. **Aucun utilisateur ne devient ADMIN via l'inscription publique** (S4) : un ADMIN est créé explicitement par l'administrateur système (`scripts/create-admin.mjs` ou SQL via le service role). Les inscriptions simultanées suivent toutes le même workflow.
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
│   │   ├── schedule/ evaluations/            # Emploi du temps + évaluations
│   ├── api/assistant/route.ts               # Assistant IA (SSE + outils)
│   ├── api/cron/reminders, cleanup          # Rappels + expiration
├── actions/                                 # Server Actions (mutations)
├── components/
│   ├── notifications/NotificationsCenter.tsx
│   ├── assistant/                           # AssistantFab, AssistantPanel, Markdown
│   ├── schedule/ evaluations/               # Vues des modules planning
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
│   ├── evaluations/ (constants, conflicts, listing, queries)
│   └── business/ (taskStatus, permissions)
├── types/database.types.ts
├── tests/                                   # 363 tests unitaires
├── supabase/schema.sql, seed.sql, migrations/
├── vercel.json, .env.example, .eslintrc.json
└── README.md
```

## Développement local

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # ESLint (next/core-web-vitals)
npm run test         # Vitest (363 tests)
npm run test:watch
```

## Production

```bash
npm run build
npm run start
```

Déploiement Vercel : poussez sur un dépôt, importez sur [vercel.com](https://vercel.com/new), ajoutez les variables d'environnement (Production **et** Preview), déployez. Ajoutez l'URL de production dans les Redirect URLs de Supabase Auth. `vercel.json` configure les Cron Jobs automatiquement.

## Tests

`npm run test` — 250 tests couvrent :

- **Tâches** : couleurs J-6→J, jours restants, suppression 24h (`tests/taskStatus.test.ts`).
- **Emails** : expéditeur admin, anti-doublon, statut FAILED sans mot de passe, OpenAI down → email envoyé (`tests/emailService.test.ts`).
- **Rappels** : J-3/J-1, devoir rendu, sélection (`tests/reminders.test.ts`).
- **Notifications** : catégorisation des types (dont les 3 types `schedule` et les 3 types `evaluations`), insertion, notification de classe avec exclusion (`tests/notifications.test.ts`).
- **Assistant** : liste blanche des liens, sanitisation des actions (`tests/assistantTools.test.ts`).
- **Permissions** : matrice RBAC complète (`tests/permissions.test.ts`).
- **Emploi du temps** : palette de couleurs synchronisée avec le CHECK SQL, dates/fuseau Africa/Dakar, détection de conflits, expansion récurrent + exceptions (annulation, déplacement, salle, matière), prochain cours, layout anti-chevauchement, matrice STUDENT/DELEGATE/ADMIN (`tests/schedule-*.test.ts`).
- **Évaluations** : chapitres facultatifs (8 tests dédiés), horaires facultatifs, ressources facultatives, conflits non bloquants (évaluation/évaluation, évaluation/cours), listing/tri/groupement/filtres, matrice STUDENT/DELEGATE/ADMIN des Server Actions (brouillon jamais notifié, édition de détail jamais notifiée, annulation tracée), garanties SQL de la migration 0017 (`tests/evaluations-*.test.ts`).
- **Navigation mobile** : bottom nav à 5 emplacements, permissions du menu « Plus » incluant `/dashboard/schedule` et `/dashboard/evaluations` pour tous les rôles (`tests/mobile-nav.test.ts`).

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
