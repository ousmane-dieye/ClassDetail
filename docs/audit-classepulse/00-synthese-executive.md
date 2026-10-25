# 00 — Synthèse exécutive — Audit de ClassePulse

**Date** : 12/10/2026 · **Périmètre** : dépôt `classpulse`, branche `main`, commit `4e27b02` · **Nature** : audit en lecture seule (aucun fichier existant modifié, aucune base ni service externe sollicité).

## Index des livrables

| Fichier | Contenu |
|---|---|
| `00-synthese-executive.md` | Ce document |
| `01-inventaire-fonctionnel.md` | Présentation (A), écrans, opérations, 58 entrées fonctionnelles, 24 règles métier, matrice F-xxx (B) |
| `02-architecture-actuelle.md` | Architecture réelle, 6 diagrammes Mermaid, technologies (C) |
| `03-api-et-integrations.md` | Endpoints, Server Actions, surface Supabase, intégrations externes, traçabilité (D, L) |
| `04-modele-de-donnees.md` | 17 tables, contraintes, ERD, migrations, dérives, données sensibles (E) |
| `05-securite.md` | Authentification, autorisation, 18 constats de sécurité classés (F) |
| `06-serverless-et-infrastructure.md` | 11 composants serverless/managés classés, déploiement, exploitation (G, J) |
| `07-qualite-tests-maintenance.md` | Qualité du code, 149 tests, lacunes, stratégie de tests v2 (H, I) |
| `08-problemes-et-risques.md` | Registre P-001…P-085 (M) |
| `09-architecture-cible.md` | Exigences à préserver, options, architecture recommandée, modèle cible, décisions (N) |
| `10-plan-de-reconstruction.md` | Phases 0-12, migration des données, réduction du serverless, zones non inspectées, questions (N, O) |
| `11-inventaire-technique.md` | Arborescence, points d'entrée, dépendances, variables, scripts, commandes exécutées |
| `12-experience-utilisateur.md` | Analyse UX/UI (K) |

## 1. Ce qu'est ClassePulse

Une application web **Next.js 14 + Supabase**, hébergée sur **Vercel**, qui sert d'espace numérique de classe pour des **étudiants** : devoirs avec suivi individuel et rappels J‑3/J‑1, partage de liens Google Drive (documents, annales « Hints », cours enregistrés), chat de classe temps réel avec annonces, centre de notifications, assistant IA borné à la plateforme, statistiques. Trois rôles : étudiant, délégué (gère sa classe), administrateur. L'inscription est soumise à la validation d'un délégué ou d'un administrateur. Le projet est un **MVP avancé** (8 commits, un contributeur, badge « Bêta »).

## 2. Forces

- Fonctionnalités cohérentes et assez complètes pour l'usage visé.
- **RLS activée sur toutes les tables** et série de correctifs de sécurité bien documentés (migrations 0009-0015 avec contrôles automatiques).
- TypeScript strict, Zod, logique métier pure isolée ; **149 tests unitaires verts**, typage et lint sans erreur (exécutés pendant l'audit).
- Interface soignée, états vides et de chargement, modale de suppression accessible.
- Emails robustes (anti-doublon en base, journal SENT/FAILED, IA jamais bloquante).

## 3. Faiblesses et risques majeurs

| Rang | Risque | Réf. |
|---|---|---|
| 1 | **Contournement possible de la validation d'inscription** : un utilisateur peut s'insérer une demande « ACCEPTED » via l'API Supabase, et l'action de décision rattache un compte à une classe sans vérifier le rôle de l'appelant | P-020 |
| 2 | **Actions serveur déclenchant des effets avec la clé service role même quand la base a refusé l'opération** (notifications usurpées vers n'importe quelle classe) | P-021 |
| 3 | **Email de profil modifiable** par l'utilisateur (détournement des emails, blocage de l'inscription d'un tiers) | P-022 |
| 4 | **Verrouillage de n'importe quel compte** via la fonction de rate limiting exposée | P-023, P-024 |
| 5 | Liens « Google Drive » non réellement validés (liens arbitraires, y compris `javascript:`) | P-027 |
| 6 | Dépendances vulnérables (Next.js : critique ; nodemailer : élevée) | P-028 |
| 7 | **Utilisateur refusé bloqué dans une boucle de redirection** ; administrateur incapable de gérer les contenus de classe | P-001, P-002 |
| 8 | Exploitation fragile : migrations manuelles sans suivi, sauvegardes non démontrées, aucun monitoring, scripts de test contre la production | P-060…P-063, P-037 |
| 9 | Autorisation dispersée entre RLS, actions et UI ; base exposée directement au navigateur — **cause racine** des points 1 à 4 | P-043, P-070, P-071 |
| 10 | Données personnelles dans l'historique Git | P-036 |

## 4. Recommandations prioritaires

1. **Phase 0 (sans attendre la v2)** : corriger P-020, P-021, P-022, P-023, P-027, P-001, monter `nodemailer`, vérifier que les migrations de sécurité sont appliquées en production, faire et tester une sauvegarde, isoler une base de test.
2. Trancher les décisions D-01…D-12 (`09` § 7), en priorité budget, fournisseur d'identité, conservation des tâches.
3. Reconstruire en **monolithe modulaire** (recommandé : React + TypeScript / NestJS / PostgreSQL, ou Next.js auto-hébergé si l'on ne vise pas d'API publique), avec **une couche d'autorisation unique testée**, une base non exposée au navigateur, des jobs en base (pg-boss) à la place des crons serverless, CI et sauvegardes dès le départ.

## 5. Réponses aux questions de la mission

**Que fait exactement ClassePulse aujourd'hui ?**
Il permet à des étudiants d'une classe validée de consulter et cocher les devoirs publiés par leurs délégués, de recevoir des rappels J‑3/J‑1 (notification + email), de partager des liens Drive (documents, annales), de consulter des cours enregistrés, de discuter en temps réel avec la classe, de recevoir des annonces et notifications, et d'interroger un assistant IA sur leurs données de classe. Délégués et administrateurs valident les inscriptions, gèrent tâches et cours, consultent des statistiques ; l'administrateur gère classes, matières, délégués et suit les emails. (Détail : `01`.)

**Quelles sont toutes ses fonctionnalités confirmées ?**
58 entrées inventoriées (F-001…F-058) : **46 confirmées par le code** (dont 15 également couvertes par des tests unitaires), **7 partielles** (F-003, F-011, F-014, F-016, F-021, F-025, F-040), **1 défectueuse** (F-009, resoumission après refus) et **4 annoncées mais absentes ou inutilisées** (F-055…F-058). S'y ajoute l'impossibilité pour un ADMIN sans classe d'utiliser les fonctions de contenu (P-002). Matrice complète : `01` § B.5.

**Comment son architecture fonctionne-t-elle réellement ?**
Un monolithe Next.js serverless (pages rendues côté serveur, Server Actions pour les écritures, 3 Route Handlers) qui interroge Supabase de deux façons : avec le jeton de l'utilisateur (RLS) et avec la clé service role (notifications, emails, inscription, pages d'administration). En parallèle, le navigateur interroge directement Supabase (REST et Realtime). Deux crons Vercel quotidiens déclenchent rappels et purge. (Diagrammes : `02`.)

**Quelles sont ses dépendances serverless ?**
Middleware Edge, rendu et Server Actions sur fonctions Vercel, `POST /api/assistant`, 2 crons Vercel, callback `/auth/confirm`, et les services managés Supabase (Auth, PostgREST, Realtime, PostgreSQL). Classification et plan de migration : `06` § 2 et `10` § 4.

**Quelles données et règles métier doit-on impérativement préserver ?**
Comptes (UUID, emails, hashs de mots de passe si exportables), classes, matières, appartenances et historique des demandes, tâches et complétions, ressources (liens), messages et annonces, notifications, journal des emails ; règles R-01, R-02, R-03, R-05 à R-09, R-15, R-17 à R-21, R-23 (`09` § 1). Les règles R-04, R-10 à R-14, R-16, R-22 sont à trancher.

**Quels sont les principaux problèmes et risques ?**
Voir § 3 ci-dessus et le registre `08` (15 bugs, 18 risques de sécurité/intégrité, 8 dettes, 9 limitations, 6 problèmes d'exploitation, 5 décisions d'architecture discutables).

**Quelles parties peuvent être conservées ?**
Le schéma relationnel et ses contraintes d'intégrité (FK composites, unicités partielles, immuabilité des notifications), la logique pure (`taskStatus`, `reminders`, `pagination`, `guard`, liste blanche de l'assistant), les schémas Zod, les gabarits d'emails, les composants d'interface `components/ui`, les tests unitaires de logique, la conception de l'assistant (outils en lecture, garde-fou, quotas).

**Quelles parties devraient être reconstruites ?**
La couche d'accès aux données et d'autorisation (Server Actions, usage du service role, exposition PostgREST), l'authentification et l'admission, les crons (en jobs avec reprise), le temps réel (événements applicatifs), la gestion des erreurs et des retours UI, la configuration, le processus de migration, le déploiement et l'observabilité.

**Quelle architecture cible est la plus raisonnable et pourquoi ?**
Un **monolithe modulaire** : SPA React + TypeScript, API NestJS + TypeScript, PostgreSQL, jobs pg-boss, WebSocket intégré, Docker Compose derrière Caddy, CI GitHub Actions, sauvegardes chiffrées hors site. Il traite la cause racine (autorisation unique, base non exposée), réduit la dépendance serverless et fournisseur, reste simple à exploiter à l'échelle visée et réutilise une bonne part du code. Si aucune API publique n'est prévue et que l'effort doit être minimal, Next.js auto-hébergé avec une couche de services obligatoire est une alternative valable. Microservices, Kubernetes et Redis ne sont pas justifiés à ce stade. (`09`.)

**Quels sont les principaux risques de migration ?**
Export et réutilisation des hashs de mots de passe Supabase (sinon réinitialisation de tous les comptes) ; incertitude sur l'état réel du schéma de production (migrations non suivies) ; données incohérentes héritées (profils sans demande, emails divergents, demandes auto-acceptées éventuelles) ; perte de données liée à la purge J+1 ; interruption pendant la bascule ; parité fonctionnelle (redirections, rappels dans le bon fuseau). Parades : `10` § 3.

**Quelles décisions devons-nous prendre avant de commencer à coder ?**
D-01 option d'architecture, D-02 budget d'hébergement, D-03 fournisseur d'identité, D-04 conservation des tâches, D-05 multi-classe, D-06 fichiers, D-07 assistant IA (périmètre, fournisseur, données transmises), D-08 migration des conversations, D-09 règles d'admission, D-10 cible et volumétrie (multi-établissement ?), D-11 langues, D-12 conformité. (`09` § 7.)

**Quel est l'ordre recommandé pour reconstruire le projet ?**
Phase 0 (sécuriser la v1) → exigences → décisions d'architecture → fondations (monorepo, CI, environnements) → modèle de données et migrations → authentification et autorisation → modules métier (classes, admission, tâches, ressources, notifications, chat, stats, assistant) → frontend → jobs/emails/temps réel → tests et sécurisation → déploiement, monitoring, sauvegardes → migration des données → recette et mise en production. (`10`.)

## 6. Contrôle final

| Vérification | Résultat |
|---|---|
| Inventaire du dépôt | Tous les fichiers suivis ont été parcourus ; fichiers de logique lus intégralement ; zones partielles listées dans `10` § 5 |
| Preuves | Chaque fonctionnalité et chaque problème renvoient à des fichiers et lignes |
| Cohérence pages / API / règles / données | Croisée dans `01` § B.5, `03` § 7, `04` |
| Zones non inspectées | Listées (`10` § 5) : base et tableaux de bord de production, exécution de l'application |
| Diagrammes | Construits à partir des composants observés ; éléments d'hébergement non visibles marqués « À vérifier » |
| Faits vs hypothèses | Statuts Confirmé / Partiel / À vérifier / Absent / Problème ; confiance indiquée pour chaque risque |
| Recommandations | Isolées dans `09` et `10`, présentées comme propositions |
| Fichiers originaux | Non modifiés (`git status` identique avant/après ; seuls de nouveaux fichiers ont été créés dans `docs/audit-classepulse/`) |
| Secrets | Aucune valeur de secret, aucun email ni nom réel, aucun identifiant de projet reproduit |
| Questions au propriétaire | 18 questions (`10` § 6) |
| Tests exécutés | `vitest run` 149/149, `tsc` 0 erreur, `eslint` 0 erreur/10 avertissements, `npm audit` 14 vulnérabilités. Non exécutés : `next build`, application, scripts `verify-*`, crons (risque d'écriture ou d'envoi réel) |
