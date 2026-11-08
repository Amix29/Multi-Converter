# Bilan et reprise de session — 8 novembre 2026

## Point de reprise

L'allègement Windows demandé est réalisé au niveau du paquet : **341,52 Mo**,
sous le plafond de 350 Mo. La cible idéale de 300 Mo n'est pas atteinte.
Le logiciel reste en développement V1.0.7 ; la version publique est V1.0.6.
**Aucune acceptation installée ni publication de V1.0.7 n'est déclarée.**

Lire les sources de vérité avant toute reprise : [plan](V1_0_7_PLAN.md),
[validation](V1_0_7_VALIDATION.md), [contrat OCR](V1_0_7_OCR.md), puis
[exécution de l'allègement](ENGINE_REDUCTION_EXECUTION.md) et
[détail du lot 4](ENGINE_REDUCTION_LOT4.md). Cette fiche les complète.

## Poids : ce qui est mesuré

| Mesure | Valeur | Portée de la preuve |
| --- | ---: | --- |
| Installateur NSIS Windows x64 | **341 519 995 octets / 341,52 Mo** | Fichier final construit et vérifié |
| Référence précédente, lot 3 | 499 243 548 octets / 499,24 Mo | Ancien paquet préservé |
| Gain du setup face au lot 3 | **157 723 553 octets / 31,59 %** | Comparaison des fichiers finaux |
| Contenu logique décompressé vérifié | **1 317 504 996 octets / environ 1,32 Go** | 10 464 chemins décodés et hashés, sans installation |
| Taille physique après installation | **Non mesurée** | Allocation du disque et fichiers générés non mesurés |
| Taille après mise à jour/réparation | **Non mesurée** | D'anciens moteurs ou caches peuvent subsister |

Les 341,52 Mo sont le poids compressé du **setup**, pas celui du logiciel installé.
Pour une installation neuve, environ 1,32 Go constitue une estimation de contenu,
pas une mesure physique. Une mise à jour peut occuper davantage. Aucun nettoyage
de l'installation ou des caches utilisateur n'a été effectué pour réduire ce chiffre.
Les tailles Mo/Go ci-dessus sont décimales.

## Paquet à conserver

Chemin local, à développer avec la variable d'environnement :

```text
%LOCALAPPDATA%\Temp\mc-cargo-target-svelte-migration\release\bundle\nsis\Multi-Converter_1.0.7_x64-setup.exe
```

SHA-256 :

```text
ef7f89d2f05cdbf2cbae940c86da524f3a072a45d382406b66847e3110b0398d
```

La signature updater `.exe.sig` est vérifiée cryptographiquement ; le fichier
`.exe.sha256` accompagne le setup. **Authenticode : `NotSigned`**. Une signature
updater ne constitue pas une signature Windows Authenticode.
Le [reçu final](audits/2026-11-08/engine-lot4/windows-candidate.json) et
[l'audit du contenu](audits/2026-11-08/engine-lot4/windows-payload.json) lient ces
mesures aux octets exacts du paquet. Les rapports documentaires ont des chemins
portables ; les SHA des copies et des originaux bruts privés figurent dans
[l'index des preuves](audits/2026-11-08/engine-lot4/evidence-index.json).

## Résultat technique et validations acquises

Le runtime OCR Windows Rust/ONNX occupe **24 637 577 octets**, hors modèles,
contre 612 271 290 auparavant. Les cinq modules medium restent complets en
FP32, avec le dictionnaire original et l'OCR hors ligne. Le stockage des modèles
réordonne les octets sans quantification ; le worker les restaure uniquement en
mémoire et vérifie leurs SHA officiels. Le profil LibreOffice v3 conserve ses
filtres, polices et données linguistiques ; les formats de conversion sont conservés.

Les preuves disponibles couvrent :

- Le contrôle canonique final, le typage, les budgets de source et le scan de confidentialité.
- 203 tests Rust, Clippy application/worker et les quatre audits Rust ; 15 tests sont ignorés par défaut et ne valent pas preuve d'exécution.
- Les 11 groupes de conversions réelles, le contrôle HTTP négatif, les sept tests PDFium et les neuf tests des profils de moteurs.
- Les **40 cas OCR à 100 %** sur le worker final, sans connexion distante observée pendant les 108 échantillons ; cette observation n'est pas une capture réseau continue ni une garantie de reconnaissance universelle.
- L'annulation/reprise, la protection des fichiers, les requêtes invalides et la vérification des ressources natives.
- Les imports PE et les chemins des DLL réellement chargées : Microsoft/ONNX proviennent du dossier du worker, y compris depuis le chemin accentué du checkout intégré.
- Le contenu entier du setup, les cinq modèles restaurés en mémoire, le CRC du conteneur et la signature updater.

Les premières candidates avec régression japonaise, dépendance ZIP vulnérable
ou DLL Microsoft manquante ont été rejetées/corrigées. Le setup partiel interrompu
et les archives de recherche ne remplacent jamais la candidate finale ci-dessus.

## État des sources et préservation

Source fonctionnelle de l'application : **`2e907a86`**, après `1b7bcc6d`.
Le checkpoint **`a956f266`** archive les validations et corrige le smoke standard
pour envoyer `schemaVersion: 1`, comme le superviseur Tauri. La documentation
de clôture peut suivre ces checkpoints sans modifier le paquet.

Les branches locales sont `codex/migrate-svelte` dans le worktree de réalisation
et `codex/test` dans le checkout principal ; aucun push n'a été effectué.
Le [registre de workspace](LOCAL_WORKSPACE.md) décrit l'intégration, les profils
reliés par NTFS et les anciens artefacts déplacés pour préservation.

Ne pas réinitialiser ni inclure sans examen les changements préexistants :

- Worktree de réalisation : `src-tauri/Cargo.toml`, sidecars Windows FFmpeg et ffprobe.
- Checkout principal : `src-tauri/Cargo.toml`.

Leurs empreintes utilisées par le build sont consignées dans
[build-source.json](audits/2026-11-08/engine-lot4/build-source.json).
Conserver les sources originales OCR/moteurs, les profils précédents, les
anciens setups et les fichiers utilisateur. Les rapports bruts sont dans le
cache privé `tmp/engine-lot4/raw-evidence` du worktree de réalisation.

## Ce qui reste ouvert

La prochaine validation fonctionnelle concerne le **setup exact** installé sous
Windows : parcours d'installation et de mise à jour/réparation, démarrage,
imports/exports, conversions, dialogue OCR et comportement updater. Mesurer
alors séparément la taille du programme installé et ses caches, sur installation
neuve et sur mise à jour. Ne pas déduire ces résultats du seul décodage du setup.

Le protocole Windows complet reste à accepter ; un essai sur le compte courant
avec sauvegarde ne prouve pas un profil vierge. La publication, la validation
du chemin de mise à jour installé et la préparation des entrées OCR du workflow
de publication restent ouvertes.

Les préparations Linux/macOS restent arrêtées, sans nouveau DMG/AppImage ni
acceptation finale du portage Svelte sur ces plateformes. Leurs preuves historiques
conservent leurs checkpoints. Aucune préparation multiplateforme, grosse copie
temporaire, installation ou nouvelle compilation n'est déclenchée par cette clôture
documentaire. Le site vitrine reste hors périmètre.
