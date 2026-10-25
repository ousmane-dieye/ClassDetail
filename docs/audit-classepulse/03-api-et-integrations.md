# 03 — API, communications et intégrations externes (Rapports D et L)

> Aucune API n'a été appelée pendant l'audit. Les comportements décrits proviennent de la lecture du code. Les codes d'erreur « observables » sont ceux que le code produit explicitement.

## 1. Surface d'API réelle

ClassePulse expose **quatre familles d'interfaces** :

1. **Route Handlers Next.js** (3 endpoints HTTP explicites + 1 de callback) ;
2. **Server Actions Next.js** : chaque fonction exportée d'un fichier `"use server"` devient un endpoint HTTP POST (en-tête `Next-Action: <id>`). La documentation Next.js recommande de les traiter **comme des endpoints publics**. Les identifiants de toutes les actions d'un module importé côté client figurent dans le bundle client : dans l'artefact de build **de développement** présent localement, le bundle de `/login` contient l'identifiant de `decideRegistrationAction` (module `actions/auth.ts` importé par `LoginForm`). Pour un build de production : **À vérifier** ;
3. **API Supabase appelée directement par le navigateur** (PostgREST, RPC, Realtime, Auth) avec la clé anon publique — surface **indépendante de Next.js**, protégée uniquement par la RLS et les privilèges PostgreSQL ;
4. **Tâches planifiées** (Vercel Cron → Route Handlers).

Aucun webhook entrant, aucune API publique documentée (pas d'OpenAPI), aucune file de messages.

## 2. Route Handlers

| Méthode et chemin | Fichier | Fonctionnalité | Entrée | Validation | Auth | Traitement | Données lues / écrites | Réponse | Erreurs | Risques |
|---|---|---|---|---|---|---|---|---|---|---|
| `POST /api/assistant` | `app/api/assistant/route.ts` | F-042 | JSON `{ chatId?: uuid\|null, content: string 1-2000 }` | Zod (après le rate limit) | Session Supabase (cookies) ; **pas de contrôle d'approbation** | Rate limit 3 fenêtres → profil → conversation → historique → garde-fou → LLM + outils → persistance → SSE | R : profiles, classes, tasks, subjects, recordings, documents, hints, notifications, assistant_* ; W : assistant_chats, assistant_messages, ai_rate_limits (RPC) | `text/event-stream` : `{type:"delta",text}`…, `{type:"done",chatId,messageId,actions}` ou `{type:"error"}` | 401 non authentifié ; **400** pour validation **et** rate limit (avec `Retry-After`) ; 404 profil | Coût LLM (comptes non validés), données de classe envoyées au fournisseur LLM, quotas pollués via RPC (P-023) |
| `GET /api/cron/reminders` | `app/api/cron/reminders/route.ts` | F-027 | En-tête `Authorization: Bearer <CRON_SECRET>` | Égalité de chaîne | Secret partagé | Voir F-027 | R : tasks, subjects, profiles (dont email), task_completions ; W : task_reminders_sent, notifications, assignment_email_notifications ; envoi SMTP | JSON statistiques (inclut les adresses en échec) | 401, 500 | « Bearer undefined » accepté si la variable manque (P-025) ; temps d'exécution non borné (P-063) |
| `GET /api/cron/cleanup` | `app/api/cron/cleanup/route.ts` | F-026 | idem | idem | idem | marque `is_expired`, supprime les tâches > 24 h après échéance | R/W/D : tasks (+ cascades) | `{ok, markedExpired, deleted}` | 401, 500 | Suppression définitive non réversible |
| `GET /auth/confirm` | `app/auth/confirm/route.ts` | F-006 | `code` ou `token_hash`+`type`, `next` | aucune (Supabase vérifie) | Jeton email | Échange → session cookies | Auth | 302 vers `next` (chemin du même hôte) ou `/recovery-error` | — | `type` arbitraire accepté (signup, magiclink, recovery…), comportement conforme à Supabase |

## 3. Server Actions

| Action | Fichier:lignes | Appelée depuis | Entrée | Validation | Contrôle d'accès dans l'action | Client(s) Supabase | Effets | Risque relevé |
|---|---|---|---|---|---|---|---|---|
| `registerAction` | `actions/auth.ts:15-109` | `RegisterForm` | FormData | Zod | aucun (public) | anon + **service role** | Auth signUp, profiles, registration_requests | Non atomique |
| `resubmitRegistrationAction` | `auth.ts:131-209` | `ResubmitForm` | FormData | Zod | session + statut | user + **service role** | profiles (nom), registration_requests | Inaccessible (P-001) |
| `loginAction` | `auth.ts:211-272` | `LoginForm` | FormData | Zod | rate limit + Turnstile | **service role** (RPC) + anon | session | P-006, P-024 |
| `requestPasswordResetAction` | `auth.ts:282-317` | `ForgotPasswordForm` | FormData | Zod | rate limit | service role (RPC) + anon | email Supabase | — |
| `updatePasswordAction` | `auth.ts:328-353` | `ResetPasswordForm` | FormData | Zod | session quelconque | user | mot de passe | P-026 |
| `logoutAction` | `auth.ts:355-359` | `Sidebar` | — | — | — | user | session | — |
| `decideRegistrationAction(requestId, decision)` | `auth.ts:365-449` | pages admin/délégué (actions inline) | arguments | **aucune** (ni UUID ni rôle) | **aucun contrôle de rôle ; nombre de lignes non vérifié** | user + **service role** | registration_requests, profiles.class_id, notifications, email | **P-020, P-021** |
| `createClassAction` | `actions/classes.ts:8-26` | admin | FormData | Zod | RLS seule | user | classes | — |
| `deleteClassAction(id)` | `classes.ts:28-35` | `ConfirmDeleteButton` | id | aucune | RLS seule | user | classes (+cascades) | P-004 |
| `createSubjectAction` | `classes.ts:37-55` | admin | FormData | Zod | RLS seule | user | subjects | — |
| `appointDelegateAction(userId)` / `removeDelegateAction(userId)` | `classes.ts:57-93` | admin (inline) | id | aucune | RLS seule ; **notification envoyée même si 0 ligne** | user + **service role** | profiles.role, notifications | P-011, P-021 |
| `createTaskAction` | `actions/tasks.ts:8-61` | tâches (inline) | FormData | Zod | RLS (INSERT échoue si interdit) | user + service role | tasks, notifications | — |
| `toggleTaskCompletionAction(taskId, completed)` | `tasks.ts:63-113` | `TaskCard` | args | aucune | RLS | user + service role | task_completions, notifications | P-031 |
| `updateTaskAction` | `tasks.ts:115-163` | tâches (inline) | FormData (`taskId`, **`classId`**) | Zod (sauf taskId) | RLS ; **notification sur `classId` du formulaire même si 0 ligne** | user + service role | tasks, notifications | **P-021** |
| `deleteTaskAction(taskId)` | `tasks.ts:165-172` | tâches (inline) | id | aucune | RLS | user | tasks | « succès » si 0 ligne |
| `createDocumentAction` / `deleteDocumentAction` | `actions/documents.ts` | documents | FormData / id | Zod / — | RLS + `canDeleteResource` | user + service role | documents, notifications | P-027 |
| `createHintAction` / `deleteHintAction` | `actions/hints.ts` | hints | idem | idem | idem | idem | hints, notifications | P-027 |
| `createRecordingAction` / `deleteRecordingAction` | `actions/recordings.ts` | cours | FormData / id | Zod / — | RLS | user + service role | recordings, notifications | — |
| `sendChatMessageAction` | `actions/chat.ts:8-30` | `ChatRoom` | FormData | Zod | RLS | user | chat_messages | — |
| `sendAnnouncementAction` | `chat.ts:40-85` | `ChatRoom` | FormData | Zod | rôle vérifié + RLS | user + service role | chat_messages, notifications | — |
| `deleteChatMessageAction(id)` | `chat.ts:87-93` | `ChatRoom` | id | aucune | RLS | user | chat_messages | — |
| `markNotificationReadAction(id)` / `markAllNotificationsReadAction()` | `actions/notifications.ts` | centre de notifications | id | aucune | RLS + privilèges colonnes | user | notifications.read_at | — |
| `createChatAction`, `getChatsAction`, `getChatMessagesAction`, `renameChatAction` (non utilisée), `deleteChatAction` | `actions/assistant.ts` | `AssistantPanel` | args | troncature à 60 caractères | RLS (propriétaire) | user | assistant_* | — |
| `sendTestEmailAction` | `actions/emails.ts` | `EmailTestForm` | FormData `to` | liste blanche | rôle ADMIN vérifié | user | email SMTP | — |

## 4. API Supabase utilisée directement par le navigateur

| Appel | Composant | Table / canal | Protection |
|---|---|---|---|
| `select … from chat_messages` (pagination) | `ChatRoom.tsx:61-95` | chat_messages + profiles | RLS `chat_select` |
| `select first_name,last_name from profiles` | `ChatRoom.tsx:113-123` | profiles | privilèges colonnes (email exclu) + RLS |
| Realtime `postgres_changes` INSERT/DELETE `chat_messages` filtre `class_id` | `ChatRoom.tsx:97-139` | | RLS (INSERT) ; DELETE : **À vérifier** (limitation Supabase sur le filtrage/RLS des DELETE) |
| Realtime notifications INSERT/UPDATE filtre `recipient_id` | `NotificationBell.tsx`, `NotificationsCenter.tsx` | notifications | RLS |
| Realtime + `router.refresh()` | `RealtimeListSync` (tasks, task_completions, documents, hints, recordings) | | RLS |

**Surface implicite** : avec son JWT, tout utilisateur peut appeler n'importe quelle table/RPC exposée par PostgREST dans la limite des privilèges et de la RLS — notamment `POST /rest/v1/registration_requests` (P-020), `PATCH /rest/v1/profiles` sur sa propre ligne (P-022), `POST /rest/v1/rpc/check_ai_rate_limit` (P-023), `POST /rest/v1/task_completions` (P-032).

## 5. Tâches planifiées, temps réel, synchronisation

| Mécanisme | Déclencheur | Détail |
|---|---|---|
| Rappels | Vercel Cron `0 6 * * *` (UTC) | `/api/cron/reminders` |
| Purge | Vercel Cron `30 6 * * *` | `/api/cron/cleanup` (le README indique `0 * * * *`, obsolète) |
| Temps réel | Publication `supabase_realtime` : notifications, tasks, documents, hints, recordings, task_completions, chat_messages | migrations 0002/0005/0007, `schema.sql:273-285, 789-819` |
| Presence / broadcast | **Absent** (annoncé dans le README) | aucun usage |
| Polling | `useSmartPolling` défini mais **inutilisé** ; la cloche rafraîchit la route au retour de focus | `lib/realtime/hooks.ts`, `NotificationBell.tsx:43-47` |

## 6. Intégrations externes (Rapport L)

| Service | Rôle | Fonctionnalités dépendantes | Intégration | Données échangées | Authentification | Limites / risques d'indisponibilité | Conséquence d'un changement | Alternatives | Difficulté de migration |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase** (PostgreSQL, Auth, PostgREST, Realtime) | Backend complet | Toutes | SDK JS + SQL | Toutes les données, mots de passe hachés | Clé anon (publique), JWT, clé service role (secret) | Panne = application inutilisable ; plan gratuit : mise en pause après inactivité, pas de sauvegarde PITR (**À vérifier** selon le plan) | Réécriture de l'auth, du temps réel, de toute la couche données | PostgreSQL autogéré/managé + auth applicative + WebSocket | **Élevée** |
| **Vercel** | Hébergement + Cron | Tout le web ; rappels ; purge | Plateforme | Code, variables d'env | Compte | Limites de durée d'exécution des fonctions (**À vérifier** selon le plan) ; crons quotidiens en plan gratuit | Déployer ailleurs (Node serveur standard) | VPS + Docker, Render, Fly.io, Railway | Faible à moyenne (Next.js est auto-hébergeable) |
| **SMTP (Gmail en local)** | Emails transactionnels | F-012, F-027, F-048 | nodemailer | Adresse, prénom, titre de devoir, matière, date | Identifiant + mot de passe d'application (**secret**) | Quotas journaliers du fournisseur, délivrabilité (SPF/DKIM du domaine non maîtrisés avec Gmail) | Changer de transport | Fournisseur transactionnel (Brevo, Postmark, SES, Resend) avec domaine vérifié | Faible |
| **Resend** (repli) | Emails | idem si SMTP absent | SDK | idem | Clé API | — | — | — | Faible |
| **Supabase Auth – emails** | Récupération de mot de passe, confirmation | F-005 | interne Supabase | email | config Supabase | SMTP par défaut de Supabase très limité (**À vérifier** si un SMTP personnalisé est configuré) | — | — | — |
| **LLM compatible OpenAI** (Gemini en local) | Assistant, personnalisation d'emails | F-042, F-052 | HTTP `chat/completions` + function calling | Prénom, rôle, nom de classe, questions, **résultats d'outils (données de classe)** | Clé API (secret) | Quotas free tier, latence, qualité ; appareil dégradé prévu | Modifier `OPENAI_BASE_URL/MODEL` | Tout fournisseur compatible | Faible |
| **Google Drive** | Stockage des fichiers | F-028…F-033, pièces jointes de tâches | Liens uniquement | URL | Partage « lien public » côté utilisateur | Liens morts, droits mal configurés, aucune maîtrise de la conservation | — | Stockage objet (S3/R2/Supabase Storage) avec upload | Moyenne (si l'on veut internaliser les fichiers) |
| **Cloudflare Turnstile** | CAPTCHA | F-003 | siteverify serveur | jeton, IP | Secret | Script client absent (P-006) | — | hCaptcha, reCAPTCHA | Faible |
| **Unsplash** | Images décoratives | Landing, auth, états vides | Hotlink `<img>` | — | — | Disponibilité externe, vie privée (requêtes vers un tiers) | Héberger les images | Assets locaux | Faible |
| **Google Fonts** (`next/font`) | Polices | UI | Téléchargées au build et auto-hébergées par Next.js | — | — | — | — | — | Faible |

Aucun service de paiement, d'analytics, de monitoring ou de stockage de fichiers n'est intégré.

## 7. Matrice de traçabilité Fonctionnalités ↔ Interfaces ↔ Données

| Fonctionnalité | Interface(s) | Tables / services |
|---|---|---|
| F-002 Inscription | `registerAction` | auth.users, profiles, registration_requests |
| F-003 Connexion | `loginAction` | ai_rate_limits (RPC), auth |
| F-005/F-006/F-007 Mot de passe | `requestPasswordResetAction`, `GET /auth/confirm`, `updatePasswordAction` | auth, ai_rate_limits |
| F-009 Resoumission | `resubmitRegistrationAction` | profiles, registration_requests |
| F-011/F-012 Décision + email | `decideRegistrationAction` | registration_requests, profiles, notifications, assignment_email_notifications, SMTP, LLM |
| F-013…F-016 Administration | `create/deleteClassAction`, `createSubjectAction`, `appoint/removeDelegateAction` | classes, subjects, profiles, notifications |
| F-017/F-018 Tableaux de bord | RSC (service role) | classes, profiles, registration_requests, tasks |
| F-020…F-024 Tâches | `create/update/deleteTaskAction`, `toggleTaskCompletionAction`, Realtime | tasks, subjects, task_completions, profiles, notifications |
| F-026 Purge | `GET /api/cron/cleanup` | tasks (+ cascades) |
| F-027 Rappels | `GET /api/cron/reminders` | tasks, subjects, profiles, task_completions, task_reminders_sent, notifications, assignment_email_notifications, SMTP, LLM |
| F-028…F-033 Ressources | actions documents/hints/recordings, Realtime | documents, hints, recordings, subjects, notifications |
| F-034…F-037 Chat | actions chat, PostgREST direct, Realtime | chat_messages, profiles, notifications |
| F-038…F-040 Notifications | actions notifications, Realtime | notifications |
| F-042…F-045 Assistant | `POST /api/assistant`, actions assistant | assistant_chats, assistant_messages, ai_rate_limits, données de classe en lecture, LLM |
| F-046 Statistiques | RSC | profiles, tasks, documents, hints, recordings, task_completions, classes |
| F-047/F-048 Emails admin | RSC (service role), `sendTestEmailAction` | assignment_email_notifications, SMTP |
