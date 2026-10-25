# 11 — Inventaire technique

> Audit ClassePulse — état du dépôt au commit `4e27b02` (branche `main`), audité le 12/10/2026.
> Légende des statuts : **Confirmé** (démontré par le code/la config), **Partiel**, **À vérifier**, **Absent**, **Problème identifié**.

## 1. Vue d'ensemble du dépôt

| Élément | Valeur constatée | Source |
|---|---|---|
| Type de projet | Application web unique Next.js (App Router) + Supabase | `package.json`, `app/`, `supabase/` |
| Langage | TypeScript (strict, `noUncheckedIndexedAccess`) ; SQL (PL/pgSQL) ; quelques scripts `.mjs` | `tsconfig.json` |
| Gestionnaire de paquets | npm (`package-lock.json`, lockfileVersion npm) | racine |
| Nombre de commits | 8 (du 13/08/2026 au 21/08/2026), un seul auteur | `git log` |
| Fichiers suivis par Git | 148 (hors `node_modules`, `.next`) | `git ls-files` |
| Lignes de code applicatif (hors lockfile, CSS, SQL) | ≈ 11 000 lignes TS/TSX | `wc -l` |
| Fichier non suivi à la racine | `[•] PHASE 0 — Audit complet (script.sql,` : liste de phases d'un **autre projet** (Laravel/MariaDB, e‑commerce) sans rapport avec ClassePulse | racine |
| Documentation | `README.md` (424 lignes, en partie obsolète, cf. `07`) ; un ancien `AUDIT.md` supprimé (commit `f52836f`) mais présent dans l'historique (commit `a674a92`) | Git |
| CI/CD | **Absent** : aucun `.github/`, `.gitlab-ci.yml`, ni autre pipeline | recherche |
| Conteneurisation | **Absent** : aucun `Dockerfile` / `docker-compose` | recherche |
| Infrastructure as code | Seul `vercel.json` (2 crons) | `vercel.json` |

## 2. Arborescence commentée

```
classpulse/
├── app/                         Next.js App Router (pages, layouts, route handlers)
│   ├── page.tsx                 Landing page publique (447 lignes, contenu marketing statique)
│   ├── layout.tsx               Layout racine (polices Google Inter / Space Grotesk, métadonnées)
│   ├── globals.css              Thème Tailwind (variables CSS clair/sombre)
│   ├── (auth)/                  Groupe de routes publiques d'authentification
│   │   ├── login/ register/ pending/ forgot-password/ reset-password/ recovery-error/
│   ├── auth/confirm/route.ts    Échange du lien email Supabase (PKCE / token_hash)
│   ├── api/
│   │   ├── assistant/route.ts   POST — assistant IA (SSE)
│   │   └── cron/{reminders,cleanup}/route.ts   GET — tâches planifiées Vercel
│   └── dashboard/               Espace authentifié (layout = garde d'accès)
│       ├── page.tsx             Redirection selon le rôle
│       ├── admin/ (+ emails/)   Administration (ADMIN)
│       ├── delegate/            Espace délégué (DELEGATE/ADMIN)
│       ├── student/             Accueil étudiant
│       ├── tasks/ documents/ hints/ recordings/ chat/ notifications/ stats/
│       └── */loading.tsx        12 squelettes de chargement
├── actions/                     10 fichiers de Server Actions ("use server") = mutations
├── components/                  Composants React (client et serveur), dont ui/ (9 primitives)
├── lib/
│   ├── ai/                      Intégration LLM (openai.ts, tools.ts, guard.ts, personalize.ts)
│   ├── business/                Règles pures (permissions.ts, taskStatus.ts)
│   ├── chat/pagination.ts       Pagination keyset du chat
│   ├── constants/               URLs d'images Unsplash, citations
│   ├── email/                   Envoi SMTP/Resend, templates, rappels, anti-doublon
│   ├── notifications/service.ts Création de notifications (service role)
│   ├── realtime/hooks.ts        Hooks Supabase Realtime (en partie inutilisés)
│   ├── security/                Rate limiting, IP, journalisation, Turnstile
│   ├── supabase/                Clients navigateur / serveur / service role
│   └── validation/schemas.ts    Schémas Zod
├── middleware.ts                Rafraîchissement de session + redirections
├── supabase/
│   ├── schema.sql               Schéma complet (900 lignes) — « source » pour base neuve
│   ├── seed.sql                 2 classes + 5 matières de démonstration
│   └── migrations/0001…0015     15 migrations SQL manuelles (SQL Editor)
├── scripts/                     create-admin, test-email, 7 scripts verify-* (tests live)
├── tests/                       16 fichiers Vitest (149 tests)
├── types/database.types.ts      Types de la base ÉCRITS À LA MAIN
├── vercel.json                  Crons
└── next.config.mjs, tailwind.config.ts, tsconfig.json, vitest.config.ts, .eslintrc.json
```

Dossiers générés présents localement (non suivis, ignorés par `.gitignore`) : `node_modules/`, `.next/` (artefacts de build **de développement** et caches de production webpack), `tsconfig.tsbuildinfo` (suivi par Git alors qu'il s'agit d'un artefact — dette mineure).

## 3. Points d'entrée

| Point d'entrée | Type | Fichier |
|---|---|---|
| Pages publiques `/`, `/login`, `/register`, `/pending`, `/forgot-password`, `/reset-password`, `/recovery-error` | Server Components (formulaires client) | `app/page.tsx`, `app/(auth)/*/page.tsx` |
| Pages authentifiées `/dashboard/**` | Server Components + composants client | `app/dashboard/**` |
| `GET /auth/confirm` | Route Handler | `app/auth/confirm/route.ts` |
| `POST /api/assistant` | Route Handler (Node runtime, SSE) | `app/api/assistant/route.ts` |
| `GET /api/cron/reminders`, `GET /api/cron/cleanup` | Route Handlers déclenchés par Vercel Cron | `app/api/cron/*/route.ts` |
| Server Actions (≈ 35 fonctions exportées) | Endpoints HTTP POST implicites de Next.js | `actions/*.ts` + actions inline dans les pages |
| Middleware | Edge runtime | `middleware.ts` |
| API PostgREST / Realtime / Auth de Supabase | Accès **direct depuis le navigateur** avec la clé anon + JWT utilisateur | `lib/supabase/client.ts` |
| Scripts CLI | Node | `scripts/*.mjs` |

## 4. Dépendances (versions installées vérifiées par `npm ls`)

| Paquet | Déclaré | Installé | Rôle | Indispensable ? |
|---|---|---|---|---|
| `next` | `^14.2.35` | 14.2.35 | Framework fullstack | Oui (actuel) |
| `react`, `react-dom` | `^18.3.1` | 18.3.1 | UI | Oui |
| `@supabase/supabase-js` | `2.55.0` (épinglé exact) | 2.55.0 | Client BDD/Auth/Realtime | Oui (verrou fournisseur) |
| `@supabase/ssr` | `^0.5.2` | 0.5.2 | Sessions cookies côté serveur | Oui |
| `zod` | `^3.23.8` | 3.25.76 | Validation | Oui |
| `nodemailer` | `^9.0.5` | 9.0.5 | Envoi SMTP | Oui (emails) |
| `resend` | `^4.0.0` | 4.8.0 | Repli d'envoi email | Facultatif |
| `lucide-react` | `^0.454.0` | — | Icônes | Facultatif |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | — | Styles utilitaires | Facultatif |
| Dev : `typescript ^5.5.4`, `vitest ^4.1.10`, `eslint ^8.57.1`, `eslint-config-next ^14.2.35`, `tailwindcss ^3.4.14`, `postcss`, `autoprefixer`, `@next/bundle-analyzer ^16.3.1` (déclaré, **non utilisé** dans `next.config.mjs`) | | | Outillage | |

`overrides` npm : `next.postcss → ^8.5.23`, `@next/eslint-plugin-next.glob → ^10.5.0` (correctifs de vulnérabilités, cf. ancien audit).

**`npm audit` exécuté le 12/10/2026 (lecture seule)** : 14 vulnérabilités — 1 critique (`next`, 23 avis, correctif en 16.x = version majeure), 9 hautes (dont `nodemailer` en dépendance directe, 7 avis), 4 modérées. Détail dans `05-securite.md` (§ 9).

## 5. Variables d'environnement

Inventaire des **noms** (aucune valeur reproduite). `.env.example` (suivi, valeurs d'exemple uniquement — vérifié sur tout l'historique) ; `.env.local` présent localement, non suivi, **contient des secrets réels** (ne pas partager).

| Variable | Côté | Usage | Fichiers |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Clients Supabase | `lib/supabase/*`, `middleware.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Client « service role » (contourne RLS) | `lib/supabase/admin.ts`, scripts |
| `EMAIL_HOST/PORT/SECURE/USER/PASSWORD/FROM/FROM_NAME` | Secret (mot de passe) | SMTP (en local : un compte Gmail, port 465) | `lib/email/emailService.ts` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Secret | Repli email | idem |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Secret | LLM (en local : Google Gemini via endpoint compatible OpenAI) | `lib/ai/*` |
| `AI_DAILY_LIMIT` | Serveur | Quota IA quotidien (défaut 100) | `app/api/assistant/route.ts:17` |
| `PLATFORM_NAME`, `ADMIN_CONTACT_EMAIL`, `EMAIL_TEST_ALLOWLIST` | Serveur | Emails | `lib/email/*`, `actions/emails.ts` |
| `NEXT_PUBLIC_APP_URL` | Public | Liens emails, redirection reset | `actions/auth.ts:309`, `emailService.ts:77` — vaut `http://localhost:3000` dans `.env.local` |
| `NEXT_PUBLIC_APP_TIMEZONE` | Public | Calcul J‑3/J‑1 (`Africa/Dakar`) | `lib/business/taskStatus.ts:21` |
| `CRON_SECRET` | Secret | Auth des crons | `app/api/cron/*` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Public / Secret | CAPTCHA connexion (non configuré localement) | `components/LoginForm.tsx`, `lib/security/turnstile.ts` |

Aucune centralisation/validation de la configuration au démarrage : chaque module lit `process.env` directement (souvent avec `!`), ce qui produit des erreurs tardives en cas d'oubli.

## 6. Scripts

| Script | Commande | Effet | Risque |
|---|---|---|---|
| `dev`, `build`, `start`, `lint` | `next …` | Standard | — |
| `test` / `test:watch` | `vitest run` / `vitest` | 149 tests unitaires (mocks) | Aucun |
| `scripts/create-admin.mjs <email> <mdp>` | Node | Crée un utilisateur Auth confirmé + profil ADMIN via service role | Écrit en base pointée par `.env.local` |
| `scripts/test-email.mjs [dest]` | Node | Envoie un vrai email SMTP | Envoi réel |
| `scripts/verify-{f1,s1,s2,s3,s4,s6,s8}.mjs` | Node | **Tests d'intégration live** : créent des comptes/données jetables via service role, testent l'API REST, puis nettoient | **Écrivent dans la base réelle** (non exécutés pendant cet audit) |

## 7. Commandes exécutées pendant l'audit (sans effet de bord sur le dépôt)

| Commande | Résultat |
|---|---|
| `vitest run` (variables secrètes retirées de l'environnement) | **16 fichiers, 149 tests, tous verts** |
| `tsc --noEmit --incremental false` | 0 erreur |
| `eslint --no-cache` sur `app components lib actions middleware.ts` | 0 erreur, 10 avertissements (`<img>` au lieu de `next/image`) |
| `npm audit --json` | 14 vulnérabilités (voir § 4) |
| `npm ls --depth=0` | versions ci-dessus |
| `git status` avant/après | Inchangé (seul le fichier non suivi préexistant) |

Non exécutés volontairement : `next build` (réécrit `.next`), `next dev` (nécessite la base réelle), scripts `verify-*` / `create-admin` / `test-email` (écritures ou envois réels), crons.
