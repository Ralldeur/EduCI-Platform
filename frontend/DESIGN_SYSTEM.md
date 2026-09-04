# Système de design EduCI

Direction : sobre, moderne, "app premium" (esprit Linear / Notion / Stripe
dashboard) — pas coloré, pas ludique. Appliqué pour l'instant à **login** et
**chat** (sidebar + zone de conversation). À réutiliser tel quel pour les
pages restantes (exercices, admin) plutôt que d'improviser de nouvelles
valeurs.

Les tokens vivent dans `src/app/globals.css` (`:root` = thème clair, `.dark`
= thème sombre, activé par défaut — voir `Providers.tsx`,
`defaultTheme="dark"`). **Ne jamais coder une couleur en dur dans un
composant** : toujours passer par `var(--color-...)`.

## Palette

Un seul accent (plus de bleu/vert concurrents comme avant). Neutres gris
purs — plus de teinte bleu-ardoise (`slate`) qui donnait le look "template
générique" d'origine.

| Token | Rôle | Clair | Sombre |
|---|---|---|---|
| `--color-background` | Fond de page | `#ffffff` | `#0a0a0b` |
| `--color-surface` | Fond légèrement détaché (sidebar) | `#f7f7f8` | `#111113` |
| `--color-surface-raised` | Cartes, inputs, dropdowns, bulles | `#ffffff` | `#17171a` |
| `--color-surface-hover` | Survol d'un élément interactif | `#eeeef0` | `#202024` |
| `--color-border` | Séparateurs, contours discrets | `#e4e4e7` | `#232327` |
| `--color-border-strong` | Contour au focus/hover d'un input | `#d4d4d8` | `#313136` |
| `--color-foreground` | Texte principal | `#18181b` | `#ededef` |
| `--color-muted` | Texte secondaire (labels, méta) | `#6b6b70` | `#93939b` |
| `--color-muted-subtle` | Texte tertiaire (placeholder, footnote) | `#a1a1a6` | `#5c5c63` |
| `--color-primary` | Accent de marque (boutons, liens, icône active) | `#c2661f` | `#dd8544` |
| `--color-primary-hover` | Survol d'un élément `primary` | `#a8551a` | `#e89757` |
| `--color-primary-subtle` | Fond teinté très léger (badge, icône, halo) | `rgba(194,102,31,.1)` | `rgba(221,133,68,.14)` |
| `--color-primary-foreground` | Texte/icône sur fond `primary` | `#ffffff` | `#17110b` |
| `--color-danger` | Actions destructives uniquement | `#d33d3d` | `#e5696c` |
| `--color-danger-subtle` | Fond teinté léger (hover "supprimer") | `rgba(211,61,61,.1)` | `rgba(229,105,108,.14)` |
| `--color-success` | Succès (rare — pas de badge vert partout) | `#2f8f5b` | `#4ec98a` |

**Règle d'usage** : `primary` sert à UNE seule chose à la fois par écran —
l'action principale (bouton CTA, lien actif, icône d'IA). Ne pas l'utiliser
pour décorer (pas de bordures ou d'icônes `primary` "juste pour la couleur").
Tout le reste passe par les neutres.

Vérifié : tous les contrastes texte/fond du thème sombre sont ≥ 6.5:1 (WCAG
AA exige 4.5:1) — voir historique de session pour le détail des calculs.

## Typographie

Police unique : **Inter** (déjà chargée, `layout.tsx`) — pas de changement de
police, c'est l'échelle et les poids qui font le "premium", pas la famille.

| Usage | Classes | Exemple |
|---|---|---|
| Titre de page (login, écran vide) | `text-xl font-semibold tracking-tight` | "Connexion à ton espace" |
| Titre de section | `text-lg font-semibold tracking-tight` | — |
| Corps de texte (messages, contenu) | `text-[15px] leading-relaxed` | réponse de l'IA |
| Corps secondaire (UI, formulaires) | `text-sm` | boutons, inputs |
| Méta / labels | `text-xs font-medium text-[var(--color-muted)]` | "EduCI", horodatage |
| Footnote | `text-xs text-[var(--color-muted-subtle)]` | disclaimer sous le chat |

Titres toujours en `font-semibold` (jamais `font-bold` — trop lourd pour le
style visé) avec `tracking-tight`.

## Rayons (border-radius)

Échelle resserrée par rapport à l'avant (qui utilisait `rounded-xl`/`2xl`
partout — look "app ludique"). Toujours via les tokens, jamais `rounded-lg`
codé en dur :

| Token | Valeur | Usage |
|---|---|---|
| `--radius-sm` | 6px | icônes carrées, items de menu, code inline |
| `--radius-md` | 8px | boutons, inputs, select, cartes de liste |
| `--radius-lg` | 10px | cartes/panneaux (login), popovers, textarea du chat |

## Ombres

Quasi invisibles — juste assez pour détacher un popover du fond, jamais un
gros drop-shadow "carte qui flotte" :

- `--shadow-sm` : bouton primaire, popover de menu
- `--shadow-md` : carte de login, dropdown de mode de conversation

## Composants déjà migrés

- `Button` (`src/components/ui/Button.tsx`) — variantes `primary` (accent
  plein), `secondary`/`outline` (bordé neutre), `ghost` (transparent),
  `danger`. `secondary` a changé de sens (avant : vert plein → maintenant :
  bordé neutre, cohérent avec "un seul accent").
- `Select` (`src/components/ui/Select.tsx`)
- Page login (`src/app/(auth)/login/page.tsx`) — carte détachée du fond,
  halo radial `primary-subtle` très discret, plus de icône/texte flottants
  dans le vide.
- `ChatSidebar` — logo en pastille `primary`, indicateur de conversation
  active en barre verticale (plus juste un fond), footer neutre.
- `ChatMessage` — **changement structurel** : fini les lignes pleine-largeur
  alternées (look ChatGPT 3.5) ; message utilisateur = bulle alignée à
  droite (`surface-raised` + bordure) ; réponse IA = texte plein, sans fond,
  avec juste une petite icône `Sparkles` dans un carré `primary-subtle`
  (pas d'avatar rond coloré).
- `ChatInput`, `ModeSelector` (émojis remplacés par des icônes lucide
  cohérentes avec le reste de l'UI), `chat/page.tsx`, `chat/[id]/page.tsx`
  (états de chargement/vide).

## Pas encore migrés (pour la prochaine session)

- `/exercises` (génération, correction)
- `/admin` (dashboard, utilisateurs, leçons)
- `(auth)/register`
- Toasts (`react-hot-toast`) — vérifier qu'ils héritent bien des tokens ou
  les migrer explicitement.

Pour ces pages : reprendre les tokens et l'échelle de rayons ci-dessus tels
quels, ne pas réinventer une variante. Si une couleur "manque" (ex. un statut
`warning`), l'ajouter ici d'abord, dans les deux thèmes, avant de l'utiliser
dans un composant.

## Note connue (hors périmètre de cette session)

Le thème clair a été vérifié correct au niveau CSS (couleurs calculées
conformes aux tokens ci-dessus, contrastes bons) mais n'a pas pu être
validé visuellement par capture d'écran dans cette session : le profil
Chrome automatisé applique un assombrissement forcé au rendu qui ne reflète
pas les couleurs réelles de la page. Le thème sombre (celui utilisé par
défaut par l'app) a lui été vérifié à l'écran normalement.
