# 12 — Expérience utilisateur et interface (Rapport K)

> **Limite** : l'application n'a pas été lancée (elle nécessite la base réelle). L'analyse repose sur le code des pages et composants. Les rendus visuels exacts, les contrastes mesurés et le comportement mobile réel sont **À vérifier** sur un environnement de test.

## 1. Structure de navigation

- **Public** : landing (`/`) → connexion / inscription ; mot de passe oublié depuis la connexion.
- **Authentifié** : barre latérale (desktop) / tiroir (mobile) avec trois groupes : *Menu principal* (Accueil, Tâches & Devoirs, Documents, Hints & Sujets, Cours enregistrés), *Communauté* (Chat de classe, Notifications, + Statistiques pour DELEGATE/ADMIN), *Administration* (ADMIN). En-tête : avatar à initiales (lien accueil), nom et rôle, bouton recherche (inactif), thème, cloche. Bouton flottant « Assistant IA » sur toutes les pages du dashboard.
- **« Accueil »** redirige selon le rôle : ADMIN → Administration, DELEGATE → espace délégué, STUDENT → accueil étudiant. Conséquence : un délégué n'a **pas** de vue « étudiant » (ses tâches à venir) sur son accueil, et l'ADMIN n'a pas d'accueil distinct de l'administration.
- Pas de fil d'Ariane ; pages plates ; formulaires dépliables (`<details>`) en haut des listes.

## 2. Cohérence visuelle

Points positifs : système de design maison inspiré de shadcn/ui (`components/ui/*`), variables CSS de thème clair/sombre, polices Inter + Space Grotesk, icônes Lucide, cartes et badges homogènes, états vides illustrés, 12 squelettes de chargement.

Incohérences constatées :
- La page `admin/emails` utilise un style plus brut (tableaux et cartes non basés sur `Card`) que le reste.
- Libellés d'énumérations bruts affichés : types de hint (`DEVOIR`, `EXAMEN`…, `hints/page.tsx:82-84, 117`) et types de tâche dans le formulaire d'édition (`tasks/page.tsx:179-183`) alors que la création affiche des libellés français.
- Trois `StatCard` différents (admin, délégué, stats).
- Libellé « Tâches actives » sur l'admin et le délégué alors que le compteur inclut les tâches expirées.

## 3. Responsive

Grilles `sm/md/lg`, tiroir mobile avec `role="dialog"` et blocage du scroll, tables avec défilement horizontal (`min-w-[720px]` sur les emails). Défaut : **deux en-têtes collants empilés sur mobile** (en-tête du tiroir `z-40` + en-tête du dashboard `z-30` — P-082). Chat en hauteur fixe `72vh` (à valider avec le clavier mobile ouvert).

## 4. Accessibilité

| Positif | Négatif |
|---|---|
| `aria-label` sur les boutons icônes ; `aria-current` dans la navigation ; `role="alert"` sur les erreurs ; modale de suppression conforme (focus piégé, Échap, restitution du focus) ; tiroir `aria-modal` | Labels non reliés aux champs dans `RegisterForm` et `ResubmitForm` (P-081) ; les cartes de notification sont cliquables (`Card onClick`) sans rôle bouton ni gestion clavier (`NotificationsCenter.tsx:197-199`) ; le bouton de suppression de message est en `opacity-0` et n'apparaît qu'au survol (`ChatRoom.tsx:257, 281`) : invisible sur écran tactile et au clavier ; aucune annonce `aria-live` pour les nouveaux messages de chat ; contrastes « muted » à mesurer |

## 5. Formulaires et retours après action

| Constat | Écrans | Réf. |
|---|---|---|
| **Aucun retour** de succès ou d'erreur après la plupart des formulaires serveur | Tâches, documents, hints, cours, classes, matières, décisions d'inscription, délégués | P-003 |
| Erreur de validation silencieuse (ex. URL non-Drive malgré le placeholder « OneDrive, GitHub ») | Tâches | P-013 |
| Les formulaires de connexion, inscription, resoumission, reset, email de test affichent correctement les erreurs | Auth, admin emails | — |
| Échecs de cochage de tâche et d'envoi de message : retour silencieux (rollback visuel seulement pour le chat) | `TaskCard`, `ChatRoom` | — |
| Suppression d'une tâche ou d'un message **sans confirmation** ; suppression de document/hint/cours/classe **avec** confirmation | Tâches, chat | P-084 |
| Suppression d'une classe non vide : la modale se ferme comme un succès | Admin | P-004 |

## 6. États de chargement, vides, erreurs

- Chargement : squelettes de page (`loading.tsx`), boutons avec indicateur, chat optimiste.
- Vides : présents et illustrés sur toutes les listes.
- Erreurs de lecture : **non gérées** — une panne de base s'affiche comme une liste vide (« Tout est à jour »), ce qui est trompeur.
- Aucune page d'erreur personnalisée (`error.tsx`, `not-found.tsx` absents — Next.js utilise ses pages par défaut).

## 7. Parcours problématiques

| Parcours | Problème | Réf. |
|---|---|---|
| Utilisateur refusé | Boucle de redirection, aucun moyen de corriger sa demande | P-001 |
| Utilisateur en attente | Aucune information (classe demandée, date), pas de déconnexion, promesse d'email ambiguë | P-005, P-056 |
| Administrateur | Ne peut ni publier ni consulter les contenus d'une classe ; doit passer par le SQL ou être rattaché à une classe | P-002 |
| Délégué | Ne peut pas créer de matière (réservé ADMIN) : sans matière, impossible de créer une tâche ; dépendance forte à l'ADMIN | R-07 |
| Suppression d'une classe | Impossible tant qu'elle a des membres, et aucun moyen de retirer un membre | P-050 |
| Assistant | Discours contradictoire (aide au code promise, refusée par le garde-fou) ; pseudo-streaming | P-085, P-073 |

## 8. Performances perçues

- 3 appels d'authentification et 5+ requêtes à chaque navigation (middleware + layout + page) ; `router.refresh()` à chaque retour de focus (cloche) et à chaque événement Realtime sur les listes — rerender serveur complet de la page.
- Images Unsplash chargées en `<img>` (pas d'optimisation `next/image`), images de bannière en `loading="eager"`.
- Assistant : la réponse n'apparaît qu'après le calcul complet (jusqu'à 4 appels LLM), puis est « tapée » artificiellement.

## 9. Contenus

- Témoignages de la landing page fictifs et présentés comme réels (P-083).
- Textes majoritairement en français ; citations « inspirantes » en anglais (`lib/constants/quotes.ts`).
- Emojis dans les titres de notifications et emails (cohérent mais à valider pour le ton institutionnel).

## 10. Améliorations recommandées (sans nouvelle fonctionnalité)

1. Retour systématique après chaque action (toast succès/erreur) et messages d'erreur métier lisibles.
2. Corriger les parcours d'attente/refus (P-001, P-005, P-056).
3. Sélecteur de classe pour l'ADMIN (P-002).
4. Confirmation homogène des suppressions ; vérification des lignes réellement supprimées.
5. Libellés français pour toutes les énumérations ; un seul module de dates et d'urgence (P-008).
6. Accessibilité : labels, cartes cliquables accessibles au clavier, `aria-live` pour le chat et les notifications.
7. Gestion d'erreur de lecture distincte de l'état vide ; pages `error.tsx`/`not-found.tsx`.
8. Un seul en-tête collant sur mobile.
