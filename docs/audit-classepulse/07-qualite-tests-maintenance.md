# 07 — Qualité du code, tests et maintenabilité (Rapports H et I)

## Partie H — Qualité structurelle

### H.1 Points forts constatés

- TypeScript strict (`strict`, `noUncheckedIndexedAccess`), `tsc --noEmit` sans erreur.
- Lint `next/core-web-vitals` : 0 erreur (10 avertissements `<img>`).
- Validation Zod centralisée (`lib/validation/schemas.ts`).
- Logique pure isolée et testée : `lib/business/taskStatus.ts`, `lib/email/reminders.ts`, `lib/chat/pagination.ts`, `lib/ai/guard.ts`.
- Migrations SQL idempotentes, commentées, avec **contrôles d'application bruyants** (`DO $$ … raise exception`) — pratique remarquable.
- Commentaires abondants et en français, explicitant les décisions de sécurité.
- Gestion des secrets prudente dans les logs (`sanitizeError`, anonymisation).

### H.2 Problèmes observables

| ID | Problème | Preuve | Conséquence concrète | Priorité | Piste | À vérifier avant modification |
|---|---|---|---|---|---|---|
| P-043 | **Autorisation dispersée** sur RLS, actions, UI et helpers inutilisés | `lib/business/permissions.ts` (seuls `canDeleteResource`, `canViewClassStats` utilisés) ; rôles testés en dur (`tasks/page.tsx:32`, `recordings/page.tsx:34`, `chat/page.tsx:57-58`) | Écarts → P-020, P-021 ; toute nouvelle fonctionnalité doit répliquer les règles en 3 endroits | Élevée | Une couche d'autorisation unique côté backend, testée | Toutes les policies RLS |
| P-044 | Accès aux données et logique métier dans les pages | 142 appels `.from(...)` dans 31 fichiers ; calculs de stats dans `stats/page.tsx` | Impossible de réutiliser (API, mobile), difficile à tester | Élevée | Services métier + repository | — |
| P-044b | Requêtes redondantes à chaque navigation | Middleware `getUser` + layout (`getUser` + 3 requêtes) + page (`getUser` + profil) | 3 appels Auth et ≥ 5 requêtes par page | Moyenne | Contexte de requête mis en cache | — |
| P-040 | Types de base **écrits à la main** | `types/database.types.ts:1-2` (« génération réelle recommandée ») ; `Insert: Partial<Row>` ; tables manquantes | Dérive silencieuse schéma/code | Moyenne | Génération automatique (Supabase CLI ou ORM) | — |
| P-041 | Deux sources de vérité du schéma (`schema.sql` + migrations), pas d'outil | `supabase/` | Bases divergentes (`04` § 5) | Élevée | Outil de migration versionné | Base de production |
| — | Assertions non nulles / `any` | 19 `user!`/`profile!` dans `app/`, 22 `any` | Crash possible si profil absent ; perte du typage sur les jointures | Moyenne | Garde explicite, types générés | — |
| P-003 | Résultats d'actions ignorés | Actions inline `async (fd) => { "use server"; await …; }` (`tasks/page.tsx:110,170,193`, `admin/page.tsx:175-349`, `documents/page.tsx:70`…) | Aucun message d'erreur/succès | Moyenne | `useFormState`/toasts | — |
| — | Erreurs Supabase ignorées en lecture | `data ?? []` partout | Une panne s'affiche comme « aucune donnée » | Moyenne | Gestion d'erreur + boundary | — |
| — | Pas de transaction sur les opérations multi-étapes | `registerAction` (Auth → profil → demande), `decideRegistrationAction` | États incohérents (compte orphelin, profil sans demande) | Moyenne | Transaction / fonction SQL | — |
| P-042 | Code mort / annoncé non implémenté | `class_members`, `last_seen_at`, `useRealtimeTable`, `useRealtimeNotifications`, `useSmartPolling`, `useRealtimeConnection`, `getTaskColor`, `TASK_COLOR_HEX`, 6 helpers de permissions, `sendAssignmentReminder3Days/1Day`, `simpleHtmlEmail`, `renameChatAction`, types de notification jamais émis, `@next/bundle-analyzer` | Bruit, fausse impression de fonctionnalités | Faible | Supprimer ou implémenter | README |
| P-045 | Duplication | 3 composants `StatCard` (`admin`, `delegate`, `stats`) ; 5 pages d'auth au gabarit identique ; mapping des libellés de types de tâche dupliqué (`TaskCard.tsx:27-34`, `tasks/page.tsx:125`, `tools.ts:176-186`) | Incohérences visuelles et textuelles | Faible | Composants partagés | — |
| P-008 | Trois calculs différents de l'échéance | `taskStatus.ts` (jours calendaires, inutilisé), `TaskCard.tsx` (heures), `tools.ts:193-195` (`Math.ceil` d'heures), `student/page.tsx:62-70` | Affichages contradictoires (ex. « J‑2 » vs « 1j restant ») | Moyenne | Un seul module de dates | Rappels |
| — | Configuration non centralisée | `process.env` lu directement dans 18 fichiers (dont 4 avec assertion `!`) | Erreurs tardives en production | Moyenne | Module de config validé au démarrage | — |
| — | Dates selon le fuseau du **serveur** | `tasks/page.tsx:18-22`, `z.coerce.date()` sur `datetime-local`, salutation `student/page.tsx:74` | Décalages si le serveur n'est pas en UTC+0 (sans effet visible à Dakar, UTC+0) | Faible | Fuseau explicite | — |
| P-046 | Documentation obsolète | README : « 73 tests »/« 52 tests » (réel : 149), cleanup horaire (réel : quotidien), `lib/messaging/` (inexistant), présence/reconnexion (absentes), migrations listées jusqu'à 0007 | Mauvaise compréhension par un repreneur | Faible | Mettre à jour | — |
| — | Fichiers parasites | `tsconfig.tsbuildinfo` suivi par Git ; fichier non suivi d'un autre projet à la racine | Bruit | Faible | Nettoyer | — |

### H.3 Zones à fort risque de régression

| Zone | Pourquoi | Modules à vérifier avant modification |
|---|---|---|
| Policies RLS et fonctions `is_*` | Toute l'isolation des classes en dépend ; utilisées par Realtime | Toutes les pages, Realtime, assistant |
| `actions/auth.ts` | Inscription, décision, connexion, reset dans un seul fichier de 449 lignes | middleware, layout, scripts verify, tests |
| `middleware.ts` + `app/dashboard/layout.tsx` | Redirections croisées (P-001) | Pages `(auth)` |
| `lib/notifications/service.ts` | Appelé par 8 actions et le cron ; utilise le service role | Toutes les actions de création |
| `lib/email/*` | Anti-doublon couplé à `tasks` (cascade) | Cron, décision d'inscription |
| `profiles.class_id` | Pivot de l'appartenance, lu partout | Notifications, cron, stats, toutes les pages |

## Partie I — Tests et fiabilité

### I.1 Inventaire (exécuté : `vitest run`, 12/10/2026 — **16 fichiers, 149 tests, 100 % verts**, ~12 s)

| Fichier | Tests | Type | Ce qui est couvert | Limites |
|---|---|---|---|---|
| `taskStatus.test.ts` | 8 | Unitaire pur | Couleurs J‑x, jours restants, purge 24 h | La fonction de couleur n'est pas utilisée par l'UI |
| `reminders.test.ts` | 10 | Unitaire pur | Décision J‑3/J‑1, rendu, déjà envoyé | Pas le cron lui-même |
| `emailService.test.ts` | 15 | Unitaire (nodemailer, admin, LLM mockés) | Expéditeur, anti-doublon, FAILED, LLM en panne | Pas d'envoi réel |
| `notifications.test.ts` | 6 | Unitaire (admin mocké) | Catégories, insertion, exclusion de l'auteur | — |
| `assistantTools.test.ts` | 5 | Unitaire | Liste blanche des liens | Pas les outils de données |
| `assistant-rate-limit.test.ts` | 8 | Route handler mockée | Limites min/heure/jour, fail-closed | RPC simulée |
| `guard.test.ts` | 8 | Unitaire | Mots-clés hors sujet | — |
| `permissions.test.ts` | 11 | Unitaire | Matrice des helpers | Helpers majoritairement inutilisés |
| `rate-limit.test.ts` | 8 | Unitaire | Sémantique de fenêtre | — |
| `auth-security.test.ts` | 10 | Unitaire (store simulé) | Seuils login/reset, Turnstile, expiration | Pas `loginAction` complet |
| `password-recovery.test.ts` | 13 | Actions mockées | Parcours reset, anti-énumération | — |
| `resubmit.test.ts` | 11 | Action mockée | Règles de resoumission | **Ne détecte pas la boucle de redirection P-001** |
| `confirm-delete.test.ts` | 11 | Rendu SSR + action mockée | Modal, erreurs | — |
| `resources-delete.test.ts` | 11 | Actions mockées | Suppression documents/hints | — |
| `chat-pagination.test.ts` | 7 | Unitaire | Curseur keyset, fusion | — |
| `stats-access.test.ts` | 7 | Page mockée | Garde de rôle stats | — |

Scripts `scripts/verify-*.mjs` : **tests d'intégration de sécurité contre une base réelle** (non exécutés : écritures en production). Ils ne sont ni automatisés ni isolés.

### I.2 Absents

Tests d'intégration contre une base de test (RLS, triggers, contraintes) ; tests de Server Actions avec vraie base ; tests de composants interactifs ; tests end-to-end (navigation, redirections) ; tests de migration ; tests de performance/charge ; tests de sécurité automatisés (autorisation négative) ; couverture mesurée (aucun outil de couverture configuré).

### I.3 Fonctionnalités critiques non testées

Inscription complète (`registerAction`), décision d'inscription (`decideRegistrationAction` — siège de P-020/P-021), création/modification de tâche, complétion, envoi de message/annonce, cron rappels de bout en bout, cron purge, middleware et layout (P-001), outils de données de l'assistant, policies RLS (hors scripts live), Realtime.

### I.4 Difficultés de reproduction

Pas de base locale (Supabase CLI / Docker absent), pas de seed d'utilisateurs, `.env.local` pointant vers la base réelle, dépendances à SMTP/LLM/Turnstile réels.

### I.5 Stratégie de tests proposée pour la v2

| Niveau | Priorité | Outils indicatifs | Contenu | Critère d'acceptation |
|---|---|---|---|---|
| Tests d'autorisation (intégration API + base de test) | **P0** | Jest/Vitest + Supertest + PostgreSQL en conteneur (Testcontainers) | Pour **chaque** endpoint : matrice rôle × classe × statut d'approbation (autorisé / refusé) ; cas négatifs de P-020…P-033 | 100 % des endpoints couverts par au moins un test d'accès refusé ; aucun effet de bord sur refus |
| Règles métier | P0 | Unitaires | R-01…R-24 (`01` § B.4), calcul d'échéance unique, rappels, purge/archivage | Chaque règle a un test nommé par son ID |
| Migrations | P1 | Outil de migration + base éphémère en CI | Montée depuis zéro, montée depuis un dump anonymisé de la v1 | Migration rejouable, contrôles d'intégrité verts |
| Jobs asynchrones | P1 | Intégration | Idempotence des rappels, reprise des échecs, fuseau | Exécution double = aucun doublon |
| End-to-end | P1 | Playwright | Inscription → validation → connexion → tâche → complétion → notification ; refus → resoumission ; reset mot de passe | Parcours verts sur Chromium + mobile |
| Contrats API | P2 | OpenAPI + validation de schéma | Réponses conformes | — |
| Performance | P2 | k6 | Cron sur 2 000 étudiants, chat 100 utilisateurs simultanés | Seuils définis avec le propriétaire |
| Sécurité | P2 | `npm audit`/Dependabot, en-têtes, scan | Aucune vulnérabilité haute non justifiée | Bloquant en CI |
