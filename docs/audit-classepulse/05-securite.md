# 05 — Authentification, autorisation et sécurité (Rapport F)

> **Méthode** : revue statique du code, du schéma, des policies RLS et des privilèges ; `npm audit`. **Aucun test d'intrusion n'a été réalisé** et aucune requête n'a été envoyée à la base réelle. Les vulnérabilités ci-dessous sont **déduites du code** : le mécanisme est démontré par le code et la sémantique documentée de PostgreSQL/PostgREST/Next.js, mais l'exploitation n'a pas été rejouée. Chaque constat indique son niveau de confiance.
>
> Aucune clé, aucun mot de passe et aucune donnée personnelle ne sont reproduits.

## 1. Authentification

| Aspect | Constat | Preuve | Statut |
|---|---|---|---|
| Méthode | Email + mot de passe Supabase Auth uniquement | `auth.ts:252` ; README § Supabase | Confirmé |
| Création de compte | `signUp` côté serveur, puis profil et demande via service role | `auth.ts:47-102` | Confirmé ; non atomique |
| Confirmation d'email | Gérée par Supabase si activée ; `/auth/confirm` accepte `token_hash`+`type` | `app/auth/confirm/route.ts` | **À vérifier** (réglage du projet Supabase) |
| Politique de mot de passe | ≥ 6 caractères (Zod, source unique `lib/constants/password.ts`, alignée sur Supabase Auth), aucune règle de complexité ni liste de mots de passe compromis | `schemas.ts`, `lib/constants/password.ts` | Confirmé |
| Sessions | JWT Supabase en cookies gérés par `@supabase/ssr` ; rafraîchis par le middleware | `middleware.ts`, `lib/supabase/server.ts` | Confirmé ; attributs exacts des cookies (`Secure`, `SameSite`) déterminés par la bibliothèque — **À vérifier** en production |
| Déconnexion | `signOut` serveur | `auth.ts:355-359` | Confirmé ; impossible depuis `/pending` (P-005) |
| Récupération de mot de passe | Email Supabase → `/auth/confirm` → `/reset-password` ; réponse neutre ; rate limits | `auth.ts:282-353` | Confirmé ; P-026 |
| Anti-brute-force | Rate limit IP + compte en base (fail-closed) | `rateLimit.ts:88-128` | Confirmé ; P-023, P-024 |
| CAPTCHA | Vérification serveur Turnstile ; widget client **sans script** | `LoginForm.tsx:111-118`, aucune balise `challenges.cloudflare.com` | Problème (P-006) |
| MFA, SSO, OAuth | Absents | — | Absent |
| Création d'ADMIN | Hors application (script service role) ; plus d'auto-promotion (0012) | `scripts/create-admin.mjs` | Confirmé |

## 2. Autorisation

### 2.1 Modèle

- Rôles : `STUDENT`, `DELEGATE`, `ADMIN` (`profiles.role`) + statut d'approbation dérivé de `registration_requests`.
- **Référence réelle : la RLS PostgreSQL** (toutes les tables ont RLS activée). Fonctions d'aide `SECURITY DEFINER` avec `search_path` fixé (bonne pratique).
- Couches complémentaires : contrôles dans certaines Server Actions, affichage conditionnel dans l'UI, helpers `lib/business/permissions.ts` (seuls `canDeleteResource` et `canViewClassStats` sont réellement utilisés).

### 2.2 Matrice RLS résumée

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| classes | **tous (anonymes inclus)** | admin | — | admin si vide |
| profiles | soi, admin, membres de sa classe (email exclu par privilèges) | — (service role) | soi (rôle/classe bloqués par trigger), admin | — |
| subjects | membres | admin | admin | admin |
| registration_requests | soi, admin, délégué de la classe | **soi, statut libre** | admin, délégué (toutes colonnes) | — |
| tasks, recordings | membres | admin, délégué | admin, délégué | admin, délégué |
| task_completions | soi, membres de la classe | soi (classe non vérifiée) | soi + membre | soi + membre |
| documents, hints | membres | membre + auteur = soi | — | auteur, délégué, admin |
| chat_messages | membres | membre + auteur = soi ; annonce réservée | — | auteur, délégué, admin |
| notifications | destinataire, admin | admin | destinataire, `read_at` seul | — |
| assignment_email_notifications | admin | — | — | — |
| assistant_chats / messages | propriétaire | propriétaire | propriétaire (chats) | propriétaire (chats) |
| ai_rate_limits | — | — | — | — (RPC `SECURITY DEFINER` exécutable par `authenticated`) |

Points solides (déjà corrigés par les migrations 0009-0015 et confirmés à la lecture) : email non lisible par les clients ; annonces réservées ; matières de la même classe ; aucune création d'ADMIN côté client ; notifications immuables ; droits de suppression alignés ; rate limiting partagé entre instances.

## 3. Vulnérabilités et risques identifiés

Échelle : **Critique / Élevé / Moyen / Faible / Info**. Confiance : **Élevée** (mécanisme entièrement visible dans le code), **Moyenne** (dépend d'un élément non vérifiable), **Faible**.

### P-020 — Contournement de la validation d'inscription — **Critique (si P-021 exploitable) / Élevé sinon** — confiance Élevée (code), exploitation non rejouée

- **Mécanisme 1 (RLS)** : la policy `regreq_insert` (`schema.sql:536-538`) n'impose que `user_id = auth.uid()`. Un utilisateur authentifié peut insérer via l'API REST sa propre demande avec `status = 'ACCEPTED'` (et un `decided_by` arbitraire). `is_approved_member()` devient alors vrai (`schema.sql:346-356`) et la dernière demande est « ACCEPTED », ce qui ouvre le dashboard (`layout.tsx:45-46`).
- **Mécanisme 2 (Server Action)** : `decideRegistrationAction` (`actions/auth.ts:365-449`) ne vérifie pas le rôle de l'appelant et ne vérifie pas que l'UPDATE a modifié une ligne (avec RLS, un UPDATE refusé renvoie 0 ligne **sans erreur**). Un demandeur peut lire sa propre demande (policy `regreq_select`) ; si l'action est invoquée pour cette demande avec `ACCEPTED`, le code exécute ensuite **via service role** `profiles.class_id = class_id demandé`, crée la notification d'acceptation et envoie l'email.
- **Combinaison** : profil rattaché à une classe + demande « ACCEPTED » auto-insérée = **accès complet en lecture/écriture de membre à la classe choisie sans validation humaine**.
- **Atteignabilité de l'action** : les Server Actions sont des endpoints HTTP publics ; l'identifiant de `decideRegistrationAction` est présent dans le bundle client de `/login` du build de développement local (module importé par `LoginForm`). En production : **À vérifier**.
- Même sans le mécanisme 1, le mécanisme 2 seul rattache un compte PENDING à une classe : il reçoit alors toutes les notifications de classe (titres de devoirs/documents, extraits d'annonces) et les emails de rappel, car `notifyClassMembers` et le cron sélectionnent par `class_id` sans vérifier l'approbation (`lib/notifications/service.ts:85-88`, `reminders/route.ts:57-60`).
- **Correctif** : `WITH CHECK (user_id = auth.uid() AND status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL)` ; contrôle explicite du rôle et de la classe dans l'action ; vérifier le nombre de lignes modifiées (`.select()` après update) avant tout effet service role ; filtrer les destinataires de notifications sur l'approbation.

### P-021 — Effets « service role » exécutés malgré un refus RLS — **Élevé** — confiance Élevée

Motif récurrent : *mutation avec le client utilisateur (refusée silencieusement par la RLS) → effets secondaires avec le client service role*.

| Action | Effet non autorisé possible |
|---|---|
| `updateTaskAction` (`tasks.ts:115-163`) | Tout utilisateur authentifié peut faire envoyer une notification « 🔔 Devoir modifié — Le devoir « *texte libre ≤ 150 caractères* » a été modifié » à **tous les membres de n'importe quelle classe** (le `classId` vient du formulaire). |
| `appointDelegateAction` / `removeDelegateAction` (`classes.ts:57-93`) | Notification « Nomination délégué » / « Rôle délégué retiré » envoyée à n'importe quel utilisateur. |
| `decideRegistrationAction` | Voir P-020. |

Correctif : autorisation explicite **avant** tout effet ; dériver `classId` de la ressource en base, jamais du formulaire ; vérifier les lignes affectées.

### P-022 — L'utilisateur peut modifier l'email de son profil — **Élevé** — confiance Élevée

- `profiles_update_self` (`schema.sql:500-502`) autorise la mise à jour de sa ligne ; le trigger ne protège que `role` et `class_id` (`schema.sql:430-442`) ; les privilèges UPDATE par colonne ne sont pas restreints (seul SELECT l'est).
- Conséquences : (a) les emails automatiques (rappels, acceptation) sont envoyés à `profiles.email` (`reminders/route.ts:57-60`, `auth.ts:404-409`) → **détournement vers une adresse arbitraire** ; (b) **squatting** : en prenant l'adresse d'un tiers avant son inscription, on bloque son inscription (« adresse déjà utilisée », `auth.ts:37-45`) ; (c) divergence avec `auth.users`.
- Correctif : révoquer l'UPDATE table-level puis n'accorder que les colonnes autorisées (prénom, nom) ; ou trigger d'immuabilité ; source unique de l'email (Auth).

### P-023 — RPC de rate limiting détournable — **Moyen à Élevé** — confiance Élevée

- `check_ai_rate_limit` est exécutable par tout `authenticated` avec une **clé et une limite arbitraires** (`schema.sql:895-896`). L'incrément se fait quelle que soit la limite passée.
- Les clés sont prévisibles : `auth:login:acc:<email>`, `auth:login:ip:<ip>`, `auth:reset:*`, `assistant:<uuid>`, `assistant:m:<uuid>`, `assistant:d:<uuid>` (`rateLimit.ts:102, 115, 147, 160` ; `route.ts:53-57`). Les UUID des camarades sont lisibles.
- Conséquences : **verrouiller la connexion de n'importe quel compte** dont on connaît l'email, épuiser le quota IA d'un autre utilisateur, remplir la table.
- Correctif : retirer `EXECUTE` à `authenticated` (appel uniquement via service role côté serveur, comme le login le fait déjà) ; ou fonction dédiée qui calcule la clé à partir de `auth.uid()`.

### P-024 — Verrouillage de compte par tentatives (déni de service ciblé) — **Moyen** — confiance Élevée

5 échecs/15 min par email bloquent le compte, **même pour le vrai propriétaire** (`rateLimit.ts:36-39`). Combiné à P-023, aucun mot de passe n'est même nécessaire. Correctif : limiter par couple (IP, compte), backoff progressif, CAPTCHA au-delà d'un seuil plutôt que blocage.

### P-025 — Crons ouverts si `CRON_SECRET` absent — **Moyen** (dépend de la configuration) — confiance Élevée

`authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` (`reminders/route.ts:23`, `cleanup/route.ts:14`) : si la variable n'est pas définie, la chaîne attendue devient `Bearer undefined`, devinable. Correctif : refuser si la variable est vide ; comparaison à temps constant.

### P-026 — Changement de mot de passe sans ré-authentification — **Moyen** — confiance Élevée

`/reset-password` et `updatePasswordAction` acceptent **toute session** (`reset-password/page.tsx:18`, `auth.ts:338-346`), pas seulement une session issue d'un lien de récupération. Une session volée ou un poste laissé ouvert permet de prendre le contrôle définitif du compte. Correctif : exiger l'ancien mot de passe ou un événement `PASSWORD_RECOVERY` récent / nonce.

### P-027 — Validation des liens « Google Drive » contournable — **Moyen** — confiance Élevée

`/drive\.google\.com|docs\.google\.com/.test(url)` (`schemas.ts:61-64`) n'est pas ancrée : `https://site-malveillant.example/?x=drive.google.com` est acceptée. Ces liens sont affichés comme ressources officielles de la classe et transmis par l'assistant IA. Correctif : parser l'URL et comparer `hostname` à une liste exacte, imposer `https:`.

### P-028 — Dépendances vulnérables — **Élevé** — confiance Élevée (`npm audit` du 12/10/2026)

| Paquet | Sévérité | Direct | Correctif proposé par npm |
|---|---|---|---|
| next 14.2.35 | **Critique** (23 avis : DoS, SSRF, contournement middleware, empoisonnement de cache…) | oui | 16.x (majeure) |
| nodemailer 9.0.5 | Élevée (7 avis) | oui | disponible |
| tailwindcss / chokidar / braces / micromatch / fast-glob / brace-expansion / js-yaml / source-map-js | Élevée (chaîne d'outillage) | indirect sauf tailwind | disponibles |
| vitest / @vitest/mocker / postcss-* | Modérée | dev | disponibles |

L'ancien audit avait ramené le total à 1 ; de nouveaux avis sont parus depuis. La branche Next 14 n'est plus la cible des correctifs.

### P-029 — Absence d'en-têtes de sécurité — **Moyen** — confiance Élevée

`next.config.mjs` ne définit ni CSP, ni HSTS, ni `X-Frame-Options`/`frame-ancestors`, ni `Referrer-Policy`, ni `Permissions-Policy` (seul `poweredByHeader: false`). Vercel ajoute HSTS sur ses domaines (**À vérifier** pour un domaine personnalisé).

### P-030 — Fonctions accessibles aux comptes non approuvés — **Faible à Moyen**

`POST /api/assistant` ne vérifie que la session (`route.ts:46-50`) : un compte PENDING ou REJECTED consomme des appels LLM payants/quotas (100/jour/compte, comptes créables en série — aucun CAPTCHA à l'inscription). Les outils renvoient des données vides grâce à la RLS (pas de fuite directe).

### P-031 — Spam de notifications — **Faible**

Chaque coche de tâche notifie toute la classe (`tasks.ts:91-100`) ; cocher/décocher en boucle inonde les camarades. Aucun rate limit sur les Server Actions en général.

### P-032 — `task_completions` : INSERT sans contrôle de classe — **Faible**

`WITH CHECK (student_id = auth.uid())` seul (`schema.sql:565-574`) : insertion possible sur une tâche d'une autre classe dont on connaît l'UUID (intégrité, pas de fuite).

### P-033 — `registration_requests` : UPDATE sans restriction de colonnes — **Faible**

Un délégué peut modifier `user_id`, `decided_by` ou rouvrir une décision (`schema.sql:540-542`). Les délégués sont des utilisateurs de confiance limitée (étudiants).

### P-034 — Détermination de l'IP client — **Faible** (dépend de l'hébergeur)

Premier élément de `X-Forwarded-For` (`lib/security/ip.ts:10-14`) : falsifiable si l'hébergeur ne réécrit pas l'en-tête (Vercel le réécrit — **À vérifier** pour tout autre hébergement). Repli commun `127.0.0.1` (tous les clients sans en-tête partagent un compteur).

### P-035 — Sortie du LLM insérée sans échappement dans les emails — **Faible**

`personalizedIntro` est injecté tel quel dans le HTML (`templates.ts:117-121, 158-162`) alors que le prénom (choisi par l'utilisateur) fait partie du prompt (`personalize.ts:35-39`). Impact limité (l'email est adressé à la personne elle-même), mais c'est une injection HTML possible.

### P-036 — Données personnelles dans l'historique Git — **Moyen (conformité)**

Le fichier `AUDIT.md`, supprimé par le commit `f52836f`, reste lisible dans le commit `a674a92` ; il contient des **adresses email réelles d'utilisateurs**, l'identifiant du projet Supabase de production et la description de tests menés sur la base de production. Les métadonnées de commit contiennent également une adresse personnelle. Si le dépôt est (ou devient) partagé, ces données sont exposées. Correctif : réécriture d'historique avant toute publication, ou dépôt neuf pour la v2.

### P-037 — Scripts de test écrivant dans la base réelle — **Moyen (opérationnel)**

Les 7 scripts `scripts/verify-*.mjs` créent et suppriment des comptes et données via service role dans la base pointée par `.env.local` (la production d'après l'ancien audit). Un nettoyage interrompu laisse des comptes de test en production.

## 4. Validation des entrées et injections

- Zod sur toutes les Server Actions de formulaire ; **pas** sur les actions à arguments (`decideRegistrationAction`, `delete*Action`, `toggleTaskCompletionAction`, `markNotificationReadAction`) : un identifiant invalide produit une erreur PostgreSQL renvoyée telle quelle au client (fuite mineure d'informations techniques).
- **Injection SQL** : aucune concaténation SQL côté application (query builder paramétré). Le filtre `.or(...)` de pagination du chat (`lib/chat/pagination.ts:17-19`) interpole `created_at` et `id` venant de données déjà lues — risque faible ; à paramétrer dans la v2.
- `ilike('%query%')` de l'assistant (`tools.ts:328-331`) : caractères `%`/`_` non échappés (effet fonctionnel seulement).
- Messages d'erreur bruts de Supabase renvoyés à l'UI dans de nombreuses actions (`error.message`).

## 5. XSS, CSRF, redirections

- **XSS** : rendu React (échappement automatique) ; aucun `dangerouslySetInnerHTML` dans le dépôt ; le Markdown de l'assistant est un rendu maison sans HTML brut, liens limités à `http(s)`, `mailto:` et `/dashboard` (`Markdown.tsx:6-9`). Risque faible. Liens Drive affichés avec `rel="noopener noreferrer"`. **Les URL `javascript:` ne sont pas bloquées** : vérifié localement avec le Zod installé (calcul pur, sans effet de bord), le schéma `driveUrlSchema` accepte à la fois `https://site.example/?a=drive.google.com` et une URL `javascript:…//drive.google.com`. React 18 émet un avertissement mais **n'empêche pas** une URL `javascript:` dans `href`. Ces liens sont rendus dans des `<a target="_blank" rel="noopener noreferrer">` (documents, hints, cours, pièces jointes de tâches) ; le fait que le script s'exécute ou non dans le contexte de l'application dépend du navigateur (**À vérifier**, non testé). **Risque XSS stocké à traiter avec P-027.**
- **CSRF** : Server Actions protégées par la vérification `Origin`/`Host` de Next.js 14 ; cookies Supabase en `SameSite=Lax` par défaut (**À vérifier**) ; `/api/assistant` attend du JSON (un formulaire inter-site `text/plain` serait parsé par `req.json()`, mais les cookies `Lax` ne sont pas envoyés sur un POST inter-site).
- **Redirections** : `/auth/confirm` ne modifie que le `pathname` (pas d'open redirect). Les liens des notifications sont écrits côté serveur uniquement (immuables depuis 0013).

## 6. Secrets et configuration

| Constat | Statut |
|---|---|
| `.env.local` (non suivi) contient des secrets réels : service role, mot de passe SMTP, clés LLM et Resend, `CRON_SECRET` | Présent localement — ne jamais le committer ni le partager |
| `.env.example` : valeurs d'exemple uniquement, sur tout l'historique Git (vérifié par motif, sans afficher les valeurs) | Confirmé |
| Clé service role présente dans l'environnement de **toutes** les fonctions serveur et utilisée dans le chemin des requêtes utilisateurs | Risque structurel (P-070) |
| `NEXT_PUBLIC_APP_URL=http://localhost:3000` en local ; si repris en production, liens d'emails et de récupération cassés | À vérifier sur Vercel (P-064) |
| Aucune rotation ni gestion centralisée des secrets documentée | Absent |
| Exemple de mot de passe faible dans `scripts/create-admin.mjs:5` et README | À ne pas réutiliser |

## 7. Journaux et informations sensibles

- Journal de sécurité d'authentification avec anonymisation email/IP (`lib/security/logger.ts`) — bonne pratique.
- `sanitizeError` retire `EMAIL_PASSWORD`, `EMAIL_USER`, `RESEND_API_KEY` des messages (`emailService.ts:131-141`).
- Mais : la réponse JSON du cron rappels contient les adresses en échec (`reminders/route.ts:109`) ; les clés `ai_rate_limits` stockent emails et IP en clair ; logs via `console.*` uniquement (aucune centralisation, rétention selon Vercel — **À vérifier**).

## 8. Transfert de données vers des tiers

L'assistant transmet au fournisseur LLM : prénom, rôle, nom de classe, questions de l'utilisateur, historique de conversation et résultats d'outils (titres/descriptions de devoirs, documents, notifications, liens). En local, le fournisseur est l'offre gratuite de Google Gemini, dont les conditions peuvent autoriser l'usage des données (**À vérifier** — point de conformité à trancher par le propriétaire).

## 9. Synthèse priorisée

| Priorité | Problèmes |
|---|---|
| Immédiate (avant toute nouvelle ouverture) | P-020, P-021, P-022, P-023, P-027 (+ risque `javascript:`), P-028 (Next/nodemailer) |
| Court terme | P-024, P-025, P-026, P-029, P-036, P-037 |
| Moyen terme | P-030, P-031, P-032, P-033, P-034, P-035 |

Recommandation de fond pour la v2 : **une seule couche d'autorisation applicative explicite et testée** (backend), une base qui n'est plus exposée directement au navigateur, et des tests d'intégration automatisés de chaque règle d'accès (voir `09` et `10`).
