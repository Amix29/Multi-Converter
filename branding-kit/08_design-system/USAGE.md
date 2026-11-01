# Utiliser le système Multi-Converter

Lire `DESIGN.md`, puis charger `tokens.css`. Les ancres validées sont
`#c86a34` pour le mode clair et `#4d8445` pour le mode sombre. Choisir le mode
avec `data-theme="light"` ou `data-theme="dark"` sur la racine du document.

`components.html` présente les deux ambiances, les états et une démonstration
du parcours. Tous ses fichiers et motifs SVG sont locaux. Le catalogue ne
traite aucun fichier et ne télécharge aucune police.

Les 56 tokens partagés Open Design sont explicites dans chaque mode. Les
variables `--vlm-*` sont des alias de compatibilité du catalogue ; elles ne
dictent pas une autre identité. `--accent` porte la référence orange/verte et
`--accent-strong` les petits textes accentués. Les boutons principaux utilisent `--action-bg/hover/active` avec `--action-on`
blanc chaud ; les six couples thème/état dépassent 4,5:1. Les quatre rôles
additionnels sont indexés dans `source/action-roles.json`.

Le paquet suit `od-design-system-project/v1`. Pour le modifier dans Open Design,
ouvrir son espace d'édition, conserver les fichiers canoniques, puis synchroniser
ses assets. Un import générique de code peut réextraire une palette neutre :
vérifier le contrat et le contenu du paquet après import.

Le logo clair est inchangé ; sa variante sombre reprend le même dessin avec
le point vert validé. Les anciens tokens de marque restent dans `../03_tokens/`
comme sources historiques ; ce paquet fait référence pour les nouveaux designs.

Exemple de brief : « Utilise Multi-Converter en mode sombre. Conçois l'écran
Formats pour trois fichiers, avec des réglages individuels, un avertissement
de perte de métadonnées et un pied d'action accessible à 375 px. »

Dans le dépôt Multi-Converter, `docs/OPEN_DESIGN_SYSTEM.md` conserve le statut
d'installation Open Design et les contrôles effectués.

Après une modification du catalogue, exécuter depuis la racine du dépôt
`python scripts/build-design-previews.py`. Ce générateur sans dépendance
reconstruit les six aperçus, les deux entrées `system/kit*.html` et les empreintes
de source. Ne pas modifier directement les pages générées. Le produit et le
catalogue partagent `assets/controls.css` ; le comportement du menu Svelte repose sur Bits UI
dans `src/app/components/ChoiceSelect.svelte`. Toute modification des tokens exige
aussi la régénération des index JSON natifs avant de mettre à jour Open Design.
