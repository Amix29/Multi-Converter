# Utiliser le système Multi-Converter

Lire `DESIGN.md`, puis charger `tokens.css`. Les ancres validées sont
`#c86a34` pour le mode clair et `#4d8445` pour le mode sombre. Choisir le mode
avec `data-theme="light"` ou `data-theme="dark"` sur la racine du document.

`components.html` présente les deux ambiances, les états et une démonstration
du parcours. Tous ses fichiers et motifs SVG sont locaux. Le catalogue ne
traite aucun fichier et ne télécharge aucune police.

Les 56 tokens partagés Open Design sont explicites dans chaque mode. Les
variables `--vlm-*` sont des alias de compatibilité du catalogue ; elles ne
dictent pas une autre identité. `--accent` porte l'action orange/verte et
`--accent-strong` les petits textes accentués. Le texte de bouton est sombre
pour garder les couleurs de référence exactes avec un contraste AA.

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
