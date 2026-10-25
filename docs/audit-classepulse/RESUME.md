# Résumé de l'audit ClassePulse

*12/10/2026 — audit en lecture seule du dépôt (commit `4e27b02`). Détails dans les documents 00 à 12 du même dossier.*

## Ce qu'est l'application

Plateforme web de vie de classe pour étudiants (Next.js 14 + Supabase, hébergée sur Vercel).

- **Rôles :** étudiant, délégué (gère sa classe), administrateur. L'inscription doit être validée par un délégué ou un admin.
- **Fonctions :** devoirs avec suivi individuel et rappels J‑3/J‑1 par email ; partage de liens Google Drive (documents, annales, cours enregistrés) ; chat de classe en temps réel avec annonces ; notifications ; assistant IA ; statistiques.
- **Maturité :** prototype avancé (8 commits, un développeur, badge « Bêta »). 46 fonctionnalités sur 58 sont complètes, 8 partielles ou cassées, 4 annoncées mais absentes.

## Points forts

- Sécurité au niveau de la base activée sur toutes les tables, correctifs déjà appliqués et bien documentés.
- Code TypeScript strict, validation des formulaires, 149 tests unitaires qui passent.
- Interface soignée, emails fiables (pas de doublons, journal des envois).

## Problèmes principaux

| Gravité | Problème |
|---|---|
| Critique | Un compte en attente peut contourner la validation d'inscription et accéder à une classe |
| Élevée | Certaines actions envoient des notifications même quand l'opération est refusée (fausses notifications possibles vers n'importe quelle classe) |
| Élevée | Un utilisateur peut changer l'email de son profil (détournement d'emails, blocage d'inscriptions) |
| Élevée | N'importe qui peut verrouiller la connexion d'un autre compte |
| Élevée | Dépendances vulnérables (Next.js : critique) |
| Moyenne | Les liens « Google Drive » ne sont pas vraiment vérifiés (liens malveillants acceptés) |
| Bug | Un utilisateur refusé tombe dans une boucle de redirection et ne peut plus rien faire |
| Bug | Un administrateur sans classe ne peut gérer aucun contenu |
| Bug | Les formulaires n'affichent ni erreur ni confirmation |
| Exploitation | Migrations appliquées à la main sans suivi, sauvegardes non vérifiées, aucun monitoring |

**Cause racine :** les droits sont vérifiés à plusieurs endroits qui ne sont pas d'accord entre eux, et le navigateur accède directement à la base.

## Recommandations

1. **Immédiatement :** corriger les failles ci-dessus sur la version actuelle (corrections courtes), faire et tester une sauvegarde, créer une base de test séparée.
2. **Avant de coder la v2 :** décider du budget d'hébergement, du système d'authentification, et de la conservation des devoirs (aujourd'hui supprimés 24 h après l'échéance).
3. **Pour la v2 :** une application unique bien découpée — React + NestJS + PostgreSQL — avec un seul endroit qui contrôle les droits, des tâches planifiées gérées en base (plus de crons Vercel), CI, sauvegardes et monitoring dès le départ. Pas de microservices ni de Kubernetes : inutiles à cette échelle.

## Ordre de reconstruction

Sécuriser la v1 → définir le périmètre → choix techniques → fondations (dépôt, CI, environnements) → base de données → authentification et droits → modules métier → interface → emails, rappels, temps réel → tests de sécurité → déploiement et sauvegardes → migration des données → mise en production.
