# 08 — Registre des écarts, défauts et dettes techniques (Rapport M)

> **Lecture des colonnes.** Risque : Critique / Élevé / Moyen / Faible / Info. Priorité : **P0** (avant toute nouvelle ouverture / immédiat), **P1** (court terme), **P2** (moyen terme), **P3** (opportuniste). Effort : Faible / Moyen / Élevé (sur la v1 ; dans la v2 la plupart sont traités par conception). Confiance : niveau de certitude du diagnostic (le code a été lu ; rien n'a été rejoué en production).
>
> Impacts abrégés : **F** fonctionnel, **T** technique, **S** sécurité, **M** maintenance.

## 1. Bugs confirmés (par lecture du code)

| ID | Description | Preuve | Impacts | Risque | Prio | Dépendances | Recommandation | Effort | Confiance |
|---|---|---|---|---|---|---|---|---|---|
| P-001 | **Boucle de redirection pour un utilisateur refusé** : le layout redirige REJECTED vers `/register`, le middleware renvoie tout utilisateur connecté de `/register` vers `/dashboard`. La resoumission (F-009) est inaccessible ; le navigateur affiche une erreur « trop de redirections ». | `app/dashboard/layout.tsx:46` ; `middleware.ts:31-34, 40-42, 48` | F : utilisateur refusé bloqué ; M : tests unitaires ne le détectent pas | Élevé | P0 | F-009 | Exclure `/register` des redirections pour un compte connecté non accepté, ou page dédiée `/resubmit` ; test E2E | Faible | Élevée |
| P-002 | **ADMIN sans classe ne peut pas gérer les contenus** : les pages filtrent sur `profile.class_id ?? ""` et les formulaires postent `classId = ""` (refus Zod silencieux) ; chat vide ; outils IA en erreur. Or `create-admin.mjs` crée l'ADMIN avec `class_id NULL` et annonce une « gestion de toutes les classes ». | `tasks/page.tsx:31,111` ; `documents/page.tsx:31,71` ; `hints/page.tsx:30,70` ; `recordings/page.tsx:23,65` ; `chat/page.tsx:21,54` ; `scripts/create-admin.mjs:67,77` | F | Élevé | P1 | F-020, F-028…F-037 | Sélecteur de classe pour l'ADMIN | Moyen | Élevée |
| P-003 | **Retours d'actions ignorés** : formulaires serveur sans message d'erreur ni de succès (tâches, documents, hints, cours, classes, matières, décisions, délégués). | actions inline `"use server"` (`tasks/page.tsx:110,170,193`, `admin/page.tsx:175-349`, `delegate/page.tsx:93,99`, `documents/page.tsx:70`, `hints/page.tsx:69`, `recordings/page.tsx:64`) | F, UX | Moyen | P1 | — | `useFormState` + notifications d'interface | Moyen | Élevée |
| P-004 | **Suppression « réussie » sans effet** quand la RLS filtre (0 ligne, pas d'erreur) — ex. classe avec membres : la modale se ferme comme si c'était supprimé. | `actions/classes.ts:28-35` ; `schema.sql:484-489` ; idem `deleteTaskAction`, `deleteRecordingAction`, `deleteChatMessageAction` | F | Moyen | P1 | F-014 | Vérifier le nombre de lignes supprimées | Faible | Élevée |
| P-005 | **Un compte en attente ne peut pas se déconnecter** : `/pending` n'a aucun bouton ; `/login` redirige vers `/dashboard` puis `/pending`. | `app/(auth)/pending/page.tsx` ; `middleware.ts:40-42` | F | Moyen | P1 | — | Bouton de déconnexion + infos sur la demande | Faible | Élevée |
| P-006 | **CAPTCHA inopérant** : le widget Turnstile est rendu sans charger le script Cloudflare ; si `TURNSTILE_SECRET_KEY` est défini, **toutes** les connexions échouent. | `LoginForm.tsx:111-118` ; aucune référence à `challenges.cloudflare.com` côté client ; `auth.ts:237-248` | F, S | Moyen (latent) | P1 | F-003 | Charger le script ou retirer la fonctionnalité | Faible | Élevée |
| P-007 | **Suppression d'un utilisateur impossible** s'il a créé un contenu (colonnes auteur NOT NULL + ON DELETE SET NULL) ou statué sur une demande (`decided_by` NO ACTION). | `schema.sql:128, 147, 204, 226, 248, 265` | F, conformité (droit à l'effacement) | Moyen | P1 | — | Auteur nullable + libellé « utilisateur supprimé », ou anonymisation | Moyen | Élevée (sémantique PostgreSQL) |
| P-008 | **Trois calculs d'échéance incohérents** ; la règle documentée J‑x (couleurs) n'est jamais utilisée. | `taskStatus.ts:54-66` (inutilisé) ; `TaskCard.tsx:36-81` ; `tools.ts:193-195` ; `student/page.tsx:62-70` | F | Faible | P2 | F-025 | Module unique de dates | Faible | Élevée |
| P-009 | **Taux de complétion biaisé** : numérateur = complétions de tous (délégués inclus), dénominateur = tâches × STUDENT. | `stats/page.tsx:52-54, 82-93` | F | Faible | P2 | F-046 | Définir la population de référence | Faible | Élevée |
| P-010 | **Compteur de la cloche imprécis** : décrément à chaque UPDATE (l'ancienne ligne Realtime ne contient pas `read_at` sans `REPLICA IDENTITY FULL`) ; état non resynchronisé après `router.refresh()`. | `NotificationBell.tsx:10, 26-34` | F | Faible | P3 | F-040 | Recompter côté serveur | Faible | Moyenne |
| P-011 | Promotion en délégué d'un utilisateur **sans classe** (groupe « Sans classe » avec bouton Promouvoir). | `admin/page.tsx:95-97, 251-257` ; `classes.ts:57-60` | F | Faible | P2 | F-016 | Refuser si `class_id` NULL | Faible | Élevée |
| P-012 | Outils de l'assistant en erreur pour un ADMIN sans classe (`eq("class_id", "")` sur un UUID). | `lib/ai/tools.ts:214-219` etc. | F | Faible | P3 | P-002 | Portée explicite | Faible | Moyenne |
| P-013 | Le placeholder propose « OneDrive, GitHub » alors que seule une URL Google Drive est acceptée. | `tasks/page.tsx:132, 185` ; `schemas.ts:57-64` | F, UX | Faible | P3 | — | Aligner | Faible | Élevée |
| P-014 | Bouton « Rechercher » sans action. | `layout.tsx:91-96` | UX | Faible | P3 | — | Supprimer ou implémenter | Faible | Élevée |
| P-015 | Abonnements Realtime **DELETE filtrés** par `class_id` : Supabase documente que les événements DELETE ne sont pas filtrables et ne passent pas par la RLS. Les suppressions peuvent ne pas être propagées. | `ChatRoom.tsx:127-133` ; `RealtimeListSync` (events DELETE) | F | Faible | P3 | F-036, F-041 | Événements applicatifs | Faible | Moyenne (**À vérifier**) |

## 2. Risques (sécurité et intégrité) — détail dans `05-securite.md`

| ID | Description | Preuve | Impacts | Risque | Prio | Recommandation | Effort | Confiance |
|---|---|---|---|---|---|---|---|---|
| P-020 | Contournement de la validation d'inscription (auto-insertion d'une demande ACCEPTED + action de décision sans contrôle) | `schema.sql:536-538` ; `actions/auth.ts:365-449` | S, F | **Critique** (si action atteignable) / Élevé | P0 | WITH CHECK sur `status`, contrôle de rôle, vérifier lignes modifiées | Faible | Élevée (code) ; exploitation non rejouée |
| P-021 | Effets service role malgré refus RLS (notifications usurpées, rattachement de classe) | `tasks.ts:115-163` ; `classes.ts:57-93` ; `auth.ts:388-445` | S | Élevé | P0 | Autorisation avant effets | Faible | Élevée |
| P-022 | Email de profil modifiable par l'utilisateur (détournement d'emails, blocage d'inscription d'un tiers) | `schema.sql:500-502, 430-442` | S, F | Élevé | P0 | Privilèges par colonne / trigger | Faible | Élevée |
| P-023 | RPC de rate limit appelable avec clé arbitraire (verrouillage de comptes, quotas IA) | `schema.sql:895-896` ; `rateLimit.ts:102,115` | S | Moyen-Élevé | P0 | Retirer EXECUTE à `authenticated` | Faible | Élevée |
| P-024 | Verrouillage de compte après 5 échecs (DoS ciblé) | `rateLimit.ts:36-39` | S | Moyen | P1 | Limite IP+compte, CAPTCHA progressif | Faible | Élevée |
| P-025 | Crons acceptés avec « Bearer undefined » si secret absent | `reminders/route.ts:23` ; `cleanup/route.ts:14` | S | Moyen | P1 | Refuser si secret vide | Faible | Élevée |
| P-026 | Changement de mot de passe sans ré-authentification | `reset-password/page.tsx:18` ; `auth.ts:338-346` | S | Moyen | P1 | Exiger un contexte de récupération ou l'ancien mot de passe | Faible | Élevée |
| P-027 | Validation de lien Drive contournable (y compris `javascript:` — vérifié localement) | `schemas.ts:57-64` | S | Moyen | P0 | Parser l'URL, liste de domaines exacte, `https:` | Faible | Élevée |
| P-028 | Dépendances vulnérables (next critique, nodemailer élevé, 14 au total) | `npm audit` | S | Élevé | P0 | Montée de version planifiée | Moyen (Next 16 = majeure) | Élevée |
| P-029 | Aucune en-tête de sécurité (CSP, frame-ancestors…) | `next.config.mjs` | S | Moyen | P1 | `headers()` | Faible | Élevée |
| P-030 | Assistant IA accessible aux comptes non validés (coût) ; fuite via notifications si `class_id` posé (cf. P-020) | `route.ts:46-50` ; `service.ts:85-88` | S, coût | Faible-Moyen | P1 | Vérifier l'approbation | Faible | Élevée |
| P-031 | Spam de notifications par cocher/décocher | `tasks.ts:91-100` | S, UX | Faible | P2 | Notifier une fois / regrouper | Faible | Élevée |
| P-032 | Complétion insérable sur une tâche d'une autre classe | `schema.sql:565-574` | Intégrité | Faible | P2 | WITH CHECK avec appartenance | Faible | Élevée |
| P-033 | Délégué peut modifier toutes les colonnes d'une demande | `schema.sql:540-542` | Intégrité | Faible | P2 | Restreindre colonnes / transitions | Faible | Élevée |
| P-034 | IP client issue de `X-Forwarded-For` | `ip.ts:10-14` | S | Faible | P3 | Faire confiance au proxy configuré | Faible | Moyenne |
| P-035 | Sortie LLM non échappée dans les emails | `templates.ts:117-121, 158-162` | S | Faible | P3 | Échapper | Faible | Élevée |
| P-036 | Données personnelles et identifiant de projet de production dans l'historique Git | commit `a674a92` (`AUDIT.md`) | Conformité | Moyen | P1 | Ne pas publier le dépôt ; nouveau dépôt pour la v2 | Faible | Élevée |
| P-037 | Scripts de test écrivant dans la base réelle | `scripts/verify-*.mjs` | Exploitation, données | Moyen | P1 | Base de test dédiée | Faible | Élevée |

## 3. Dettes techniques

| ID | Description | Preuve | Impact principal | Prio | Recommandation | Effort |
|---|---|---|---|---|---|---|
| P-040 | Types de base écrits à la main | `types/database.types.ts` | M (dérive) | P2 | Génération automatique | Faible |
| P-041 | Schéma en double (`schema.sql` + migrations), dérives entre bases | `supabase/` ; `04` § 5 | T, M | P1 | Outil de migration unique | Moyen |
| P-042 | Code mort et fonctionnalités annoncées absentes | `07` § H.2 | M | P3 | Nettoyer | Faible |
| P-043 | Autorisation dispersée sur 4 couches | `07` § H.2 | S, M (cause racine de P-020/21) | P0 (v2) | Couche unique | Élevé (v1) |
| P-044 | Accès données et logique métier dans les pages ; requêtes redondantes | `07` § H.2 | M, perf | P1 (v2) | Services + API | Élevé |
| P-045 | Duplication de composants et libellés | `07` § H.2 | M | P3 | Mutualiser | Faible |
| P-046 | Documentation obsolète | README | M | P2 | Mettre à jour | Faible |
| P-047 | Pas de CI, pas de tests d'intégration RLS automatisés | absence de pipeline | Qualité | P1 | CI + base de test | Moyen |

## 4. Limitations fonctionnelles

| ID | Limitation | Preuve | Décision requise ? |
|---|---|---|---|
| P-050 | Pas de gestion des membres (retrait, changement de classe), ni d'édition de classe/matière, ni de suppression de matière | absence de policies UPDATE `classes`, d'actions | Oui |
| P-051 | Pas d'édition de profil, de suppression de compte, d'export de données | absence | Oui (conformité) |
| P-052 | Pas de recherche, tri ni filtre sur les listes (hors notifications et assistant) | pages | Oui |
| P-053 | Aucun stockage de fichiers : dépendance aux liens Google Drive publics | choix README | Oui |
| P-054 | Purge définitive des tâches à J+1 : perte des complétions, rappels, journaux d'emails, historique statistique | `cleanup/route.ts:30-34` ; cascades | **Oui (règle métier)** |
| P-055 | Un utilisateur = une classe ; pas de multi-classes pour délégués/admins | `profiles.class_id` | Oui |
| P-056 | Aucun email ni écran explicite en cas de refus ; `/pending` sans information | `notifications.ts:109` ; `pending/page.tsx` | Oui |
| P-057 | Annonces non épinglées réellement ; pas d'édition de message | `ChatRoom.tsx` ; RLS sans UPDATE | Oui |
| P-058 | Une seule notification par événement, pas de préférences de notification ni de désinscription des emails | absence | Oui (conformité emails) |

## 5. Problèmes d'exploitation

| ID | Problème | Preuve | Prio | Recommandation |
|---|---|---|---|---|
| P-060 | Migrations manuelles sans suivi des versions appliquées | README § Migrations | P0 (v2) | Outil de migration + CI |
| P-061 | Aucun monitoring ni alerte (crons, emails, erreurs) | absence | P1 | Sentry/Logs + alertes |
| P-062 | Sauvegardes et restauration non démontrées | absence | P0 | Sauvegardes vérifiées + test de restauration |
| P-063 | Cron rappels séquentiel non borné, sans reprise | `reminders/route.ts:48-112` | P1 | File de jobs, lots, reprise |
| P-064 | `NEXT_PUBLIC_APP_URL` vaut localhost en local ; valeur de production inconnue | `.env.local` (non secret) | P1 | Vérifier Vercel |
| P-065 | Pas d'environnement de préproduction ; la machine de développement pointe vers la base réelle | `.env.local`, ancien audit | P1 | Environnements séparés |

## 6. Décisions d'architecture discutables

| ID | Décision | Pourquoi discutable | Alternative |
|---|---|---|---|
| P-070 | Utiliser la clé service role dans le chemin des requêtes utilisateur | Toute omission de contrôle devient une escalade (P-020, P-021) | Backend avec autorisation explicite ; service role réservé aux jobs |
| P-071 | Exposer PostgREST au navigateur et faire de la RLS l'unique barrière | Toute erreur de policy est exploitable directement (P-022, P-023, P-032) | API applicative ; RLS en défense en profondeur |
| P-072 | Realtime `postgres_changes` + `router.refresh()` complet | Rendu serveur complet à chaque événement ; coût par abonné | Événements applicatifs ciblés |
| P-073 | Pseudo-streaming SSE (réponse calculée puis découpée) | Latence perçue = latence totale ; complexité inutile | Vrai streaming ou réponse simple |
| P-074 | Rate limiting d'authentification dans la même table/RPC que l'IA, exposée aux clients | Surface d'abus (P-023) | Rate limiting côté backend |

## 7. Améliorations facultatives

| ID | Amélioration | Preuve |
|---|---|---|
| P-080 | `next/image` ou assets locaux à la place des `<img>` Unsplash hotlinkés | lint (10 avertissements) |
| P-081 | Accessibilité des formulaires (labels reliés) | `RegisterForm.tsx:69-120`, `ResubmitForm.tsx:77-94` |
| P-082 | Double en-tête collant sur mobile | `Sidebar.tsx:214` + `layout.tsx:71` |
| P-083 | Retirer les témoignages fictifs de la landing page ou les signaler | `app/page.tsx` § Témoignages |
| P-084 | Confirmation avant suppression d'une tâche ou d'un message | `tasks/page.tsx:193` ; `ChatRoom.tsx:204-215` |
| P-085 | Cohérence du discours sur l'assistant (aide au code annoncée mais refusée par le garde-fou) | `Sidebar.tsx:166-168` ; `guard.ts` ; prompt règle 8 |
