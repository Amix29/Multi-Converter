# Reproduire l'audit de taille Windows

Exécuter depuis la racine du dépôt avec le cache de la candidate Windows du
6 novembre encore présent. Scripts de mesure uniquement : aucun moteur n'est
supprimé, extrait, téléchargé, recompilé ou remplacé. Les JSON sont régénérés
dans `docs/audits/2026-11-07/`.

```powershell
node docs/audits/2026-11-07/reproduce/inspect-payload.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File docs/audits/2026-11-07/reproduce/inspect-zips.ps1
python docs/audits/2026-11-07/reproduce/inspect-pandoc-pe.py
```

Prérequis : Node du projet, PowerShell/.NET, Python standard (`struct`, `zlib`).
Le premier script utilise `LOCALAPPDATA` (ou `MC_AUDIT_LOCAL_DATA_DIR`) pour le
cache Tauri/NSIS et les anciens emplacements produit. Adapter leurs chemins
relatifs pour une reproduction ailleurs. Les JSON remplacent les chemins
personnels par `<repo>` et `%LOCALAPPDATA%`. La lecture du script NSIS suppose les ressources de ce
build encore présentes. Les scripts n'ouvrent pas le contenu des documents
utilisateur ; ils mesurent les noms de dossiers et tailles de fichiers des
emplacements produit. Le parcours des caches peut prendre une minute.

Les inventaires de candidats ZIP se recoupent parfois : ne pas les additionner
sans sélectionner une union de chemins. Les tailles compressées viennent du
répertoire central ZIP, pas d'un nouveau setup. Le préfixe PE Pandoc n'est pas
un exécutable stripped valide ; seules ses caractéristiques de compression
sont mesurées, sans écriture d'un binaire ni d'une archive temporaire.

L'essai NSIS Zlib/LZMA cité dans le rapport est le reçu historique du
30 octobre ; ces commandes ne le rejouent pas.
