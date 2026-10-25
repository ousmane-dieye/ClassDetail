# 01 — Inventaire fonctionnel (Rapports A et B)

> **Méthode.** Lecture intégrale du code applicatif, du schéma SQL et des migrations. L'application n'a **pas** été lancée contre une base réelle (risque d'écriture en production) ; seuls les tests unitaires ont été exécutés. « Confirmé » signifie donc : *implémentation présente et cohérente à la lecture du code (et, le cas échéant, couverte par un test unitaire)* — pas « vérifié en production ».
>
> Les identifiants `P-xxx` renvoient au registre `08-problemes-et-risques.md`.

---

## Partie A — Présentation générale

### A.1 Objectif réel

ClassePulse (nom de code `classpulse`) est une **plateforme web de vie de classe pour étudiants** (pas pour enseignants — `README.md` § Présentation). Elle centralise, **par classe et avec isolation stricte entre classes** :

- les **tâches/devoirs** publiés par les délégués, avec suivi de complétion individuel et rappels J‑3/J‑1 (notification + email) ;
- des **ressources partagées sous forme de liens Google Drive** : documents de cours, « Hints » (annales/anciens sujets), cours enregistrés (vidéos) ;
- un **chat de classe temps réel** avec **annonces** épinglées ;
- un **centre de notifications** ;
- un **assistant IA** qui répond à partir des données de la plateforme (outils en lecture seule) ;
- des **statistiques** pour délégués/administrateurs ;
- un **workflow d'inscription avec validation** par un délégué ou un administrateur.

### A.2 Problèmes adressés (déduits du code et du README)

Remplacer l'organisation informelle d'une promotion (un témoignage de la landing page évoque WhatsApp — `app/page.tsx`, texte marketing) : dispersion des échéances, des supports et des annales ; oubli des dates limites ; absence de canal officiel d'annonces.

### A.3 Types d'utilisateurs (enum `user_role`, `supabase/schema.sql:17-19`)

| Rôle | Obtention | Capacités principales |
|---|---|---|
| Visiteur anonyme | — | Landing page, inscription, connexion, mot de passe oublié. Peut lister les classes (nécessaire au formulaire d'inscription). |
| Compte en attente (`STUDENT` + demande `PENDING`) | Inscription publique | Page `/pending` uniquement (aucune donnée de classe via RLS). |
| Compte refusé (`STUDENT` + dernière demande `REJECTED`) | Décision d'un délégué/admin | Devrait pouvoir resoumettre (cassé, P-001). |
| `STUDENT` validé | Acceptation | Consulte tout le contenu de sa classe, coche ses tâches, ajoute documents et hints, chatte, utilise l'assistant. |
| `DELEGATE` | Promu par un ADMIN | STUDENT + gestion des tâches, cours enregistrés, validation des inscriptions, modération chat, annonces, suppression de contenus, statistiques — **limités à sa classe**. |
| `ADMIN` | Créé hors application (`scripts/create-admin.mjs` ou SQL) | Classes, matières, délégués, toutes les inscriptions, statistiques globales, tableau de bord des emails, email de test. |

Le README précise que les utilisateurs ciblés sont des étudiants d'informatique (ESP Dakar, « exercice de conception SaaS étudiant ») — **à confirmer** par le propriétaire pour la cible commerciale réelle.

### A.4 Plateformes

Web uniquement (responsive Tailwind). **Absent** : application mobile, PWA (pas de manifest ni service worker), API publique documentée.

### A.5 Services externes

Supabase (PostgreSQL, Auth, Realtime, PostgREST), Vercel (hébergement + Cron), SMTP (Gmail en local) ou Resend, LLM compatible OpenAI (Gemini en local), Google Drive (liens uniquement), Cloudflare Turnstile (optionnel, non fonctionnel côté client — P-006), Unsplash (images hotlinkées), Google Fonts (via `next/font`). Détail : `03-api-et-integrations.md`.

### A.6 Maturité observable

- Projet jeune : 8 commits en 9 jours, un seul contributeur, badge « Bêta » dans la barre latérale (`components/Sidebar.tsx:117-119`).
- Bonne base : TypeScript strict, Zod, RLS sur toutes les tables, 149 tests unitaires verts, correctifs de sécurité documentés (migrations 0009-0015).
- Mais : pas de CI, migrations manuelles, types de base écrits à la main, documentation partiellement obsolète, plusieurs failles d'autorisation et un bug bloquant (P-001).
- **Verdict : prototype avancé / MVP, non prêt pour une production à enjeux.**

### A.7 Fonctionnalités par degré d'achèvement

| Terminées (code cohérent) | Partielles / défectueuses | Annoncées mais absentes |
|---|---|---|
| Inscription, connexion, reset mot de passe, validation des inscriptions, tâches (CRUD + complétion), documents, hints, cours enregistrés, chat + annonces, notifications, assistant IA, statistiques, crons rappels/purge, emails | Resoumission après refus (inaccessible, P-001) ; gestion des contenus par l'ADMIN sans classe (P-002) ; retours d'erreur des formulaires (P-003) ; CAPTCHA (P-006) ; codes couleur J‑x (P-008) ; suppression de classe (P-004) | Présence en ligne et bannière de reconnexion (README § Architecture temps réel — aucun usage de `last_seen_at` ni de canal presence) ; recherche (bouton mort, P-014) ; renommage des conversations IA (action `renameChatAction` sans UI) ; table `class_members` (jamais lue ni écrite) ; types de notification `TASK_CREATED`, `COURSE_SAVED`, `COURSE_UPDATED` (jamais émis) |

### A.8 Limites visibles

Un utilisateur = une seule classe (`profiles.class_id`) ; pas de gestion des membres (retrait, transfert), pas d'édition de classe/matière, pas de suppression de matière, pas d'édition de profil, pas de suppression de compte, pas d'export, pas d'upload de fichiers (choix assumé : liens Drive), pas de recherche ni de tri/filtre sur les listes (hors notifications), les tâches sont **supprimées définitivement 24 h après l'échéance** (perte d'historique, P-054).

---

## Partie B — Inventaire détaillé

### B.1 Inventaire des interfaces (écrans)

| Route | Fichier | Accès | Rôle de l'écran | Données affichées (provenance) | Actions | États chargement / vide / erreur |
|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | Public | Landing marketing | Statique (images Unsplash, 3 témoignages **fictifs codés en dur**) | Liens login/register, ancres | — |
| `/login` | `app/(auth)/login/page.tsx`, `components/LoginForm.tsx` | Public (redirige vers `/dashboard` si connecté — `middleware.ts:40-42`) | Connexion | — | Email + mot de passe, afficher/masquer, lien « mot de passe oublié », widget Turnstile si clé publique | Bouton en chargement ; message d'erreur générique |
| `/register` | `app/(auth)/register/page.tsx`, `RegisterForm.tsx` / `ResubmitForm.tsx` | Public ; si connecté → redirigé par le middleware (P-001) | Inscription ou resoumission | Liste des classes (`classes`, requête anon) | Prénom, nom, email, mdp ×2, classe | Erreur affichée ; labels non reliés (a11y) |
| `/pending` | `app/(auth)/pending/page.tsx` | Tous | Attente de validation | Texte statique | **Aucune** (pas de déconnexion — P-005) | — |
| `/forgot-password` | `ForgotPasswordForm.tsx` | Public | Demande de lien | — | Email | Message neutre de succès |
| `/reset-password` | `ResetPasswordForm.tsx` | Session requise (sinon `/login`) | Nouveau mot de passe | — | Mdp ×2 | Erreurs Zod/Supabase affichées |
| `/recovery-error` | page statique | Public | Lien expiré | — | Lien « recevoir un nouveau lien » | — |
| `/dashboard` | `app/dashboard/page.tsx` | Connecté | Redirection : ADMIN→`/admin`, DELEGATE→`/delegate`, sinon `/student` | `profiles.role` | — | `loading.tsx` |
| Layout dashboard | `app/dashboard/layout.tsx` | Connecté ; PENDING→`/pending` ; REJECTED→`/register` | En-tête (initiales, nom, rôle), cloche, bouton recherche (inactif), thème, barre latérale, bouton assistant | profil, dernière demande, nb non lus | Navigation, déconnexion | — |
| `/dashboard/student` | `student/page.tsx` | Tous rôles validés | Accueil : tâches à venir (6), taux de complétion, urgences 48 h, 5 derniers documents, citation aléatoire | `tasks`, `task_completions`, `documents` | Cocher une tâche, liens | États vides illustrés ; `loading.tsx` |
| `/dashboard/delegate` | `delegate/page.tsx` | DELEGATE, ADMIN | Compteurs + demandes en attente de **sa** classe | `registration_requests` (via **service role**, y compris emails), comptes | Accepter / Refuser | Vide illustré ; aucune confirmation ni retour |
| `/dashboard/admin` | `admin/page.tsx` | ADMIN | Stats globales, demandes en attente (toutes classes), membres groupés par classe (+ « Sans classe »), création de classe, liste/suppression de classes, création de matière | via **service role** pour demandes et membres (emails visibles) | Accepter/Refuser, Promouvoir/Révoquer, Créer classe, Supprimer classe (modal), Créer matière | Pas de retour d'erreur (P-003) |
| `/dashboard/admin/emails` | `admin/emails/page.tsx` | ADMIN | Config d'envoi (expéditeur, fournisseur), compteurs SENT/FAILED/PENDING, 20 derniers emails | `assignment_email_notifications` (service role) | Formulaire d'email de test | Message vide |
| `/dashboard/tasks` | `tasks/page.tsx`, `TaskCard.tsx` | Validés | Toutes les tâches de la classe triées par échéance ; pour DELEGATE/ADMIN : création, édition, suppression, suivi par élève | `tasks`, `subjects`, `task_completions`, `profiles` | Cocher ; créer ; modifier ; supprimer (sans confirmation) ; voir suivi | Vide illustré ; Realtime refresh |
| `/dashboard/documents` | `documents/page.tsx` | Validés | Bibliothèque de liens Drive | `documents`, `subjects` | Déposer (tous) ; supprimer (auteur/délégué/admin, modal) | Vide illustré |
| `/dashboard/hints` | `hints/page.tsx` | Validés | Annales | `hints`, `subjects` | Ajouter (tous) ; supprimer (auteur/délégué/admin) | Vide illustré |
| `/dashboard/recordings` | `recordings/page.tsx` | Validés | Cours vidéo (liens Drive) | `recordings`, `subjects` | Publier / supprimer (DELEGATE/ADMIN) | Vide illustré |
| `/dashboard/chat` | `chat/page.tsx`, `ChatRoom.tsx` | Validés | Chat de classe temps réel + annonces | 50 derniers `chat_messages` + compte total | Envoyer, supprimer (auteur/modérateur, **sans confirmation**), publier une annonce (DELEGATE/ADMIN), charger plus | Optimistic UI ; rollback silencieux en cas d'échec |
| `/dashboard/notifications` | `NotificationsCenter.tsx` | Connecté | Centre de notifications | 100 dernières `notifications` | Filtres (8), ouvrir (marque lu + navigue), tout marquer lu, charger plus (pagination client) | Vide ; groupement Aujourd'hui/Hier/date |
| `/dashboard/stats` | `stats/page.tsx` | DELEGATE (sa classe), ADMIN (global + par classe) | 8 compteurs + taux de complétion ; tableau par classe (ADMIN) | comptages Supabase | — | `loading.tsx` |
| Panneau Assistant IA | `components/assistant/*` | Tout utilisateur connecté (y compris non validé — P-030) | Chat IA flottant | `assistant_chats/messages` ; `/api/assistant` | Nouveau chat, historique, supprimer, 5 actions rapides, envoyer, boutons de navigation suggérés | Chargement, erreurs SSE |
| Modal de confirmation | `ConfirmDeleteButton.tsx` | — | Confirmation de suppression accessible (focus trap, Échap) | — | Annuler / Supprimer | Affiche l'erreur serveur |

### B.2 Inventaire des opérations réellement implémentées

| Opération | Entités concernées | Où |
|---|---|---|
| Création | compte+profil+demande, classe, matière, tâche, document, hint, cours enregistré, message, annonce, conversation IA, message IA, notification (serveur), rappel (cron), trace d'email | `actions/*`, `app/api/*` |
| Consultation | toutes les entités ci-dessus selon RLS | pages |
| Modification | tâche (`updateTaskAction`), rôle (promouvoir/révoquer), statut de demande, `profiles.class_id` (à l'acceptation), `read_at` des notifications, `is_expired` (cron), titre de conversation IA (**sans UI**) | `actions/*` |
| Suppression | classe (si vide), tâche, document, hint, cours, message de chat, conversation IA ; purge automatique des tâches | `actions/*`, cron |
| Recherche | **uniquement** via l'outil IA `searchPlatform` (ILIKE sur titres) | `lib/ai/tools.ts:324-340` |
| Filtrage | notifications (catégorie, non lues) | `NotificationsCenter.tsx:101-105` |
| Tri | fixe côté serveur (échéance, date, année) ; aucun tri choisi par l'utilisateur | pages |
| Pagination | chat (keyset, 50 + 30), notifications (100 chargées puis 30 par 30 côté client), historique IA (50 conversations, 100 messages, 30 messages de contexte) | `lib/chat/pagination.ts`, etc. |
| Import / export | **Absent** | — |
| Notifications | in-app (15 types déclarés, 12 émis), emails (acceptation, J‑3, J‑1, test) | `lib/notifications`, `lib/email` |
| Calculs | jours restants, urgence, taux de complétion, compteurs stats, fenêtres de rate limit | `lib/business`, `stats/page.tsx` |
| Historique | demandes d'inscription (multi-lignes), traces d'emails, rappels envoyés ; **pas** d'historique de modifications | schéma |
| Paramètres | thème clair/sombre (localStorage) ; config via variables d'environnement uniquement | `ThemeToggle.tsx` |
| Gestion des droits | promotion/révocation délégué ; création d'ADMIN hors application | `actions/classes.ts`, `scripts/create-admin.mjs` |
| Actions en masse | « tout marquer comme lu » ; notification de toute une classe | `actions/notifications.ts`, `notifyClassMembers` |
| Automatisations | rappels J‑3/J‑1, expiration + purge des tâches, emails transactionnels, personnalisation IA des emails | crons, `lib/email` |

### B.3 Fiches fonctionnalités

Format condensé : **Objectif / Acteurs / Pré-requis / Entrée / Parcours / Données & traitements / Règles / Erreurs / Contrôles d'accès / État / Preuves / À vérifier**.

#### Module Authentification et inscription

**F-002 — Inscription**
- Objectif : créer un compte étudiant rattaché (après validation) à une classe.
- Acteurs : visiteur. Pré-requis : au moins une classe existe.
- Entrée : `/register` → `RegisterForm` → `registerAction` (`actions/auth.ts:15-109`).
- Parcours : 1) validation Zod (prénom/nom 2-80, email normalisé en minuscules, mot de passe ≥ 12, confirmation, `classId` UUID) ; 2) recherche d'un profil existant avec cet email (service role) → refus ; 3) `supabase.auth.signUp` ; 4) garde-fou si l'ID renvoyé a déjà un profil ; 5) insertion `profiles` (role `STUDENT`, `class_id NULL`) via service role ; 6) insertion `registration_requests` `PENDING` via service role ; 7) redirection `/pending`.
- Règles : aucun ADMIN par inscription (S4) ; une seule demande PENDING par utilisateur (index partiel `uq_regreq_pending_per_user`) ; email unique insensible à la casse (`uq_profiles_email_lower`).
- Erreurs : messages Supabase bruts renvoyés (« Erreur lors de la création du profil : … ») ; **pas de transaction** : un échec à l'étape 5 ou 6 laisse un compte Auth orphelin ou un profil sans demande (le layout laisse alors entrer un profil sans demande — `layout.tsx:45-46` ne bloque que PENDING/REJECTED).
- État : **Confirmé (code)**. Dépend de la configuration « confirmation d'email » de Supabase (**À vérifier**).

**F-003 — Connexion** (`actions/auth.ts:211-272`)
- Parcours : Zod → rate limit IP (10/15 min) puis compte (5/15 min) via RPC `check_ai_rate_limit` (service role) → Turnstile si un jeton est présent ou si `TURNSTILE_SECRET_KEY` est défini → `signInWithPassword` → journal de sécurité anonymisé → `/dashboard`.
- Règles : message d'erreur générique (anti-énumération) ; **fail-closed** si la RPC est indisponible (plus personne ne peut se connecter).
- État : **Confirmé (code + tests `auth-security.test.ts`)**, mais CAPTCHA non fonctionnel côté client (P-006) et verrouillage de compte exploitable (P-023/P-024).

**F-004 — Déconnexion** : `logoutAction` (formulaire dans la barre latérale). **Confirmé.** Inaccessible depuis `/pending` (P-005).

**F-005/F-006/F-007 — Mot de passe oublié → lien → nouveau mot de passe**
- F-005 `requestPasswordResetAction` (`auth.ts:282-317`) : rate limit IP 5/15 min et compte 3/15 min, réponse toujours neutre, `resetPasswordForEmail` avec `redirectTo = NEXT_PUBLIC_APP_URL/auth/confirm?next=/reset-password`.
- F-006 `GET /auth/confirm` : `exchangeCodeForSession(code)` ou `verifyOtp(token_hash,type)` → redirection vers `next` (chemin interne uniquement) ou `/recovery-error`.
- F-007 `updatePasswordAction` (`auth.ts:328-353`) : exige une session (n'importe laquelle — P-026), `updateUser({password})`, déconnexion, `/login`.
- État : **Confirmé (code + `password-recovery.test.ts`)**. Envoi effectif de l'email : dépend du SMTP configuré dans Supabase Auth (**À vérifier**).

**F-008 — Attente** : page statique. **Confirmé.**

**F-009 — Resoumission après refus** (`resubmitRegistrationAction`, `auth.ts:131-209`)
- Logique serveur correcte (refuse si ACCEPTED/PENDING/ADMIN, crée une nouvelle demande PENDING, historise l'ancienne) et testée (`resubmit.test.ts`).
- **Mais l'écran est inaccessible** : un utilisateur REJECTED est envoyé vers `/register` par le layout, que le middleware renvoie vers `/dashboard` car l'utilisateur est connecté → **boucle de redirection** (P-001).
- État : **Défectueux.**

**F-010 — Garde d'accès et routage par rôle** : middleware (session obligatoire sur `/dashboard/**`) + layout (statut de la dernière demande) + redirection par rôle. **Confirmé**, avec les défauts P-001 et « profil sans demande = accès ».

**F-011 — Décision sur une demande d'inscription** (`decideRegistrationAction`, `auth.ts:365-449`)
- Acteurs : ADMIN (toutes classes), DELEGATE (sa classe) — via `/dashboard/admin` ou `/dashboard/delegate`.
- Parcours : lecture de la demande (client utilisateur, RLS) → refus si non PENDING (« décision définitive ») → `update status/decided_by/decided_at` filtré sur `status = PENDING` (anti double décision) → si ACCEPTED : `profiles.class_id = request.class_id` **via service role**, notification `REGISTRATION_ACCEPTED`, email d'acceptation (F-012) ; si REJECTED : notification `REGISTRATION_REJECTED` uniquement (jamais lisible car le dashboard est bloqué, et aucun email).
- Problème majeur : l'action ne vérifie **ni le rôle ni le nombre de lignes modifiées** ; si la RLS bloque l'UPDATE (0 ligne, sans erreur), les effets « service role » s'exécutent quand même (P-020, P-021).
- État : **Fonctionnel pour les usages prévus, faille d'autorisation.**

**F-012 — Email « accès accepté »** : `handleRegistrationDecisionEmail` → anti-doublon (`assignment_email_notifications`, un seul SENT par utilisateur) → personnalisation IA optionnelle (3 s max) → SMTP/Resend → trace SENT/FAILED. **Confirmé (code + `emailService.test.ts`).**

#### Module Administration

| ID | Fonction | Implémentation | Règles | État |
|---|---|---|---|---|
| F-013 | Créer une classe | `createClassAction` (`actions/classes.ts:8-26`) | nom 2-50, niveau 2-100, année `AAAA-AAAA` ; unicité (nom, année) ; RLS `is_admin()` | Confirmé ; erreurs non affichées (P-003) |
| F-014 | Supprimer une classe | `deleteClassAction` + modal | RLS : admin **et** aucun profil rattaché ; cascade sur matières, tâches, ressources, chat, demandes | Partiel : succès affiché même si rien n'est supprimé (P-004) ; aucune fonction pour vider une classe |
| F-015 | Créer une matière | `createSubjectAction` | nom 2-100, code ≤ 20 ; unicité (classe, nom) ; admin uniquement | Confirmé ; pas d'édition ni de suppression |
| F-016 | Promouvoir / révoquer un délégué | `appointDelegateAction` / `removeDelegateAction` | RLS admin ; notification `DELEGATE_APPOINTED`/`REMOVED` | Confirmé pour l'admin ; possible sur un utilisateur sans classe (P-011) ; notification envoyée même si l'UPDATE est refusé (P-021) |
| F-017 | Tableau de bord admin | `admin/page.tsx` | compteurs : classes, STUDENT, DELEGATE, tâches (toutes, libellé « Tâches actives » trompeur) | Confirmé |
| F-047 | Tableau de bord emails | `admin/emails/page.tsx` + `getEmailDashboardData` | 20 derniers ; compteurs par statut | Confirmé |
| F-048 | Email de test | `sendTestEmailAction` | ADMIN ; destinataire = expéditeur ou adresse de `EMAIL_TEST_ALLOWLIST` ; `smtp.verify()` puis envoi | Confirmé |
| F-050 | Création d'ADMIN | `scripts/create-admin.mjs` | utilisateur Auth confirmé, profil ADMIN `class_id NULL` | Confirmé (hors application) |

**F-018 — Tableau de bord délégué** : compteurs de sa classe (élèves = tous profils de la classe, tâches) + demandes PENDING de sa classe (lues via service role). **Confirmé.** Pour un ADMIN sans classe, la page affiche des données vides (requêtes sur `class_id = ""`).

#### Module Tâches

**F-020 — Créer une tâche** (`createTaskAction`, `actions/tasks.ts:8-61`) : DELEGATE/ADMIN ; champs : matière (de la classe), titre 3-150, type (6 valeurs), échéance (`datetime-local`, interprétée dans le fuseau **du serveur**), description ≤ 3000, lien **Google Drive** optionnel ; RLS `is_admin() OR is_delegate_of(class_id)` ; FK composite (matière de la même classe) ; notification `ASSIGNMENT_CREATED` à toute la classe sauf l'auteur. **Confirmé.** Échec silencieux côté UI (P-003). Inutilisable par un ADMIN sans classe (P-002).

**F-021 — Modifier une tâche** (`updateTaskAction`, `tasks.ts:115-163`) : mêmes règles ; **`classId` lu dans le formulaire** et utilisé pour notifier `ASSIGNMENT_UPDATED` — y compris si la RLS a refusé la modification (P-021). **Confirmé / faille.**

**F-022 — Supprimer une tâche** : bouton direct **sans confirmation** (`tasks/page.tsx:193`), RLS. **Confirmé.**

**F-023 — Marquer comme terminé / non terminé** (`toggleTaskCompletionAction`) : upsert/suppression dans `task_completions` (unicité tâche+étudiant) ; à chaque coche, notification `TASK_COMPLETED` « X a terminé : titre » à **toute la classe** (P-031). Possible même sur une tâche expirée. Échec non affiché. **Confirmé.**

**F-024 — Suivi de complétion** (DELEGATE/ADMIN) : liste des STUDENT+DELEGATE de la classe avec statut par tâche. **Confirmé.**

**F-025 — Indicateurs d'urgence** (`TaskCard.tsx:36-81`) : Terminé ; Expiré (échéance passée) ; ≤ 24 h « Xh restantes » ; ≤ 48 h « Xj restant(s) » ; sinon « J‑n » (`Math.ceil`). La règle documentée J‑6…J (vert/jaune/rouge, jours calendaires, `lib/business/taskStatus.ts:54-66`) **n'est utilisée nulle part** (P-008).

**F-026 — Expiration et purge** (cron `/api/cron/cleanup`, 06:30 UTC chaque jour) : `is_expired = true` si échéance passée ; **suppression définitive** si échéance dépassée de plus de 24 h (`shouldHardDelete`), avec cascade sur complétions, rappels et traces d'emails. Le README annonce une exécution horaire (obsolète). **Confirmé.**

**F-027 — Rappels J‑3 / J‑1** (cron `/api/cron/reminders`, 06:00 UTC) — parcours détaillé :
1. Vérifie `Authorization: Bearer <CRON_SECRET>` (P-025 si la variable est absente).
2. Charge toutes les tâches non expirées (service role).
3. Pour chaque tâche, calcule `daysUntilDue` en jours calendaires dans `NEXT_PUBLIC_APP_TIMEZONE` ; ne traite que J = 3 ou J = 1.
4. Charge les profils de la classe (**tous rôles, y compris un éventuel ADMIN rattaché**) et les complétions ; garde ceux qui n'ont pas terminé.
5. Pour chacun : insertion `task_reminders_sent` (unicité tâche+étudiant+type) → si succès, notification `TASK_REMINDER`.
6. Puis email via `sendAssignmentReminderEmailToUser` : anti-doublon SENT, email invalide → FAILED, envoi, trace SENT/FAILED (un FAILED sera retenté le lendemain seulement si l'on est encore à J‑3/J‑1, ce qui n'arrive pas : J change chaque jour).
7. Retourne des statistiques JSON (incluant les adresses en échec).
- Règles : pas de rappel si tâche rendue, expirée, ou déjà envoyé. Si la tâche est créée après 06:00 UTC à J‑1, aucun rappel J‑1.
- État : **Confirmé (code + `reminders.test.ts`, `emailService.test.ts`)** ; exécution réelle **À vérifier** (dépend de Vercel Cron et du SMTP).

#### Module Ressources

| ID | Fonction | Qui | Règles | État |
|---|---|---|---|---|
| F-028 | Déposer un document | tout membre validé | titre 2-150, description ≤ 1000, URL contenant `drive.google.com` ou `docs.google.com` (regex **non ancrée**, P-027), matière de la classe ; notification `DOCUMENT_ADDED` | Confirmé |
| F-029 | Supprimer un document | auteur, délégué de la classe, admin (`canDeleteResource` + RLS alignées par migration 0014) | modal de confirmation | Confirmé (+ `resources-delete.test.ts`) |
| F-030 | Ajouter un hint | tout membre validé | titre, année `AAAA` ou `AAAA-AAAA`, type (DEVOIR, EXAMEN, CONTROLE, TP, PROJET, AUTRE), URL Drive ; notification `HINT_ADDED` | Confirmé |
| F-031 | Supprimer un hint | idem F-029 | | Confirmé |
| F-032 | Publier un cours enregistré | DELEGATE/ADMIN | titre, date, description, URL Drive ; notification `RECORDING_ADDED` | Confirmé |
| F-033 | Supprimer un cours | DELEGATE/ADMIN (RLS) | modal | Confirmé |

Aucune modification n'existe pour documents, hints et cours (suppression + recréation uniquement).

#### Module Communication

**F-034 — Chat de classe** : envoi via `sendChatMessageAction` (1-2000 caractères, RLS membre + auteur) ; affichage optimiste puis remplacement par l'événement Realtime INSERT (filtre `class_id`) ; noms d'auteurs mis en cache ; défilement automatique. **Confirmé.**
**F-035 — Historique** : 50 derniers messages au chargement, puis pages de 30 plus anciens par curseur (`created_at`, `id`) — corrige l'ancien défaut « 100 plus anciens ». **Confirmé (+ `chat-pagination.test.ts`).**
**F-036 — Suppression / modération** : auteur, délégué de la classe, admin (RLS `chat_delete`) ; **sans confirmation** ; pas d'édition (aucune policy UPDATE). **Confirmé.**
**F-037 — Annonces** : DELEGATE/ADMIN (contrôle de rôle dans l'action **et** RLS depuis la migration 0010) ; message `is_announcement = true` affiché en encadré « Annonce Officielle » ; notification `ANNOUNCEMENT_CREATED` (120 premiers caractères) à toute la classe. Les annonces ne sont **pas réellement épinglées** : elles apparaissent dans le fil à leur date. **Confirmé.**

#### Module Notifications

**F-038 — Notifications in-app** : création exclusivement côté serveur (`createNotification`, `notifyClassMembers` — insertion groupée) via service role ; catégorie dérivée du type (`lib/notifications/service.ts:32-48`) ; champs immuables sauf `read_at` (migration 0013). Types effectivement émis : `ASSIGNMENT_CREATED`, `ASSIGNMENT_UPDATED`, `TASK_COMPLETED`, `TASK_REMINDER`, `DOCUMENT_ADDED`, `HINT_ADDED`, `RECORDING_ADDED`, `ANNOUNCEMENT_CREATED`, `REGISTRATION_ACCEPTED`, `REGISTRATION_REJECTED`, `DELEGATE_APPOINTED`, `DELEGATE_REMOVED`. **Confirmé.**
**F-039 — Centre de notifications** : 8 filtres, groupement par jour, ouverture = marquer lu + navigation vers `link`, « tout marquer comme lu », Realtime INSERT/UPDATE. **Confirmé.**
**F-040 — Cloche** : compteur initial serveur + incréments Realtime ; rafraîchissement de la route à chaque retour de focus. **Partiel** (P-010).
**F-041 — Rafraîchissement temps réel des listes** (`RealtimeListSync` → `router.refresh()` avec délai de 500 ms) sur tâches, complétions, documents, hints, cours. **Confirmé** (efficacité des événements DELETE filtrés **À vérifier**, P-015).

#### Module Assistant IA

**F-042 — Conversation** (`POST /api/assistant`) — parcours détaillé :
1. Utilisateur authentifié (aucun contrôle d'approbation).
2. Rate limit : 60/h, 10/min, `AI_DAILY_LIMIT`/jour (défaut 100) — **compteurs incrémentés avant validation du corps**.
3. Zod : `content` 1-2000, `chatId` UUID optionnel.
4. Chargement du profil + nom de classe ; création de la conversation si besoin (titre = 40 premiers caractères) ; enregistrement du message utilisateur ; récupération des 30 derniers messages.
5. Garde-fou local (`checkTopicGuard`) : refus sans appel API si mots-clés hors sujet (injection de prompt, finance/crypto, politique, religion, santé, juridique, relations, sexualité, armes/drogues, jeux d'argent, calculs).
6. Sinon boucle d'outils (max 4 itérations, timeout 30 s par appel) : 10 outils en lecture via le client **de l'utilisateur** (RLS) + `suggestActions` (liens filtrés par liste blanche de 9 routes internes).
7. Enregistrement de la réponse et des actions ; mise à jour `updated_at`.
8. Envoi en SSE par morceaux de 24 caractères toutes les 14 ms (**pseudo-streaming** : la réponse est entièrement calculée avant).
- Dégradation : sans clé ou en erreur → message explicatif. **Confirmé (code + `assistant-rate-limit.test.ts`, `assistantTools.test.ts`, `guard.test.ts`).**

**F-043 — Historique des conversations** : liste (50), ouvrir, nouveau, supprimer. Renommage implémenté côté serveur mais **sans UI**. **Confirmé.**
**F-044 — Garde-fou de sujet** et **F-045 — Limitation de débit IA** : voir F-042. **Confirmé.**
**F-052 — Personnalisation IA des emails** : phrase d'introduction générée (40 mots max, timeout 3 s, jamais bloquante) insérée **sans échappement HTML** dans le gabarit (P-035). **Confirmé.**

#### Module Statistiques

**F-046** (`stats/page.tsx`) : DELEGATE → sa classe ; ADMIN → global + tableau par classe. Indicateurs : nb STUDENT, nb DELEGATE, tâches, documents, hints, cours, complétions, taux = complétions / (tâches × STUDENT) (P-009). Les tâches purgées disparaissent des statistiques. Garde d'accès serveur (`canViewClassStats`, testée). **Confirmé.**

#### Transverses

F-001 Landing page ; F-049 Thème clair/sombre (préférence locale) ; F-053 Squelettes de chargement (12 `loading.tsx`) ; F-054 Modal de confirmation de suppression (documents, hints, cours, classes uniquement — pas tâches ni chat) ; F-051 Scripts `verify-*` (tests de sécurité live). Tous **Confirmés** (code).

### B.4 Règles métier extraites

| ID | Règle | Source(s) | Duplication / contradiction |
|---|---|---|---|
| R-01 | Rôles STUDENT/DELEGATE/ADMIN ; un utilisateur ne peut pas changer son propre rôle ni sa classe | trigger `prevent_self_privilege_escalation` (`schema.sql:430-446`) | — |
| R-02 | Aucun ADMIN via l'inscription publique | `actions/auth.ts:69-86` ; absence de policy INSERT sur `profiles` (migration 0012) | — |
| R-03 | Une seule demande PENDING par utilisateur ; demandes historisées | index `uq_regreq_pending_per_user` (`schema.sql:136-138`) | — |
| R-04 | Décision d'inscription définitive (pas de revirement) | `auth.ts:384-386, 392` | La RLS n'empêche pas la modification d'une demande traitée par un délégué/admin via l'API |
| R-05 | Accès aux données de classe seulement si ADMIN ou demande ACCEPTED **et** profil rattaché à la classe | `is_approved_member`, `is_member_of` (`schema.sql:346-407`) | Contournable : un utilisateur peut insérer sa propre demande `ACCEPTED` (P-020) |
| R-06 | La classe n'est affectée au profil qu'à l'acceptation | `auth.ts:79-86, 404-416` | — |
| R-07 | Délégué : gère tâches, cours, inscriptions, modération, annonces **de sa seule classe** | RLS + `lib/business/permissions.ts` | Fonctions de permission en grande partie inutilisées côté UI (rôle testé en dur dans les pages) |
| R-08 | Suppression document/hint : auteur, délégué de la classe, admin | RLS (migration 0014) + `canDeleteResource` + UI | Alignées |
| R-09 | Une ressource ne peut référencer qu'une matière de sa classe | FK composites (migration 0011) | — |
| R-10 | Liens de ressources : Google Drive uniquement | `driveUrlSchema` (`schemas.ts:57-64`) | Contredit par le placeholder « OneDrive, GitHub » (`tasks/page.tsx:132`) ; regex non ancrée |
| R-11 | Mot de passe ≥ 6 caractères | `schemas.ts` | Supabase Auth applique un minimum de 6 — politique alignée |
| R-12 | Rate limits : login 10/15 min/IP et 5/15 min/compte ; reset 5/IP et 3/compte par 15 min ; IA 10/min, 60/h, 100/jour | `rateLimit.ts:31-48`, `route.ts:13-18` | README mentionne seulement 10/min et 60/h |
| R-13 | Couleurs d'échéance : ≥ J‑5 vert, J‑4…J‑2 jaune, J‑1/J rouge, après J expiré | `taskStatus.ts:54-66` | **Non utilisée** ; l'UI applique une règle en heures (`TaskCard.tsx`) ; l'assistant calcule en `Math.ceil` d'heures (`tools.ts:193-195`) — 3 calculs différents |
| R-14 | Tâche visible 24 h après échéance puis supprimée | `shouldHardDelete` + cron quotidien | En pratique entre 24 h et 48 h (cron quotidien, README dit horaire) |
| R-15 | Rappels J‑3 et J‑1 en jours calendaires (fuseau app), sans doublon, pas si rendu/expiré | `lib/email/reminders.ts`, contraintes uniques | — |
| R-16 | Email d'acceptation unique ; aucun email de refus | `lib/email/notifications.ts:102-116` | `/pending` promet « un email de confirmation » (vrai uniquement en cas d'acceptation) |
| R-17 | Notification immuable sauf `read_at` | migration 0013 | — |
| R-18 | Annonce réservée DELEGATE/ADMIN | action + RLS (0010) | Dupliquée (bon) |
| R-19 | Classe supprimable seulement sans membre | RLS `classes_delete` | Aucune UI pour retirer un membre |
| R-20 | Chat : 1-2000 caractères | CHECK SQL + Zod | Dupliquée (bon) |
| R-21 | Assistant : liens proposés limités à 9 routes internes | `tools.ts:130-145` | Le rendu Markdown autorise tout lien `http(s)` produit par le modèle (`Markdown.tsx:6-9`) |
| R-22 | Assistant limité au périmètre ClassePulse | `guard.ts`, prompt système règle 8 | Contredit par la barre latérale (« Une question sur un cours ou du code ? ») et la landing page |
| R-23 | Email de test : uniquement vers l'expéditeur ou une liste blanche | `actions/emails.ts:33-51` | — |
| R-24 | Le classement des notifications par catégorie dérive du type | `service.ts:32-53` | Catégorie `assignments` déclarée mais jamais produite |

### B.5 Matrice de couverture fonctionnelle

États : **OK** = confirmé par le code ; **OK+T** = confirmé et couvert par un test unitaire ; **Partiel** ; **Défectueux** ; **Absent** ; **Non utilisé**.

| ID | Fonctionnalité | Module | État constaté | Dépendances | Preuves | Incertitudes |
|---|---|---|---|---|---|---|
| F-001 | Landing page | Public | OK | Unsplash | `app/page.tsx` | Témoignages fictifs |
| F-002 | Inscription | Auth | OK | Supabase Auth, service role | `actions/auth.ts:15-109` | Confirmation d'email Supabase ; atomicité |
| F-003 | Connexion + rate limit + CAPTCHA | Auth | Partiel | RPC rate limit, Turnstile | `auth.ts:211-272`, `auth-security.test.ts` | CAPTCHA inopérant (P-006) |
| F-004 | Déconnexion | Auth | OK | — | `Sidebar.tsx:178` | Absente de `/pending` |
| F-005 | Demande de réinitialisation | Auth | OK+T | Supabase Auth SMTP | `auth.ts:282-317` | Envoi réel |
| F-006 | Échange du lien email | Auth | OK+T | Supabase Auth | `app/auth/confirm/route.ts` | Mode PKCE vs token_hash configuré |
| F-007 | Nouveau mot de passe | Auth | OK+T | — | `auth.ts:328-353` | P-026 |
| F-008 | Page d'attente | Auth | OK | — | `pending/page.tsx` | — |
| F-009 | Resoumission après refus | Auth | Défectueux | middleware | `auth.ts:131-209`, `middleware.ts:31-48`, `layout.tsx:46` | P-001 |
| F-010 | Garde d'accès / routage par rôle | Auth | OK | — | `middleware.ts`, `layout.tsx`, `dashboard/page.tsx` | Profil sans demande accepté |
| F-011 | Décision d'inscription | Admin/Délégué | Partiel (faille) | service role | `auth.ts:365-449` | P-020, P-021 |
| F-012 | Email d'acceptation | Email | OK+T | SMTP/Resend, LLM optionnel | `lib/email/notifications.ts:122-180` | Délivrabilité |
| F-013 | Créer une classe | Admin | OK | — | `actions/classes.ts:8-26` | Erreurs non affichées |
| F-014 | Supprimer une classe | Admin | Partiel | — | `classes.ts:28-35`, `schema.sql:484-489` | P-004 |
| F-015 | Créer une matière | Admin | OK | — | `classes.ts:37-55` | — |
| F-016 | Promouvoir/révoquer délégué | Admin | Partiel | notifications | `classes.ts:57-93` | P-011, P-021 |
| F-017 | Tableau de bord admin | Admin | OK | service role | `admin/page.tsx` | — |
| F-018 | Tableau de bord délégué | Délégué | OK | service role | `delegate/page.tsx` | — |
| F-019 | Accueil étudiant | Étudiant | OK | — | `student/page.tsx` | Heure du serveur pour la salutation |
| F-020 | Créer une tâche | Tâches | OK | notifications | `tasks.ts:8-61` | P-002, P-003 |
| F-021 | Modifier une tâche | Tâches | Partiel (faille) | notifications | `tasks.ts:115-163` | P-021 |
| F-022 | Supprimer une tâche | Tâches | OK | — | `tasks.ts:165-172` | Sans confirmation |
| F-023 | Complétion individuelle | Tâches | OK | notifications | `tasks.ts:63-113` | P-031 |
| F-024 | Suivi de complétion | Tâches | OK | — | `tasks/page.tsx:57-73, 201-224` | — |
| F-025 | Indicateurs d'urgence | Tâches | Partiel | — | `TaskCard.tsx:36-81` | P-008 |
| F-026 | Expiration + purge | Cron | OK+T | Vercel Cron | `api/cron/cleanup/route.ts` | Exécution réelle |
| F-027 | Rappels J‑3/J‑1 | Cron/Email | OK+T | Vercel Cron, SMTP | `api/cron/reminders/route.ts` | Exécution réelle, timeouts |
| F-028 | Déposer un document | Ressources | OK | — | `actions/documents.ts:9-52` | P-027 |
| F-029 | Supprimer un document | Ressources | OK+T | — | `documents.ts:54-77` | — |
| F-030 | Ajouter un hint | Ressources | OK | — | `actions/hints.ts:9-54` | — |
| F-031 | Supprimer un hint | Ressources | OK+T | — | `hints.ts:56-79` | — |
| F-032 | Publier un cours enregistré | Ressources | OK | — | `actions/recordings.ts:8-53` | — |
| F-033 | Supprimer un cours | Ressources | OK | — | `recordings.ts:55-61` | — |
| F-034 | Chat temps réel | Chat | OK | Supabase Realtime | `ChatRoom.tsx`, `actions/chat.ts` | Publication Realtime appliquée en prod |
| F-035 | Pagination du chat | Chat | OK+T | — | `lib/chat/pagination.ts` | — |
| F-036 | Suppression/modération chat | Chat | OK | — | `chat.ts:87-93` | Événement DELETE filtré (P-015) |
| F-037 | Annonces | Chat | OK | notifications | `chat.ts:40-85`, migration 0010 | — |
| F-038 | Notifications in-app | Notifications | OK+T | service role | `lib/notifications/service.ts` | — |
| F-039 | Centre de notifications | Notifications | OK | Realtime | `NotificationsCenter.tsx` | — |
| F-040 | Cloche temps réel | Notifications | Partiel | Realtime | `NotificationBell.tsx` | P-010 |
| F-041 | Rafraîchissement temps réel des listes | Transverse | OK | Realtime | `lib/realtime/hooks.ts:193-222` | P-015 |
| F-042 | Assistant IA | IA | OK+T | LLM, RPC | `app/api/assistant/route.ts`, `lib/ai/*` | Coût, qualité des réponses |
| F-043 | Historique IA | IA | OK | — | `actions/assistant.ts` | Renommage sans UI |
| F-044 | Garde-fou de sujet | IA | OK+T | — | `lib/ai/guard.ts` | Faux positifs |
| F-045 | Rate limit IA | IA | OK+T | RPC | `route.ts:52-60` | P-023 |
| F-046 | Statistiques | Stats | OK+T | — | `stats/page.tsx` | P-009 |
| F-047 | Tableau de bord emails | Admin | OK | service role | `admin/emails/page.tsx` | — |
| F-048 | Email de test | Admin | OK | SMTP | `actions/emails.ts` | — |
| F-049 | Thème clair/sombre | UI | OK | localStorage | `ThemeToggle.tsx` | — |
| F-050 | Création d'ADMIN (CLI) | Exploitation | OK | service role | `scripts/create-admin.mjs` | — |
| F-051 | Scripts de vérification live | Exploitation | OK | base réelle | `scripts/verify-*.mjs` | Non exécutés (écritures) |
| F-052 | Personnalisation IA des emails | Email | OK | LLM | `lib/ai/personalize.ts` | P-035 |
| F-053 | Squelettes de chargement | UI | OK | — | 12 `loading.tsx` | — |
| F-054 | Confirmation de suppression | UI | OK+T | — | `ConfirmDeleteButton.tsx`, `confirm-delete.test.ts` | Pas sur tâches/chat |
| F-055 | Présence en ligne / bannière de reconnexion | Temps réel | **Absent** (annoncé) | — | aucun usage de `useRealtimeConnection`, `last_seen_at` | — |
| F-056 | Recherche globale | UI | **Absent** (bouton factice) | — | `layout.tsx:91-96` | — |
| F-057 | Renommer une conversation IA | IA | **Non utilisé** (serveur seul) | — | `actions/assistant.ts:88-100` | — |
| F-058 | Appartenance historisée `class_members` | Données | **Non utilisé** | — | table jamais lue/écrite | — |
