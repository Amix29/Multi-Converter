# V1.0.7 Editor UI Design QA

This is focused UI evidence for the editor workstream defined in [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md). It does not validate OCR or close the complete V1.0.7 release gate.

## Cibles comparées

- Source visuelle : captures utilisateur `codex-clipboard-d649aa9c-b9da-49d7-834e-6877b644c0a2.png` et `codex-clipboard-2b354ddd-7ab1-4e42-8fd2-cd33b22f0719.png`.
- Implémentation : [`screenshots/v1.0.7-editor-recents-menu.png`](screenshots/v1.0.7-editor-recents-menu.png) et [`screenshots/v1.0.7-editor-delete-dialog.png`](screenshots/v1.0.7-editor-delete-dialog.png).
- Source : fenêtre Windows de 1996 × 1248 px.
- Implémentation : viewport CSS de 1280 × 720 px, `devicePixelRatio` 1,5, capture normalisée à 1280 × 720 px.
- État : accueil de l’éditeur avec cinq documents récents, menu de la deuxième carte ouvert, puis confirmation de suppression ouverte.

Les dimensions diffèrent, mais les trois défauts contrôlés sont indépendants du viewport : ordre d’empilement du menu, couverture de la surcouche fixe et contraste de l’action destructive.

## Comparaison visuelle

### Vue complète

- Le menu reste maintenant entièrement au-dessus de la carte de la ligne suivante.
- La surcouche de confirmation couvre maintenant tout le viewport, y compris l’en-tête de l’application et les côtés de l’espace éditeur.
- Le bouton destructif utilise maintenant le fond rouge prévu, un texte blanc et une opacité complète.
- La hiérarchie, la grille, les couleurs orange/crème, les ombres et les rayons restent cohérents avec l’accueil existant.

### Régions ciblées

- Carte active : classe `recent-document-card is-menu-open`, `z-index: 40`.
- Action `Supprimer` du menu : le point central retourne bien le bouton comme élément au premier plan.
- Surcouche : enfant direct de `body`, rectangle `(0, 0, 1280, 720)`, égal au viewport.
- Bouton destructif : fond `rgb(182, 82, 72)`, texte `rgb(255, 255, 255)`, opacité `1`.

## Surfaces de fidélité

- Polices et typographie : aucun changement de famille, taille, graisse, interligne ou contenu.
- Espacement et rythme : aucun changement de grille ou de dimensions ; seul l’ordre d’empilement est corrigé.
- Couleurs et tokens : les tokens existants sont conservés ; la règle neutre ne remplace plus le style destructif.
- Images et ressources : aucun visuel ou pictogramme remplacé.
- Texte et contenu : les libellés, avertissements et actions restent inchangés.

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

Aucun écart P0, P1 ou P2 ne reste sur les deux états signalés.

final result: passed
