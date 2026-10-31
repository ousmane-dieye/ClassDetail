# Identité visuelle de ClassPulse — Audit complet

> **Nature du document** : audit purement descriptif de l'identité visuelle **existante**
> du projet ClassPulse, suivi de recommandations pour un futur logo.
> Aucun fichier du projet n'a été modifié pour produire ce rapport.
>
> **Date de l'audit** : 31 octobre 2026
> **Périmètre** : `app/`, `components/`, `lib/`, `tailwind.config.ts` (le dépôt ne contient aucun dossier `public/`)

---

## 0. Synthèse en un paragraphe

ClassPulse possède un design system cohérent et délibéré, nommé dans le code
« **papier & encre** » : un fond crème chaleureux (`#F9F8F5`), une encre brun-noir
profonde (`#221B16`) et une **unique couleur de marque terracotta** (`#D53F15` en clair,
`#F56B3D` en sombre). L'ambiance est **éditoriale, chaleureuse et technique** — un
croisement entre une revue imprimée soignée et un outil de travail moderne — et non
le bleu-violet « SaaS » habituel des plateformes éducatives. Il n'existe **aucun
fichier de logo, favicon ou manifeste PWA** dans le dépôt : la marque est
aujourd'hui représentée par l'icône générique `GraduationCap` de Lucide posée dans
une tuile arrondie terracotta. Toute création de logo devra s'ancrer sur la
terracotta + encre + papier, adopter un dessin **simple, anguleux-arrondi, et lisible
à 16 px**, et éviter les symboles déjà employés ailleurs dans l'interface.

---

## 1. Palette de couleurs

### 1.1 Source de vérité

Toute la couleur du projet est pilotée par **des variables CSS en HSL** déclarées dans
`app/globals.css` (bloc `:root` pour le thème clair, bloc `.dark` pour le thème sombre),
puis exposées à Tailwind via `tailwind.config.ts` (`hsl(var(--token))`). C'est le
seul fichier CSS du projet. **Aucune couleur HEX n'est codée en dur dans les
composants `.tsx`** (vérifié par recherche sur l'ensemble de `app/` et `components/`),
à trois exceptions listées en §1.4.

### 1.2 Tokens de marque — thème clair (`:root`)

Source : `app/globals.css` lignes 14–62.

| Token CSS | Rôle | HSL | HEX | RGB | Où c'est utilisé |
|---|---|---|---|---|---|
| `--background` | Arrière-plan principal « papier chaud » | `36 28% 97%` | `#F9F8F5` | `rgb(249,248,245)` | `<body>`, pages, inputs (`bg-background`), fond des sections |
| `--foreground` | Texte principal « encre profonde » | `24 22% 11%` | `#221B16` | `rgb(34,27,22)` | Texte de tout le site, overlay sombre des photos d'auth (`from-foreground/85`), tooltips sidebar |
| `--card` | Surface des cartes / popovers | `0 0% 100%` | `#FFFFFF` | `rgb(255,255,255)` | `Card`, `Badge` outline, popovers, boutons secondary-hover |
| `--card-foreground` | Texte sur carte | `24 22% 11%` | `#221B16` | `rgb(34,27,22)` | Texte dans les cartes |
| `--popover` / `--popover-foreground` | Surfaces surélevées | `0 0% 100%` | `#FFFFFF` | `rgb(255,255,255)` | Menus, popovers |
| `--primary` | **Couleur principale — terracotta** | `13 82% 46%` | `#D53F15` | `rgb(213,63,21)` | Boutons primaires, liens, icônes actives, indicateur actif de la sidebar, tuile-logo, badges actifs, `ring` de focus, wordmark « Partager. » de la landing |
| `--primary-foreground` | Texte sur terracotta | `0 0% 100%` | `#FFFFFF` | `rgb(255,255,255)` | Icônes/texte des tuiles `bg-primary`, libellés des boutons primaires |
| `--secondary` | Surface secondaire « sable » | `34 26% 91%` | `#EEE9E2` | `rgb(238,233,226)` | Boutons `secondary`, fond du `ThemeToggle` |
| `--secondary-foreground` | Texte sur sable | `26 20% 18%` | `#372D25` | `rgb(55,45,37)` | Texte des boutons secondary, badges `secondary` |
| `--muted` | Surface en retrait | `32 20% 93%` | `#F1EDEA` | `rgb(241,237,234)` | Hover `ghost`, skeletons, `code inline`, pastilles d'icônes neutres |
| `--muted-foreground` | **Texte secondaire** | `26 8% 42%` | `#746A63` | `rgb(116,106,99)` | Descriptions, sous-titres, libellés d'helpers, footer, placeholders |
| `--accent` | Teinte neutre chaude d'appoint | `30 18% 92%` | `#EEEBE7` | `rgb(238,235,231)` | Éléments d'accentuation neutres |
| `--accent-foreground` | Texte sur accent | `26 22% 14%` | `#2C231C` | `rgb(44,35,28)` | — |
| `--destructive` | Rouge « destruction » (peu utilisé) | `1 72% 48%` | `#D32522` | `rgb(211,37,34)` | Variante `destructive` du design system |
| `--danger` | **Danger opérationnel** (le vrai rouge du site) | `357 72% 50%` | `#DB242D` | `rgb(219,36,45)` | Boutons `danger`, badges de compteur (notifications non lues), déconnexion hover, pastille `badge-pulse`, item Administration |
| `--success` | Succès / validation | `156 48% 34%` | `#2D805F` | `rgb(45,128,59)` | Boutons `success`, badges `success`, statut « validé », anneau de progression du dashboard étudiant (`app/dashboard/student/page.tsx`), `shadow-glow-success` |
| `--warning` | Avertissement | `38 92% 46%` | `#E19209` | `rgb(225,146,9)` | Badges `warning` (rôle « Délégué »), boutons `warning` |
| `--info` | Information | `200 80% 42%` | `#1588C1` | `rgb(21,136,193)` | Toasts `info`, badges `info`, icône info du profil |
| `--border` | **Bordures / filets** | `30 12% 87%` | `#E2DEDA` | `rgb(226,222,218)` | Bordures de cartes, séparateurs, `.hairline`, `border-*` partout |
| `--input` | Bordures de champs | `30 14% 84%` | `#DCD6D0` | `rgb(220,214,208)` | `Input`, `Select`, `Textarea` |
| `--ring` | Anneau de focus | `13 82% 46%` | `#D53F15` | `rgb(213,63,21)` | `:focus-visible`, `focus-visible:ring-*` (= primary) |
| `--code-bg` | Fond des blocs de code | `32 26% 95%` | `#F6F2EF` | `rgb(246,242,239)` | `.code-block`, `.md-content pre` |
| `--code-border` | Bordure des blocs de code | `30 14% 88%` | `#E5E0DC` | `rgb(229,224,220)` | `.code-block`, `.md-content pre` |

### 1.3 Tokens de marque — thème sombre (`.dark`)

Source : `app/globals.css` lignes 64–109.

| Token CSS | Rôle | HSL | HEX | RGB |
|---|---|---|---|---|
| `--background` | Fond « charbon chaud, jamais noir pur » | `26 14% 9%` | `#1A1714` | `rgb(26,23,20)` |
| `--foreground` | Texte principal | `30 20% 93%` | `#F1EDEA` | `rgb(241,237,234)` |
| `--card` | Cartes | `26 12% 12%` | `#221E1B` | `rgb(34,30,27)` |
| `--primary` | **Terracotta éclairci** | `15 90% 60%` | `#F56B3D` | `rgb(245,107,61)` |
| `--primary-foreground` | **Encre chaude** (et non blanc !) | `24 40% 9%` | `#20150E` | `rgb(32,21,14)` |
| `--secondary` | Sable devenu sombre | `26 12% 17%` | `#312B26` | `rgb(49,43,38)` |
| `--secondary-foreground` | Texte sur secondary sombre | `30 18% 92%` | `#EEEBE7` | `rgb(238,235,231)` |
| `--muted` | Surface retrait | `26 10% 16%` | `#2D2825` | `rgb(45,40,37)` |
| `--muted-foreground` | Texte secondaire | `28 8% 62%` | `#A69E96` | `rgb(166,158,150)` |
| `--accent` | Accent neutre | `26 12% 18%` | `#332D28` | `rgb(51,45,40)` |
| `--accent-foreground` | Texte sur accent | `30 18% 92%` | `#EEEBE7` | `rgb(238,235,231)` |
| `--destructive` | Rouge | `356 80% 62%` | `#EC515B` | `rgb(236,81,91)` |
| `--danger` | Danger | `356 76% 60%` | `#E74B56` | `rgb(231,75,86)` |
| `--success` | Succès (plus vif) | `152 60% 48%` | `#31C47F` | `rgb(49,196,127)` |
| `--warning` | Avertissement | `40 90% 52%` | `#F3A916` | `rgb(243,169,22)` |
| `--info` | Information | `201 85% 60%` | `#42B3F0` | `rgb(66,179,240)` |
| `--border` | Bordures | `26 10% 21%` | `#3B3530` | `rgb(59,53,48)` |
| `--input` | Bordures de champs | `26 10% 23%` | `#413A35` | `rgb(65,58,53)` |
| `--ring` | Focus | `15 90% 60%` | `#F56B3D` | `rgb(245,107,61)` |
| `--code-bg` | Blocs de code | `26 12% 15%` | `#2B2622` | `rgb(43,38,34)` |
| `--code-border` | Bordure de code | `26 10% 22%` | `#3E3732` | `rgb(62,55,50)` |

### 1.4 Couleurs hors tokens (à connaître)

Ces couleurs existent réellement dans l'interface mais **ne font pas partie du
design system** — elles sont codées en dur dans des composants :

| Couleur | HEX (Tailwind) | Emplacement exact | Rôle |
|---|---|---|---|
| `white` | `#FFFFFF` | `components/ui/Button.tsx` (variants `danger`, `success`), `components/ui/Switch.tsx` (pastille), badges de compteur `components/NotificationBell.tsx`, `components/mobile/MobileBottomNav.tsx` | Texte sur fonds saturés, pastille de switch |
| `black/50` | `rgb(0,0,0,0.5)` + `backdrop-blur-sm` | Tous les overlays de modales/drawers : `components/ConfirmDeleteButton.tsx`, `AssistantPanel.tsx`, `MobileBottomNav.tsx`, `SessionFormDialog.tsx`, `EvaluationFormDialog.tsx`, `MyClassSection.tsx`, etc. | Voile sombre des surcouches |
| `emerald-500` | `#10B981` | `components/ui/ToastContainer.tsx` (succès), `components/settings/AccountSection.tsx`, `components/admin/StudentsManagementSection.tsx` | Succès **hors token** — diverge du `--success` `#2D805F` |
| `amber-500` | `#F59E0B` | `components/settings/AccountSection.tsx`, `components/admin/StudentsManagementSection.tsx` | États d'attente — diverge du `--warning` `#E19209` |
| `orange-500` | `#F97316` | `components/settings/AccountSection.tsx` (pastille de statut) | Statut intermédiaire — aucune variable officielle |
| `red-500/400/300/200/950` | palette rouge Tailwind | `app/dashboard/admin/page.tsx` (panneau d'erreurs techniques) | Diagnostics d'erreur admin |
| `slate-950 → 100` | palette ardoise | `components/assistant/Markdown.tsx` (blocs de code de l'assistant IA, thème « éditeur sombre » imposé) | Blocs de code de l'assistant, toujours sombres même en thème clair |
| `#666666` / `#CCCCCC` | — | Chevron inline SVG dans `components/ui/Select.tsx` (fond clair / fond sombre) | Flèche des listes déroulantes |

> **Point d'attention pour le futur logo** : le vert de succès « réel » perçu par
> l'utilisateur est souvent l'émeraude `#10B981` des toasts, pas le vert profond
> `#2D805F` du token. La terracotta, elle, est **toujours** le token `--primary` :
> c'est la seule couleur strictement constante du projet.

### 1.5 Ombres et lueurs (aussi codées en couleurs)

Source : `tailwind.config.ts` lignes 77–85. Toutes les ombres partagent une teinte
**brun-encre chaude** `rgba(24,18,12,α)` — jamais du noir pur :

- `shadow-subtle` : `rgba(24,18,12,0.04/0.03)` — ombre de repos, la plus utilisée (56 occurrences).
- `shadow-card` : `rgba(24,18,12,0.05)` + filet `rgba(24,18,12,0.02)`.
- `shadow-lift` : `rgba(24,18,12,0.10/0.06)` — survol de carte.
- `shadow-float` : `rgba(24,18,12,0.16/0.08)` — modales, bottom sheets.
- `shadow-glow` : lueur **terracotta** `hsl(13,82%,46%,0.16/0.28)`.
- `shadow-glow-success` : lueur verte `hsl(156,48%,34%,…)`.
- `shadow-inner-sm` : `rgba(24,18,12,0.06)` — creusé des inputs.

### 1.6 Dégradés réellement présents

Il n'existe **qu'une seule famille de dégradés**, très discrète :

1. **Voile photo des pages d'authentification** (`app/(auth)/login/page.tsx` l.20 et équivalents register/forgot/reset/recovery) :
   `bg-gradient-to-br from-foreground/85 via-foreground/55 to-foreground/25` — un voile d'encre translucide au-dessus d'une photo Unsplash, jamais un dégradé de couleur.
2. **`.brand-card`** (`app/globals.css` l.248–253) : `radial-gradient(120% 140% at 100% 0%, primary/12, transparent 55%)` + `linear-gradient(160deg, card, muted/60)` — halo terracotta en haut à droite sur fond crème. Utilisé pour la carte « Assistant IA » de la sidebar et le bloc CTA de la landing.
3. **Skeleton `.skeleton`** : dégradé shimmer `muted → muted/55 → muted` animé.

Aucun dégradé bleu-violet, arc-en-ciel ou multicolore n'existe dans le projet.

---

## 2. Thèmes clair et sombre

Le basculement est géré par la classe `.dark` sur `<html>`
(`components/ui/ThemeToggle.tsx`, persistance `localStorage["classpulse-theme"]`,
3 états : Clair / Sombre / Système). `darkMode: "class"` dans `tailwind.config.ts`.

### 2.1 Tableau comparatif

| Élément | Thème clair | Thème sombre |
|---|---|---|
| Arrière-plan principal | `#F9F8F5` (papier chaud) | `#1A1714` (charbon chaud) |
| Surface / cartes | `#FFFFFF` | `#221E1B` |
| Texte principal | `#221B16` | `#F1EDEA` |
| Texte secondaire | `#746A63` | `#A69E96` |
| Couleur principale (primary) | `#D53F15` | `#F56B3D` |
| Texte sur primary | `#FFFFFF` | `#20150E` (encre chaude) |
| Accentuation (accent) | `#EEEBE7` | `#332D28` |
| Secondaire (secondary) | `#EEE9E2` | `#312B26` |
| Bordures | `#E2DEDA` | `#3B3530` |
| Bordures de champs (input) | `#DCD6D0` | `#413A35` |
| Focus (ring) | `#D53F15` | `#F56B3D` |
| Succès | `#2D805F` | `#31C47F` |
| Danger | `#DB242D` | `#E74B56` |
| Avertissement | `#E19209` | `#F3A916` |
| Information | `#1588C1` | `#42B3F0` |
| Blocs de code | `#F6F2EF` / bordure `#E5E0DC` | `#2B2622` / bordure `#3E3732` |

### 2.2 Différences de comportement entre les deux thèmes

1. **Inversion du contraste du texte sur terracotta** : en clair, icône/texte blanc
   sur terracotta (`#FFFFFF` sur `#D53F15` ≈ 4,61:1). En sombre, la terracotta
   s'éclaircit (`#F56B3D`) et le texte devient **encre chaude** `#20150E`
   (≈ 6,00:1) — car du blanc sur `#F56B3D` ne donnerait que 2,98:1. C'est la règle
   de contraste la plus importante du projet pour dessiner un logo.
2. **Aucun gris pur** : les deux thèmes restent saturés en orange (teintes 24–36°).
   Le sombre est du brun-charbon, jamais du noir `#000` (commentaire explicite en
   `app/globals.css` l.66 : « charbon chaud, jamais noir pur »).
3. **Les ombres ne changent pas** : les tokens d'ombre `rgba(24,18,12,α)` sont les
   mêmes dans les deux thèmes ; en sombre elles deviennent quasi invisibles et la
   profondeur repose sur les bordures `#3B3530`.
4. **Inversion des indicateurs natifs** : le sélecteur de date/heure reçoit un
   `filter: invert(1)` en sombre (`app/globals.css` l.170–177), et le chevron du
   `Select` change de SVG (`#666` → `#CCC`).
5. **`color-scheme`** déclaré (`light` / `dark`) pour les barres de défilement et
   contrôles natifs.
6. **Constantes entre les deux thèmes** : photos, voiles `black/50` des modales,
   blocs de code de l'assistant (slate, toujours sombres), et couleurs Tailwind
   codées en dur (émeraude, ambre, rouge admin) — ces dernières **ne s'adaptent
   que partiellement** (classes `dark:` ponctuelles).

---

## 3. Typographie

Source : `app/layout.tsx` (import des polices), `tailwind.config.ts` l.63–67
(familles), `app/globals.css` l.179–194 et 287–345 (règles de base et markdown).

### 3.1 Familles

| Rôle | Police | Fallbacks | Origine |
|---|---|---|---|
| Sans (texte courant, `font-sans`) | **Inter** | `system-ui, sans-serif` | **Google Fonts**, importée via `next/font/google` dans `app/layout.tsx` (variable CSS `--font-sans`, `subsets: ["latin"]`, `display: swap`, `preload: true`). `next/font` auto-héberge les fichiers au build : aucune requête tierce en production. |
| Display (titres, `font-display`) | **Space Grotesk** | `var(--font-sans), sans-serif` | **Google Fonts**, via `next/font/google` (variable `--font-display`, `display: swap`) |
| Mono (code, `font-mono`) | **Cascadia Code**, puis **Fira Code** | `ui-monospace, monospace` | **Polices locales/systèmes** — déclarées en style inline sur `<html>` dans `app/layout.tsx` (variable `--font-mono`). Aucun import réseau. |

### 3.2 Graisses utilisées (relevé sur `app/` + `components/`)

| Graisse | Classe | Fréquence | Usage |
|---|---|---|---|
| Bold (700) | `font-bold` | ~208 | Titres `h1–h6`, `CardTitle`, titres de sections, wordmark « ClassPulse », sous-titres de cartes |
| Semibold (600) | `font-semibold` | ~172 | Boutons, badges, liens de nav, labels de formulaire, `.md-content a` |
| Medium (500) | `font-medium` | ~57 | Items de navigation, texte des listes de features, helpers |
| Extrabold (800) | `font-extrabold` | ~9 | Initiales des avatars terracotta, badges de rôle |
| Regular (400) | `font-normal` | ~2 | Texte courant explicite (la norme est la feuille de base Inter 400) |

Inter tourne avec les variantes stylistiques `cv02, cv03, cv04, cv11`
(caractéristiques « straight l », « a singulière », etc. — finitions typographiques
activées dans `body`, `app/globals.css` l.183).

### 3.3 Échelle typographique relevée

| Taille | Valeur | Fréquence | Exemples |
|---|---|---|---|
| `text-6xl` | 3.75rem / 60px | 1 | H1 landing (breakpoint `lg`) |
| `text-5xl` | 3rem / 48px | 1 | H1 landing (`sm`) |
| `text-4xl` | 2.25rem / 36px | 5 | H1 landing (mobile), H2 de sections |
| `text-3xl` | 1.875rem / 30px | 15 | H2 de sections (`sm`), titres de pages |
| `text-2xl` | 1.5rem / 24px | 25 | Citations, titres de dialogues |
| `text-xl` | 1.25rem / 20px | 13 | Titres de modules |
| `text-lg` | 1.125rem / 18px | 24 | `CardTitle`, wordmark sidebar/landing |
| `text-base` | 1rem / 16px | 30 | Paragraphes d'accroche, boutons `lg` |
| `text-sm` | 0.875rem / 14px | 176 | **Corps de texte par défaut**, boutons, descriptions |
| `text-xs` | 0.75rem / 12px | 261 | **Taille la plus fréquente** : badges, helpers, labels, surtitres (`uppercase tracking-[0.18em]`) |
| hors échelle | 0.9375rem / 15px, line-height 1.75 | — | Corps des contenus markdown (`.md-content`) |

### 3.4 Styles de titres et de textes courants

- **Titres (`h1–h6`)** : `font-family: var(--font-display)` (Space Grotesk),
  `letter-spacing: -0.025em`, `text-wrap: balance` (réglage global,
  `app/globals.css` l.190–194). En pratique : `font-display font-bold tracking-tight`.
- **Surtitres de section** (landing) : `text-xs font-bold uppercase tracking-[0.18em] text-primary`.
- **Labels de groupe de navigation** (sidebar) : `text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60`.
- **Texte courant** : `text-sm` (parfois `text-base`), souvent `leading-relaxed`
  ou `leading-relaxed text-muted-foreground` pour les descriptions.
- **Contenu long / cours** (`.md-content`) : 15 px, interligne 1.75, titres internes
  en Space Grotesk Bold avec `letter-spacing: -0.02em`, liens terracotta soulignés
  (`text-decoration-color: primary/35`, `text-underline-offset: 3px`), citations
  avec filet terracotta `3px` et italique.

---

## 4. Style graphique et composants

### 4.1 Ambiance générale (constatée)

L'en-tête de `app/globals.css` (l.5–11) nomme la direction artistique :
« **éditorial · chaleureux · technique · mémorable** », palette « papier & encre ».
Le site est **minimaliste-éditorial** : beaucoup de blanc crème, des filets fins
(`1px`) plutôt que des blocs colorés, une couleur unique d'accent, des ombres très
douces, aucune illustration vectorielle décorative (les photos Unsplash sont la
seule imagerie). Le ton se rapproche d'une **revue imprimée de qualité** ou d'un
carnet de travail bien typographié, avec une rigueur d'outil technique (blocs de
code, densité d'information). Ce n'est ni « corporate-institutionnel » (bleu
université) ni « startup néon » : c'est chaud, personnel, artisanal-soigné.

### 4.2 Boutons (`components/ui/Button.tsx`)

- Forme : `rounded-xl` (16 px), hauteurs `h-8` (sm) / `h-10` (défaut) / `h-12` (lg).
- Typo : `text-sm font-semibold` (`text-xs` en sm).
- Variante primaire : `bg-primary text-primary-foreground shadow-subtle`,
  hover `bg-primary/90` + `shadow-lift`, `active:scale-[0.98]`.
- Secondaire : sable `bg-secondary` ; outline : `bg-card` + bordure, hover
  `border-primary/30` ; ghost : hover `bg-muted` ; danger/success/warning saturés.
- Focus : `ring-2 ring-ring ring-offset-2 ring-offset-background` + focus global
  `outline: 2px solid ring` avec `outline-offset: 2px` et `border-radius: 6px`.
- Transitions : `transition-all duration-150`.

### 4.3 Cartes (`components/ui/Card.tsx`)

- `rounded-2xl` (18 px) + `border border-border` + `bg-card` + `shadow-card`.
- Effet de survol activé par défaut (`hoverEffect`) : `hover:border-primary/25` +
  `hover:shadow-lift`, `transition-all duration-200` — le filet prend une teinte
  terracotta à 25 %.
- Variante « carte de marque » `.brand-card` : halo terracotta radial en haut-droite.

### 4.4 Champs de formulaire (`components/ui/Input.tsx`, `Select.tsx`, `Textarea.tsx`)

- `h-10 rounded-xl`, `border-input`, **fond `bg-background`** (creusé, pas de surface
  blanche) + `shadow-inner-sm`.
- Focus : `border-primary/60` + `ring-2 ring-ring/40` (bien plus doux qu'un anneau plein).
- Placeholder : `text-muted-foreground/70`.

### 4.5 Barres de navigation

- **Landing** (`app/page.tsx`) : header collant `bg-background/85 backdrop-blur-md`,
  `border-b border-border/70`, liens `text-sm font-medium text-muted-foreground`
  → hover `text-foreground` ; boutons `rounded-xl`.
- **Dashboard** (`app/dashboard/layout.tsx`) : header collant identique, avatar
  initiales en tuile `h-10 w-10 rounded-xl bg-primary` + `font-extrabold`, badge de
  rôle en `rounded-full` teinté selon le rôle (danger/warning/primary).
- **Mobile** (`components/mobile/MobileBottomNav.tsx`) : barre fixe basse `h-16`,
  5 emplacements, `bg-background/95 backdrop-blur-md`, `border-t border-border/70`,
  état actif = `text-primary` + petit trait `h-0.5 w-8 rounded-full bg-primary` en
  haut de la cellule ; icônes Lucide 20 px, labels `text-[10px] font-semibold`.
  Bottom sheet « Plus » : `rounded-t-3xl`, `shadow-float`.

### 4.6 Sidebar (`components/Sidebar.tsx`)

- Largeur `w-64` (étendue) / `w-[68px]` (réduite), fond `bg-card/40` translucide,
  `border-r border-border/70`, transition de largeur 300 ms.
- Items : `rounded-xl px-3 py-2.5 text-sm font-medium` ; actif =
  `bg-primary/8 text-foreground` + **barre verticale `h-5 w-[3px] rounded-r-full bg-primary`**
  à gauche + icône `text-primary` (stroke 2.25 vs 1.75) + chevron `text-primary/50`.
- En mode réduit, tooltips CSS-only sur fond `hsl(var(--foreground))` (encre), radius 8 px.
- Carte « Assistant IA » en pied de sidebar : `.brand-card`.

### 4.7 Icônes

- Bibliothèque unique : **lucide-react** (aucune icône maison, aucun SVG de marque).
- Graisse standard 1.75 ; 2 → 2 ; 2.25 pour les éléments actifs.
- Tailles usuelles : 11–26 px ; l'icône de marque `GraduationCap` oscille entre
  17 et 24 px selon le contexte.

### 4.8 Badges (`components/ui/Badge.tsx`)

- `rounded-full`, `px-2.5 py-0.5`, `text-xs font-semibold`, `border-transparent`.
- Fonds **teintés à 10–12 %** de la couleur sémantique + texte plein de cette
  couleur : `bg-primary/10 text-primary`, `bg-success/10 text-success`,
  `bg-danger/10 text-danger`, `bg-info/10 text-info`, `bg-muted text-muted-foreground`.
- Le compteur de notifications utilise à l'inverse un fond plein
  (`bg-danger text-white`, 10 px extrabold) avec animation `badge-pulse`.

### 4.9 Bordures, séparateurs, rayons

- **Filets** : `1px` partout, souvent atténués (`border-border/70`, `/60`, `/50`) ;
  utilitaires maison `.hairline`, `.hairline-b` (`app/globals.css` l.238–245) ;
  états vides en `border-dashed`.
- **Rayons** (système étendu dans `tailwind.config.ts` l.68–76, base `--radius: 0.875rem` = 14 px) :
  - `rounded-xl` (16 px) : **dominant, ~202 usages** — boutons, tuiles, items de nav, inputs.
  - `rounded-2xl` (18 px) : ~105 — cartes, badges de module, panneaux.
  - `rounded-full` : ~69 — badges, avatars, switches, pastilles.
  - `rounded-lg` (14 px) : ~52 — petits éléments.
  - `rounded-3xl` (24 px) : images hero, bottom sheets, CTA.
- La **tuile de marque** (conteneur actuel du logo) est systématiquement
  `rounded-xl` sur un carré de 32–48 px → ratio de rayon très généreux (vis « squircle »).

### 4.10 Ombres

Ordre d'usage : `shadow-subtle` (repos, ~56) > `shadow-lift` (survol, ~20) >
`shadow-float` (surcouches, ~10) > `shadow-card` (~7) > `shadow-inner-sm` (~6).
Les ombres sont **très basses en opacité** (4 % → 16 %) et **teintées en brun chaud**,
ce qui donne un rendu « papier soulevé » plutôt que « carte flottante ».

### 4.11 Animations et transitions (`tailwind.config.ts` l.96–149, `app/globals.css`)

- Durées courtes : `0.15s`–`0.4s`, courbe signature `cubic-bezier(0.16,1,0.3,1)`
  (décélération franche) pour `rise`, `fade-in-up`, `scale-in`.
- Répertoire : `fade-in` (0.18 s), `rise`, `fade-in-up`, `slide-in-right/left/up`
  (modales et sheets), `scale-in`, `pulse-subtle` (2.2 s), `shimmer` (skeletons, 1.8 s),
  `typing-dot` (indicateur de frappe du chat, 1.2 s), `badge-ping` (halo danger).
- Micro-interactions : `active:scale-[0.98]` sur les boutons et cartes cliquables,
  `group-hover:translate-x-0.5` sur les flèches, hover d'icônes de nav.
- Accessibilité : `@media (prefers-reduced-motion: reduce)` neutralise tout
  (`app/globals.css` l.446–455).
- Sélection de texte teintée terracotta : `::selection { background: primary/18 }`.
- Barre de défilement fine custom : 6 px, pouce `muted-foreground/22`.

---

## 5. Identité visuelle du futur logo — recommandations

> **Statut** : recommandations fondées sur l'audit ci-dessus. Rien n'a été décidé ni dessiné.

### 5.1 État des lieux actuel

Il n'existe **aucun fichier de logo**. La marque est représentée, à ~20 endroits, par
le motif : *icône Lucide `GraduationCap` blanche dans une tuile `rounded-xl`
`bg-primary` terracotta*, suivie du mot « ClassPulse » en Space Grotesk Bold
`tracking-tight`. Emplacements : en-tête et footer de la landing (`app/page.tsx`
l.31, 324, 358), sidebar étendue et réduite (`components/Sidebar.tsx` l.230, 254),
bottom sheet mobile (`MobileBottomNav.tsx` l.155), panneaux d'authentification
(5 pages, icône sur `bg-white/10`), formulaires d'authentification, footer du
dashboard (`app/dashboard/layout.tsx` l.125). Ce motif constitue la **contrainte
de continuité** : le futur logo doit pouvoir remplacer cette tuile sans casser la
grille existante.

### 5.2 Couleurs à privilégier

| Priorité | Couleur | HEX clair | HEX sombre | Justification |
|---|---|---|---|---|
| 1 | **Terracotta (primary)** | `#D53F15` | `#F56B3D` | Unique couleur de marque, utilisée partout ; à conserver comme encre exclusive du logo |
| 2 | **Encre (foreground)** | `#221B16` | `#F1EDEA` | Contrepartie neutre chaude ; garantit 15,99:1 sur papier |
| 3 | **Papier (background)** | `#F9F8F5` | `#1A1714` | Réserve de respiration, idéale en négatif du symbole |
| 4 | Blanc | `#FFFFFF` | — | Symbole en négatif sur terracotta (mode clair uniquement) |
| Optionnel | Vert success | `#2D805F` | `#31C47F` | Accès éventuel à une 2e couleur « progression », déjà sémantique dans le produit |

Contrastes vérifiés (WCAG) : blanc sur `#D53F15` = 4,61:1 ; encre `#221B16` sur
`#F56B3D` = 6,00:1 ; encre sur papier = 15,99:1. **Règle impérative héritée du
design system : sur fond terracotta en thème sombre, le symbole doit passer en encre
sombre `#20150E`, jamais en blanc** (blanc sur `#F56B3D` = 2,98:1, insuffisant).

### 5.3 Couleurs à éviter

- **Bleus et violets** (`blue`, `indigo`, `violet`, `purple`) : aucune occurrence
  dans le projet ; ce sont exactement les couleurs des concurrents EdTech génériques.
- **Les palettes hors tokens déjà présentes en dérive** — ne pas les renforcer dans
  le logo : émeraude `#10B981`, ambre `#F59E0B`, orange `#F97316`, ardoise (slate),
  rouge admin `#EF4444`.
- **Noir pur `#000000`** et **gris purs** : explicitement exclus par la charte
  (« charbon chaud, jamais noir pur »).
- Dégradés multicolores, arc-en-ciel, néon, reflets métalliques : hors tonalité
  « papier & encre ».

### 5.4 Associations de couleurs recommandées

1. **Terracotta + encre** (duo principal) : le symbole terracotta, le wordmark en
   encre — l'exact reflet de la landing actuelle (« Partager. » en `text-primary`
   sur titre encre).
2. **Terracotta + papier** : symbole terracotta sur fond crème, pour fonds doux.
3. **Papier en négatif sur terracotta** : symbole crème/blanc plein sur bloc
   terracotta (repris de la tuile-logo actuelle, thème clair).
4. **Encre chaude en négatif sur terracotta clair** : version thème sombre.
5. Monochrome 100 % encre et monochrome 100 % papier : indispensables pour les
   usages à une seule couleur (voir §6).

### 5.5 Style de logo qui s'intégrerait naturellement

- **Géométrie « squircle »** : le site utilise un rayon généreux et systématique
  (16 px sur tuiles de 32–48 px, `rounded-2xl` pour les cartes). Un symbole dans une
  forme **arrondie-contenable** (coin arrondi sur 22–30 % du côté, cercle ou arrondi maximal)
  se fond immédiatement dans la grille. Une forme à angles vifs ou hexagonale
  détonnerait.
- **Trait modéré** : l'interface utilise des épaisseurs 1.75–2.25 sur les icônes ;
  un logo « line style » d'épaisseur équivalente (ou un mix plein/contre-forme très
  sobre) restera cohérent. Les logos très détaillés ou avec texture risquent de
  vibrer face à la finesse des filets `1px`.
- **Registre** : sobre, chaud, un peu « imprimerie / carnet », jamais cartoon ni
  corporate. La typographie du wordmark existe déjà : **Space Grotesk Bold,
  `tracking-tight` (-2.5 %)** — la conserver est le choix le plus sûr.
- **Niveau de simplicité souhaitable** : un seul geste graphique, lisible à 16 px,
  sans dégradé, sans ombre portée, sans texte intégré dans le symbole (le wordmark
  reste séparable). Test de réussite : le symbole doit rester identifiable en
  aplat monochrome dans un carré de 16 × 16 px.

### 5.6 Formes et symboles pertinents (pistes argumentées, non décidées)

Les quatre notions à rendre visibles — **apprentissage, communauté, progression,
connexion** — se recoupent toutes dans le nom « Pulse ». Pistes cohérentes avec
l'existant :

| Concept | Description | Cohérence avec ClassPulse |
|---|---|---|
| **Onde de pouls / signal** | Ligne de pouls stylisée, épurée à 2–3 battements, éventuellement en train de *monter* | Littéralement le nom du produit ; évoque la vie de la classe en temps réel (chat, notifications, stats) ; geste graphique minimal, parfait en 16 px |
| **Pouls + progression** | La ligne de pouls se transforme en barres/courbe ascendante (statistiques, taux de complétion) | Fait le lien entre « battement » et « avancement » ; le dashboard étudiant possède déjà un anneau de progression `--primary` (`app/dashboard/student/page.tsx` l.137–143) |
| **Nœuds connectés** | 3 points reliés par des lignes courbes, disposés en arc ou en cercle | Communauté et connexion entre étudiants sans cliché de « groupe de personnes » ; rappelle les réseaux (matière « réseaux » au programme) |
| **Battement dans une forme** | Le tracé de pouls inscrit dans un « C » arrondi ou dans la tuile-carrée existante | Monogramme robuste pour favicon ; le C renvoie à Class |
| **Pages / signet + pouls** | Un trait de pouls traversant une forme de page repliée | Apprentissage + rythme, sans chouette ni chapeau d'étudiant |

Symboles à **éviter** — soit déjà utilisés ailleurs dans l'UI, soit cliché :

- **Le chapeau de diplômé (`GraduationCap`)** : c'est le logo provisoire actuel ;
  le remplacer est précisément l'objectif, et le cliché est maximal.
- **L'ampoule (`Lightbulb`)** : déjà réservée au module « Hints & sujets »
  (`Sidebar.tsx` l.41) — conflit sémantique direct.
- **La messagerie (`MessageSquare`), la cloche, la coche** : modules existants.
- **Chouette, pomme, crayon, tableau noir, globe gradué, « E » dans un bouclier »** :
  clichés EdTech / institutionnels, hors tonalité artisanale du site.
- **Cerveau ou éclair « IA »** : l'assistant IA n'est qu'une fonction parmi d'autres.
- **Monogramme « CP » surchargé** ou lettres en dégradé : trop serré pour la
  finesse typographique du site.

### 5.7 Styles qui risqueraient de détonner

- Style **néon / cyberpunk / glitch** (le site est chaud et lisible, jamais criard).
- Style **cartoon / mascotte / 3D ludique** (audience étudiante ≠ tonalité joueuse).
- Style **institutionnel froid** (bouclier, armoiries, bleu université) : à contre-courant
  de l'esprit « papier & encre ».
- Logo **très détaillé ou texturé** (grain, papier gauffré, contour épais) : illisible
  en 20 px et discordant avec la sobriété des composants.
- **Dégradé bicolore dans le symbole** : le projet n'utilise que des dégradés de voile
  monochromes.
- Angles **vifs et droits** sans aucun arrondi : rupture avec le système `rounded-xl` dominant.

---

## 6. Déclinaisons nécessaires

### 6.1 Contraintes par emplacement (constatées dans le code)

| Emplacement | Contrainte issue du code | Déclinaison nécessaire |
|---|---|---|
| **Header landing** (`app/page.tsx` l.30–39) | Tuile `h-9 w-9 rounded-xl` + wordmark `text-lg font-bold tracking-tight`, lien `group-hover:scale-105`, fond `bg-background/85 backdrop-blur-md` | **Version horizontale** (symbole + wordmark) à hauteur ~36 px ; le symbole seul doit tenir dans un carré 36 px à coin ~40 % |
| **Header dashboard** (`app/dashboard/layout.tsx` l.85–115) | Contient les initiales de l'utilisateur en tuile `h-10 w-10 rounded-xl bg-primary`, **pas** le logo | Aucun besoin immédiat ; si ajout futur, même grille 40 px |
| **Sidebar desktop étendue** (`Sidebar.tsx` l.253–269) | Tuile `h-10 w-10 rounded-xl` + « ClassPulse » `text-lg` + sous-titre `text-[11px]` ; largeur totale disponible 256 px − padding | **Version horizontale compacte** ≤ 200 px de large |
| **Sidebar réduite (68 px)** (`Sidebar.tsx` l.229–232) | Tuile `h-10 w-10` centrée, aucun texte ; tooltips au survol | **Symbole autonome** carré 40 px (ou 28 px centré dans la tuile terracotta, comme l'icône actuelle de 20 px) |
| **Navigation mobile** (`MobileBottomNav.tsx`) | Barre `h-16` à 5 cases, icônes 20 px + label 10 px ; **le logo n'y figure pas** sauf dans l'en-tête du bottom sheet (tuile `h-9 w-9`) | **Version compacte** 36 px pour le sheet ; rien d'autre |
| **Panneaux d'authentification** (5 pages `(auth)`) | Logo sur photo : tuile translucide `bg-white/10 ring-1 ring-white/15 backdrop-blur-sm`, icône 19 px, texte blanc ; formulaires : icône seule 22 px au-dessus du titre | **Version monochrome papier/blanc** (une seule couleur, résistante sur photo sombre) |
| **Favicon** (`app/layout.tsx` l.27 : `icons: { icon: "/favicon.ico" }`) | **Le fichier n'existe pas dans le dépôt** (aucun dossier `public/`) — la référence pointe vers une ressource absente | **Favicon 32×32 + 16×16** : symbole seul, sans wordmark, aplat terracotta ou encre |
| **Icône PWA** | Aucun `manifest.webmanifest` ni `icons/` dans le dépôt | **192×192 et 512×512** (maskable recommandé : symbole centré dans un carré terracotta plein avec 20 % de marge de sécurité) |
| **Image de partage social (OpenGraph)** | `openGraph` déclaré dans `app/layout.tsx` l.22–26 **sans image** | **Carte 1200×630** : fond papier `#F9F8F5` (ou encre pour variante sombre), wordmark Space Grotesk, symbole terracotta, tagline « Apprendre. Construire. Partager. » |

### 6.2 Set de déclinaisons recommandé

1. **Version horizontale principale** — symbole + wordmark « ClassPulse » (Space
   Grotesk Bold, tracking resserré) en encre ; version « négatif » papier pour fonds
   terracotta ou photos. Hauteur de référence 32–40 px.
2. **Version compacte** — symbole seul, dans la tuile `rounded-xl` terracotta
   existante (conteneur actuel) ; déclinable en tuile encre et tuile papier bordée.
3. **Symbole autonome vectoriel (SVG)** — indispensable pour sidebar réduite,
   favicon, favicon Apple, icônes PWA ; **doit survivre à 16 px**.
4. **Monochromes** : 100 % terracotta, 100 % encre, 100 % papier (pour estampage,
   filigrane, fonds photo des pages d'auth).
5. **Déclinaison animée éventuelle** (non obligatoire) : micro-animation du tracé de
   pouls (2 battements) — le site possède déjà le vocabulaire d'animation
   (`pulse-subtle`, courbe `cubic-bezier(0.16,1,0.3,1)`) et respecte
   `prefers-reduced-motion`.
6. **Fichiers à produire** (actuellement absents du dépôt) : `public/favicon.ico`,
   `public/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`,
   `public/apple-touch-icon.png`, `public/og-image.png` + déclaration `openGraph.images`.

---

## 7. Fichiers sources et références

| Sujet | Fichier | Références exactes |
|---|---|---|
| Tokens de couleur (clair + sombre), radius, utilitaires, animations maison, `.brand-card`, `.md-content` | `app/globals.css` | `:root` l.14–62 ; `.dark` l.64–109 ; `body` l.179–188 ; titres l.190–194 ; `::selection` l.197–200 ; focus l.203–207 ; scrollbar l.210–224 ; `.surface-inset`/`.hairline`/`.brand-card` l.232–253 ; `.skeleton` l.261–271 ; code l.277–345 ; `badge-pulse` l.351–359 ; tooltips sidebar l.376–428 ; offset nav mobile l.437–441 ; `prefers-reduced-motion` l.446–455 |
| Variables Tailwind (couleurs, polices, rayons, ombres, espacements, keyframes) | `tailwind.config.ts` | `darkMode: "class"` l.4 ; `colors` l.12–62 ; `fontFamily` l.63–67 ; `borderRadius` l.68–76 ; `boxShadow` l.77–85 ; `keyframes`/`animation` l.96–149 |
| Import des polices (Google Fonts), métadonnées de marque, `--font-mono` inline | `app/layout.tsx` | Inter l.5–10 ; Space Grotesk l.12–16 ; `metadata` l.18–28 (title, description, openGraph, `icons: { icon: "/favicon.ico" }`) ; `--font-mono` l.38 |
| Landing : header, hero, sections, CTA `.brand-card`, footer | `app/page.tsx` | Logo header l.30–39 ; hero l.67–126 ; bandeau l.128–144 ; cartes features l.213–228 ; étapes l.287–317 ; CTA l.319–350 ; footer l.352–375 |
| Layout dashboard : header collant, avatar-tuile, footer | `app/dashboard/layout.tsx` | Header l.85–115 ; `roleColor` l.65–70 ; footer l.123–129 |
| Sidebar desktop + marque | `components/Sidebar.tsx` | Items de nav l.35–54 ; `NavItem` l.75–148 (indicateur actif l.111–117) ; logo étendu l.248–286 ; logo réduit l.227–245 ; carte assistant `.brand-card` l.336–350 ; `<aside>` l.431–443 |
| Navigation mobile | `components/mobile/MobileBottomNav.tsx` | Barre fixe l.313–371 ; bottom sheet l.133–274 (logo l.154–157) |
| Composants UI | `components/ui/Button.tsx` (variants l.10–25), `components/ui/Card.tsx` (l.10–16), `components/ui/Badge.tsx` (l.9–22), `components/ui/Input.tsx` (l.12), `components/ui/Select.tsx` (chevron SVG `#666`/`#CCC` l.35), `components/ui/Switch.tsx` (pastille blanche l.42), `components/ui/EmptyState.tsx` (l.18–33), `components/ui/ThemeToggle.tsx` (l.63–88), `components/ui/ToastContainer.tsx` (**émeraude hors token** l.8, 15) |
| Pages d'authentification : voile photo, tuile translucide | `app/(auth)/login/page.tsx` (l.11–65), `app/(auth)/register/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `app/(auth)/recovery-error/page.tsx` | Gradient `from-foreground/85 via-foreground/55 to-foreground/2x` + éléments `bg-white/10 ring-white/15` |
| Couleurs hors système | `components/assistant/Markdown.tsx` (slate, l.103–138), `components/settings/AccountSection.tsx` (émeraude/ambre/orange, l.91–95, 169–174, 221–223, 335–348, 408), `components/admin/StudentsManagementSection.tsx` (l.239–245, 447), `app/dashboard/admin/page.tsx` (rouge, l.144–165) | — |
| Anneau de progression terracotta | `app/dashboard/student/page.tsx` | SVG l.137–143 (`stroke="hsl(var(--primary))"`) |
| Constantes de marque (nom, tagline, citations) | `lib/constants/images.ts` | `SITE` l.84–94 : `name`, `tagline: "Apprendre. Construire. Partager."`, `quotes` ; catalogue photo Unsplash `CS_IMAGES` l.13–78 |
| Bibliothèque d'icônes | `package.json` | `lucide-react ^0.454.0` (l.18) ; `class-variance-authority ^0.7.0` (variants CVA) |

**Absence notable** : le dépôt ne contient **aucun dossier `public/`**, ni favicon,
ni SVG de marque, ni `manifest.webmanifest`, ni image OpenGraph
(vérifié : recherche globale `**/*.{ico,png,svg,webmanifest,jpg}` → aucun résultat,
hors `node_modules`). La référence `icons: { icon: "/favicon.ico" }` dans
`app/layout.tsx` pointe donc vers une ressource actuellement inexistante.

---

## 8. Tableau récapitulatif — couleurs principales (copier-coller)

### 8.1 Version tableau (pour un graphiste)

| Rôle | Thème clair | Thème sombre |
|---|---|---|
| Terracotta (marque) | `#D53F15` | `#F56B3D` |
| Encre (texte) | `#221B16` | `#F1EDEA` |
| Papier (fond) | `#F9F8F5` | `#1A1714` |
| Carte / surface | `#FFFFFF` | `#221E1B` |
| Sable (secondaire) | `#EEE9E2` | `#312B26` |
| Texte secondaire | `#746A63` | `#A69E96` |
| Bordure | `#E2DEDA` | `#3B3530` |
| Succès | `#2D805F` | `#31C47F` |
| Danger | `#DB242D` | `#E74B56` |
| Avertissement | `#E19209` | `#F3A916` |
| Information | `#1588C1` | `#42B3F0` |
| Texte sur terracotta | `#FFFFFF` | `#20150E` |

### 8.2 Version texte (copier-coller pour un outil de création graphique)

```text
ClassPulse — palette officielle (thème clair)
terracotta   #D53F15   rgb(213, 63, 21)     hsl(13, 82%, 46%)
encre        #221B16   rgb(34, 27, 22)      hsl(24, 22%, 11%)
papier       #F9F8F5   rgb(249, 248, 245)   hsl(36, 28%, 97%)
carte        #FFFFFF   rgb(255, 255, 255)
sable        #EEE9E2   rgb(238, 233, 226)   hsl(34, 26%, 91%)
texte-2      #746A63   rgb(116, 106, 99)    hsl(26, 8%, 42%)
bordure      #E2DEDA   rgb(226, 222, 218)   hsl(30, 12%, 87%)
succes       #2D805F   rgb(45, 128, 95)     hsl(156, 48%, 34%)
danger       #DB242D   rgb(219, 36, 45)     hsl(357, 72%, 50%)
avertissement#E19209   rgb(225, 146, 9)     hsl(38, 92%, 46%)
information  #1588C1   rgb(21, 136, 193)    hsl(200, 80%, 42%)

ClassPulse — palette officielle (thème sombre)
terracotta   #F56B3D   rgb(245, 107, 61)    hsl(15, 90%, 60%)
encre        #F1EDEA   rgb(241, 237, 234)   hsl(30, 20%, 93%)
charbon      #1A1714   rgb(26, 23, 20)      hsl(26, 14%, 9%)
carte        #221E1B   rgb(34, 30, 27)      hsl(26, 12%, 12%)
sable-fonce  #312B26   rgb(49, 43, 38)      hsl(26, 12%, 17%)
texte-2      #A69E96   rgb(166, 158, 150)   hsl(28, 8%, 62%)
bordure      #3B3530   rgb(59, 53, 48)      hsl(26, 10%, 21%)
succes       #31C47F   rgb(49, 196, 127)    hsl(152, 60%, 48%)
danger       #E74B56   rgb(231, 75, 86)     hsl(356, 76%, 60%)
avertissement#F3A916   rgb(243, 169, 22)    hsl(40, 90%, 52%)
information  #42B3F0   rgb(66, 179, 240)    hsl(201, 85%, 60%)
texte sur terracotta (sombre)   #20150E

Typographie : Space Grotesk Bold (titres, wordmark) + Inter 400/500/600/700 (texte)
Rayon dominant : 16 px (rounded-xl) — tuile de marque : carré 36–48 px, coin ~40 %
Ombres : teinte brun-encre rgba(24,18,12,α), opacité 4 % → 16 %
```

---

*Aucun fichier existant du dépôt n'a été modifié, créé ou supprimé à l'occasion de
cet audit, à l'exception du présent document.*
