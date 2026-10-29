# Preuves de l’audit du 29 octobre 2026

Source examinée : `codex/test`, commit `98726742`. Les seules modifications de cette tâche sont documentaires.

Les captures et reçus `preuves-interface*.json` utilisent une compilation neuve en mode preview avec des API simulées. Ils ne démontrent pas l’OCR natif, les mises à jour ou les exports réels. Versions et tailles affichées dans les captures sont fictives.

Les quatre passages UI sont `audit-ui.cjs`, `supplement-ui.cjs`, `annexes-ui.cjs`, puis `final-ui.cjs`. Ce dernier réutilise le code de `annexes-ui.cjs`. La capture 13 définitive vient du dernier passage, après stabilisation ; le reçu initial peut décrire un instant antérieur. La capture 22 définitive vient du passage annexes stabilisé. Le test de clic après export est consigné dans `preuves-interface-final.json`.

Pour rejouer ces scripts de diagnostic, adapter leur constante `repo` au checkout et compiler sa preview dans un sous-dossier `preview/` placé à côté des scripts :

```powershell
npm run build:frontend:preview -- --configLoader native --outDir '<dossier des scripts>/preview'
```

Utiliser les dépendances de test du dépôt et son Chromium Playwright installé. Les scripts ouvrent temporairement un serveur sur `127.0.0.1:4187` et écrivent leurs captures dans `captures/`. Ils sont des reçus de diagnostic de cette session, pas une nouvelle suite officielle de tests. Les chemins de machine sont conservés pour la traçabilité.

`audit-pandoc.cjs` utilise le Pandoc local, un document synthétique et un serveur HTTP local sur le port 4191. Il génère ses propres fixtures. `preuve-pandoc-reseau.json` constate la requête de ressource ; aucun fichier personnel ni serveur tiers n’a été utilisé.

Les JSON npm/Cargo/Python sont des sorties d’outils non filtrées. Un avis signalé nécessite une qualification des fonctionnalités et chemins réellement utilisés. Ne pas sommer les avis répétés entre plateformes Python. Les logs distinguent tests passés et échec de reproductibilité OCR.

Le rapport principal est `../../AUDIT_COMPLET_2026_10_29.md`.
