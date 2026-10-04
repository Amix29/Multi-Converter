# V1.0.7 Editor UI Design QA

## 2026-10-04 — Compact ribbon, shortcuts, zoom and image workflow

The maintainer supplied a 1920 × 1080 application screenshot and a cropped Word
ribbon. The review and capability comparison are in
[V1_0_7_EDITOR_WORD_REVIEW.md](V1_0_7_EDITOR_WORD_REVIEW.md).
The implementation keeps Vellum Paper, reduces desktop formatting controls to
28 px, arranges commands in two rows within labelled groups and preserves
40 px formatting targets in the narrow layout.

The 1280 × 720 desktop and 390 × 844 narrow ribbon captures show the grouped
controls, a readable active Bold icon and the writing area. Image controls now
sit in a contextual ribbon rather than on top of the asset. Local screenshots
are generated under the ignored output/playwright/results directory by
editor-ergonomics.spec.ts; they contain synthetic preview content.

Behavior checks cover 100% at the midpoint, 10%/500% bounds and exact entry,
Ctrl+wheel/plus/minus/reset, unchanged pagination, bold/clear/alignment/find,
page-break continuation, full screen and modal Escape priority. The selected
image case verifies dimensions/proportions, direct dragging, handles, reset and
deletion undone after autosave. Existing table, color, font, recent-menu,
full-viewport-dialog and PDF scenarios remain green.

The combined browser matrix passed 37 tests with 27 intentional platform skips.
TypeScript, six-language i18n, 139 unit tests, editor/layout/source contracts and
the production/preview frontend builds passed. The mechanical UI detector
reported no findings. Browser previews use simulated assets and storage;
native image lifetime, restart persistence and export layout need Tauri checks.

This is focused UI evidence for the editor workstream defined in [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md). It does not validate OCR or close the complete V1.0.7 release gate.

Les sections de correction du menu et de la modale ci-dessous constituent
l’historique pré-Vellum. La preuve Phase 2 actuelle est séparée à la fin du
document afin de ne pas présenter l’ancienne direction orange/crème comme la
DA active.

## Cibles comparées — historique pré-Vellum

- Source visuelle : captures utilisateur `codex-clipboard-d649aa9c-b9da-49d7-834e-6877b644c0a2.png` et `codex-clipboard-2b354ddd-7ab1-4e42-8fd2-cd33b22f0719.png`.
- Implémentation : [`screenshots/v1.0.7-editor-recents-menu.png`](screenshots/v1.0.7-editor-recents-menu.png) et [`screenshots/v1.0.7-editor-delete-dialog.png`](screenshots/v1.0.7-editor-delete-dialog.png).
- Source : fenêtre Windows de 1996 × 1248 px.
- Implémentation : viewport CSS de 1280 × 720 px, `devicePixelRatio` 1,5, capture normalisée à 1280 × 720 px.
- État : accueil de l’éditeur avec cinq documents récents, menu de la deuxième carte ouvert, puis confirmation de suppression ouverte.

Les dimensions diffèrent, mais les trois défauts contrôlés sont indépendants du viewport : ordre d’empilement du menu, couverture de la surcouche fixe et contraste de l’action destructive.

## Comparaison visuelle — historique pré-Vellum

### Vue complète

- Le menu reste maintenant entièrement au-dessus de la carte de la ligne suivante.
- La surcouche de confirmation couvre maintenant tout le viewport, y compris l’en-tête de l’application et les côtés de l’espace éditeur.
- Le bouton destructif utilise maintenant le fond rouge prévu, un texte blanc et une opacité complète.
- Dans cette ancienne capture, la hiérarchie, la grille, les couleurs
  orange/crème, les ombres et les rayons restaient cohérents avec l’accueil
  alors existant. Cette palette n’est plus la cible visuelle de Phase 2.

### Régions ciblées

- Carte active : classe `recent-document-card is-menu-open`, `z-index: 40`.
- Action `Supprimer` du menu : le point central retourne bien le bouton comme élément au premier plan.
- Surcouche : enfant direct de `body`, rectangle `(0, 0, 1280, 720)`, égal au viewport.
- Bouton destructif : fond `rgb(182, 82, 72)`, texte `rgb(255, 255, 255)`, opacité `1`.

## Surfaces de fidélité de la correction historique

- Polices et typographie : aucun changement n’avait été effectué pendant cette
  correction pré-Vellum.
- Espacement et rythme : seule la superposition avait alors été corrigée.
- Couleurs et tokens : les anciens tokens étaient encore conservés à ce stade.
- Images, ressources et contenu : aucun remplacement pendant cette correction
  historique.

## Historique des corrections

1. **P1 — menu recouvert par la carte suivante**
   - Cause : chaque carte animée créait son propre contexte d’empilement.
   - Correction : la carte dont le menu est ouvert reçoit `is-menu-open` et passe à `z-index: 40`.
   - Preuve après correction : le menu complet, y compris `Supprimer`, est visible et reçoit les interactions.

2. **P1 — surcouche limitée à l’espace éditeur**
   - Cause : la modale fixe était rendue dans un ancêtre animé et transformé.
   - Correction : les dialogues sont rendus dans `document.body` avec un portail React.
   - Preuve après correction : la surcouche couvre exactement le viewport.

3. **P1 — bouton de suppression presque invisible**
   - Cause : la règle des boutons secondaires écrasait le fond du bouton destructif.
   - Correction : le sélecteur neutre exclut `.editor-danger-button`.
   - Preuve après correction : fond rouge, texte blanc et opacité complète.

## Interactions vérifiées

- Ouverture du mode Éditeur.
- Création et retour de cinq brouillons locaux simulés.
- Ouverture du menu de la deuxième carte.
- Ouverture puis annulation de la confirmation de suppression.
- Aucun document n’a été supprimé pendant la vérification.
- Aucune erreur ou alerte pertinente dans la console.

## Résultat

Aucun écart P0, P1 ou P2 ne restait sur les trois régressions historiques
ciblées : menu, couverture de la modale et contraste du bouton destructif.

Résultat historique : réussi.

## 2026-07-31 — Smoke test historique après consolidation

Un second passage a utilisé un profil Playwright isolé, sans ouvrir le
navigateur principal de l’utilisateur. L’aperçu compilé `dist` a été servi par
Vite à `127.0.0.1`, puis vérifié à 390 × 844 px :

- fermeture de l’accueil guidé ;
- passage du Convertisseur à l’Éditeur ;
- création d’un document ;
- rendu de la barre d’outils et de la page ;
- saisie de `Test de transition Atelier IA` dans le document.

Ce smoke test confirme le rendu et ces interactions simulées uniquement. Il ne
prouve pas l’enregistrement Tauri, la persistance après redémarrage, les imports
ou exports Office, les sidecars ou OCR. Le serveur Vite de développement étant
resté sur l’optimisation initiale des dépendances, cette vérification a utilisé
l’aperçu compilé existant et ne remplace pas un nouveau build de production.

## 2026-07-31 — Phase 2 Vellum Paper

La Phase 2 remplace l’ancienne DA par le thème Vellum Paper sur l’application
React complète. Les tokens officiels sont copiés localement dans
`src/styles/vendor/vellum-tokens.css`. Le fichier source de l’Atelier et sa
copie embarquée partagent le SHA-256
`FA4C4754834756896E610CFB751170654B09BBBD543606149B1866513B8A44BE`.

La direction appliquée utilise :

- Paper comme unique thème, sans préférence Carbon ;
- Ink pour les actions principales et Coral comme ponctuation ;
- les couleurs fonctionnelles uniquement pour les états ;
- une densité compacte pour les barres et zones riches de l’éditeur ;
- une surface neutre orientée impression pour la page du document ;
- aucune police, feuille de style ou ressource visuelle distante.

Le gate final a généré cinq captures locales, copiées dans le dossier ignoré
`test-results/phase-2-vellum/` :

- `vellum-paper-375.png` à 375 × 844 CSS px ;
- `vellum-paper-768.png` à 768 × 900 CSS px ;
- `vellum-paper-1024.png` à 1024 × 900 CSS px ;
- `vellum-paper-1440.png` à 1440 × 900 CSS px ;
- `vellum-paper-1440-zoom-200.png` à 720 × 450 CSS px, équivalent déterministe
  de l’espace utile à 200 % sur une largeur physique de 1440 px.

Ces captures représentent l’accueil Convertisseur vide ; elles ne constituent
pas une inspection visuelle de chaque état de l’éditeur. Elles ont été
examinées après le gate final : aucun chevauchement du feedback, débordement
horizontal ou rupture de hiérarchie Paper n’y est visible. Le même test
parcourt et mesure aussi, à chaque largeur, la bienvenue, les fichiers vides et
sélectionnés, les réglages, le feedback, les formats, la progression, le
résultat, l’accueil et le document éditeur ainsi que leurs modales.

La couverture fonctionnelle Phase 2 vérifie aussi une cible principale d’au
moins 44 px et son vrai toucher à 390 × 844, le feedback dans la topbar, les
menus et modales au-dessus des contenus animés, le focus visible, la fermeture
par Échap, le retour du focus et `prefers-reduced-motion`. Il s’agit d’une
preuve Chromium preview ; la persistance Tauri, les conversions réelles et les
hôtes macOS/Linux restent hors de sa portée.

## 2026-08-04 — corrections issues de l’essai Windows

Les captures fournies par le mainteneur ont révélé des défauts visibles que les
contrôles précédents ne ciblaient pas : trait vertical Coral au centre de
l’accueil guidé, noms de fichiers tronqués, cartes sans hiérarchie, progression
OCR trompeuse, annulation bloquante et éditeur trop dense pour un travail long.

La correction Vellum Paper conserve une seule ponctuation Coral discrète et
apporte les changements suivants :

- suppression complète du pseudo-élément qui dessinait le trait central sur la
  prévisualisation d’accueil ;
- cartes fichiers recomposées en trois zones stables — identité, métadonnées,
  actions — avec nom complet multiligne et action OCR contenue dans la carte ;
- progression OCR en pilule, déterminée uniquement pendant les phases réellement
  mesurables et animée sans faux pourcentage pendant la reconnaissance ;
- état d’annulation immédiat, action **Réessayer** et fermeture possible par
  Échap ou par le bouton de fermeture pendant le traitement ;
- mode concentration de l’éditeur couvrant exactement le viewport ;
- barre d’outils à icônes SVG explicites, noms accessibles et navigation
  horizontale par deux boutons de 44 px sur les petites largeurs ;
- contrôles contextuels de l’image et du tableau ramenés à des cibles minimales
  de 44 px, sans débordement horizontal de la page ;
- dialogues Vellum cohérents pour nommer, remplacer et suivre l’export, en
  remplacement de l’ancienne boîte de dialogue WebView ;
- transitions plus courtes et fonctionnelles, toujours désactivables avec
  `prefers-reduced-motion`.

### Mesures rendues

La vérification compilée a confirmé que :

- `.document-editor-shell` occupe `(0, 0, largeur, hauteur)` en mode
  concentration ;
- Échap ferme ce mode et rend le focus au bouton qui l’a ouvert ;
- les boutons de navigation mobile de la barre, les commandes de calque et les
  poignées d’image/tableau atteignent 44 px ;
- la barre reste navigable lorsque tous les outils ne tiennent pas, sans
  imposer de défilement horizontal au document HTML ;
- les longues identités de fichiers restent visibles et chaque action demeure
  à l’intérieur de sa carte ;
- les contrôles titre/couleurs/surlignage/tableau/image, la sélection multiple
  par appui long et les dialogues d’export sont actionnables au clavier.

Ces constats proviennent de Chromium compilé et de mesures DOM. Ils prouvent la
géométrie et les interactions frontend, pas l’OCR natif, la persistance Tauri,
la conversion LibreOffice ni le rendu final DOCX/PDF. La validation native de
ces exports est encore ouverte.
