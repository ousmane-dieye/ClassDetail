# 06 — Serverless, services managés, déploiement et exploitation (Rapports G et J)

> Les informations d'hébergement absentes du dépôt (plan Vercel, plan Supabase, réglages des tableaux de bord, domaine, sauvegardes) sont marquées **À vérifier**. Rien n'a été déployé ni appelé.

## 1. Inventaire des composants serverless et managés

### 1.1 Fonctions et déclencheurs

| # | Nom | Localisation | Déclencheur | Rôle | Paramètres | Services appelés | Données lues / modifiées | Autorisations | Erreurs | Dépendance fournisseur | Contraintes | Effets de bord | Dépendants | Si indisponible |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S-01 | Middleware | `middleware.ts` | Chaque requête sur `/dashboard/**`, `/login`, `/register`, `/forgot-password` | Rafraîchir la session, rediriger | cookies | Supabase Auth (`getUser`) | — | anon + JWT | Aucune gestion explicite | Moyenne (Edge runtime Vercel/Next) | Edge : pas d'API Node | Écrit les cookies rafraîchis | Toute navigation authentifiée | Dashboard inaccessible |
| S-02 | Rendu des pages (RSC) | `app/**/page.tsx`, layouts | Requête HTTP | Lecture et rendu | — | PostgREST | Lecture (service role sur admin/délégué/emails) | JWT ou service role | Erreurs Supabase ignorées (`data ?? []`) | Moyenne | Durée max de fonction (**À vérifier**) | — | Toutes les pages | Site indisponible |
| S-03 | Server Actions (≈ 35) | `actions/*.ts` + actions inline | POST `Next-Action` | Mutations | FormData / args | PostgREST, Auth, RPC, SMTP, LLM | Toutes tables | JWT (RLS) + service role | `{error}` souvent ignoré par l'UI | Moyenne (mécanisme Next.js) | — | Notifications, emails | Toute écriture | Écritures impossibles |
| S-04 | `POST /api/assistant` | `app/api/assistant/route.ts` | Requête utilisateur | Assistant IA (SSE) | JSON | RPC, PostgREST, LLM (≤ 4 appels × 30 s) | assistant_*, ai_rate_limits, lectures de classe | Session | Dégradation contrôlée | Faible (Node runtime standard) | **Durée potentielle > 2 min** (4 × 30 s + streaming) vs limite de durée Vercel (**À vérifier**) | Coût LLM | F-042…F-045 | Assistant indisponible (reste du site OK) |
| S-05 | `GET /api/cron/reminders` | `app/api/cron/reminders/route.ts` | Vercel Cron `0 6 * * *` | Rappels J‑3/J‑1 | Bearer secret | PostgREST (service role), SMTP, LLM | tasks, profiles, task_completions, task_reminders_sent, notifications, assignment_email_notifications | `CRON_SECRET` | 500 si lecture des tâches échoue ; échecs d'email journalisés FAILED **non retentés** | Moyenne (planification Vercel) | Boucle séquentielle : 2 requêtes/tâche + 1 insert + 1 email (+ 1 appel LLM de 3 s max) **par étudiant** → risque de dépasser la durée max | Envoi d'emails réels | F-027 | Aucun rappel ce jour-là, jamais rattrapé |
| S-06 | `GET /api/cron/cleanup` | `app/api/cron/cleanup/route.ts` | Vercel Cron `30 6 * * *` | Expiration + purge | Bearer secret | PostgREST (service role) | tasks (+ cascades) | `CRON_SECRET` | 500 si lecture échoue | Moyenne | Charge **toutes** les tâches, 1 requête par tâche | Suppressions définitives | F-026, affichages « Expiré » | Tâches expirées non purgées (sans gravité) |
| S-07 | `GET /auth/confirm` | `app/auth/confirm/route.ts` | Clic sur lien email | Échange de jeton | query | Supabase Auth | session | jeton | → `/recovery-error` | Forte (format des liens Supabase) | — | Ouvre une session | F-005…F-007 | Récupération impossible |
| S-08 | Fonctions PostgreSQL | `schema.sql` | RLS, triggers, RPC | Autorisation, intégrité, rate limit | — | — | toutes | `SECURITY DEFINER` | Exceptions SQL | Faible (PostgreSQL) mais `auth.uid()` Supabase | — | — | Tout | — |
| S-09 | Supabase Auth | managé | Inscription, connexion, emails de récupération | Identité | — | SMTP Supabase (**À vérifier**) | auth.* | — | — | **Forte** | Limites d'envoi d'emails par heure en SMTP par défaut (**À vérifier**) | Emails | F-002…F-007 | Plus de connexion |
| S-10 | Supabase Realtime | managé | Changements des tables publiées | Diffusion | — | — | lecture | RLS | Pas de bannière d'état (annoncée, absente) | **Forte** | Quotas de connexions/messages selon plan (**À vérifier**) | — | F-034, F-039…F-041 | Mises à jour manuelles (F5) |
| S-11 | PostgREST | managé | Toute requête Supabase | API | — | — | toutes | JWT | — | **Forte** | — | — | Tout | Tout |

### 1.2 Services externes appelés depuis le serverless

SMTP/Resend (S-03, S-05), LLM (S-04, S-05 via personnalisation, S-03 via email d'acceptation), Turnstile (S-03). Voir `03-api-et-integrations.md` § 6.

## 2. Classification et options de migration

| # | Composant | Catégorie | Justification | Risques / dépendances | Précautions |
|---|---|---|---|---|---|
| S-01 | Middleware | **2. À migrer vers le backend principal** | Dans une architecture API + SPA, la protection se fait par le backend (guards) et le routeur client ; si l'on garde Next.js, il reste pertinent | Comportements de redirection (P-001, P-005) à redéfinir | Écrire d'abord des tests de navigation |
| S-02 | Rendu RSC | **2** (ou 1 si l'on conserve Next.js) | Lecture des données à déplacer derrière une API REST | Pages qui utilisent le service role | Lister les requêtes par page (fait dans `01`) |
| S-03 | Server Actions | **2. À migrer vers le backend principal** | Cœur métier ; c'est là que se trouvent les failles d'autorisation | Notifications/emails synchrones | Une route REST par action, autorisation centralisée, tests d'intégration |
| S-04 | Assistant IA | **2 + 3** : endpoint backend, appels LLM éventuellement en tâche asynchrone si la durée dépasse les limites | Appels longs, coûteux, à isoler | Quotas fournisseur | Conserver le contrat SSE ; vrai streaming |
| S-05 | Rappels | **3. À transformer en tâche asynchrone** (planificateur + file de jobs en base) | Traitement par lots, envoi d'emails, besoin de reprise sur échec | Fuseau horaire, anti-doublon | Idempotence par contraintes uniques existantes ; reprise des FAILED |
| S-06 | Purge | **6. À examiner avant de décider** puis **3** | La règle métier « suppression à J+1 » détruit l'historique (P-054) ; décision produit requise | Statistiques, journaux | Préférer archivage/soft delete |
| S-07 | Callback email | **2** (si auth internalisée) ou **1** (si Supabase Auth conservé) | Lié au choix du fournisseur d'identité | Liens déjà émis | Conserver la route pendant la transition |
| S-08 | Fonctions/RLS PostgreSQL | **1. À conserver** (en défense en profondeur) et **2** pour l'autorisation principale | Les contraintes d'intégrité (FK composites, uniques partiels, triggers d'immuabilité) sont précieuses | `auth.uid()` spécifique Supabase | Réécrire les policies avec `current_setting('app.user_id')` si on garde la RLS hors Supabase |
| S-09 | Supabase Auth | **6. À examiner** (4 si remplacé) | Remplacer l'auth est le chantier le plus risqué ; les hashs bcrypt sont exportables (**À vérifier**) | Tous les comptes | Migration des hashs, pas de réinitialisation forcée |
| S-10 | Realtime | **4. À remplacer par un service équivalent** (WebSocket/SSE du backend) ou **1** si Supabase reste la base | `postgres_changes` + `router.refresh()` est coûteux ; un bus d'événements applicatif est plus simple | Chat, cloche | Commencer par le chat et les notifications |
| S-11 | PostgREST | **2** (supprimer l'accès direct navigateur) | C'est la surface qui rend la RLS seule barrière | Pagination du chat côté client | Endpoints dédiés |

Aucun composant n'a été démontré inutile (catégorie 5) ; seul du **code mort** est identifié (`07`).

## 3. Déploiement et exploitation actuels

| Sujet | Configuré dans le dépôt | Documenté seulement | Absent / À vérifier |
|---|---|---|---|
| Environnements | Un seul `.env.local` (pointant vers la base réelle) | README : variables Production **et** Preview sur Vercel | Pas de préproduction identifiable |
| Build | `next build` (scripts npm) | README § Production | Aucun build automatisé dans le dépôt |
| Déploiement | — | « poussez sur un dépôt, importez sur Vercel » | Intégration Git ↔ Vercel **À vérifier** |
| Hébergement | `vercel.json` (crons) | Vercel free tier | Plan, région, limites **À vérifier** |
| DNS / HTTPS | — | — | Domaine personnalisé inconnu ; HTTPS fourni par Vercel |
| Secrets | `.env.example` | README (« jamais NEXT_PUBLIC_ ») | Pas de coffre, pas de rotation |
| Migrations en production | 15 fichiers SQL | Exécution manuelle dans le SQL Editor | **Pas de suivi des migrations appliquées** |
| Sauvegardes / restauration | — | — | **Absent** dans le dépôt ; dépend du plan Supabase (plan gratuit : pas de PITR ; sauvegardes quotidiennes selon l'offre — **À vérifier**). Aucune procédure de restauration testée. |
| Logs | `console.*` ; journal de sécurité formaté | — | Rétention Vercel limitée (**À vérifier**) ; aucune centralisation |
| Monitoring / alertes | — | — | **Absent** (pas de Sentry, d'uptime check, d'alerte sur échec de cron) |
| Disponibilité | — | — | Pas d'objectif ; projets Supabase gratuits mis en pause après inactivité (**À vérifier**) |
| Retour arrière | Vercel garde les déploiements précédents (fonction de la plateforme) | — | Pas de retour arrière de schéma (migrations sans « down ») |
| CI/CD | — | README : `npm run lint`, `npm run test` | **Absent** |
| Coûts / quotas | — | README : « Budget : 0 FCFA, 100 % free tier » | Quotas LLM gratuits, SMTP Gmail (limites d'envoi quotidiennes), Supabase/Vercel gratuits — **À vérifier** |

## 4. Risques d'exploitation majeurs

1. **P-060** Migrations manuelles sans suivi : impossible de garantir que la production possède les correctifs 0009-0015.
2. **P-062** Sauvegardes non démontrées : aucune preuve de capacité à restaurer.
3. **P-063** Cron rappels séquentiel non borné : avec quelques classes de 50 étudiants et plusieurs devoirs à J‑1, le temps d'exécution peut dépasser la limite de la fonction ; les rappels non envoyés ne sont jamais rattrapés.
4. **P-061** Aucune alerte : un cron en échec ou une panne SMTP passent inaperçus (seul le tableau « Emails » de l'admin montre les FAILED).
5. **P-037** Scripts de test contre la production.
6. Dépendance au plan gratuit : mise en pause de la base, limites d'envoi d'email, crons quotidiens.
