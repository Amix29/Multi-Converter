# Allègement OCR / LibreOffice — lot 3

## Contrat

Cible indicative demandée : environ **300 Mo**, avec arrêt autorisé si les
réductions ne peuvent pas être validées sans perte de formats ou de qualité.
Les cinq modèles `PP-OCRv6_medium` restent embarqués, identiques et hors ligne.
Pas de préparation Linux/macOS, de publication, de copie complète des moteurs
ni de suppression des anciennes candidates ou des données utilisateur.

Le point de départ est le setup vérifié de **513 064 488 octets** du lot 2.
La candidate intermédiaire du lot 3 fait **498 966 911 octets**, mais elle est
remplacée avant livraison par une reconstruction qui gère la réinstallation.
La taille définitive doit être lue dans le reçu final de ce dossier d'audit.

## Profils conservés

| Bloc | Avant, octets décompressés | Profil du lot 3 |
| --- | ---: | ---: |
| Runtime OCR, hors manifeste | 660 643 156 / 7 246 fichiers | 612 271 290 / 4 990 fichiers |
| LibreOffice | 682 221 962 / 9 654 fichiers | 606 614 990 / 9 654 fichiers |
| Poids des cinq modèles | 185 082 003 / 21 fichiers | strictement identiques |

OCR : retirer seulement les headers de développement Paddle, deux bibliothèques
statiques d'édition de liens et le plugin OpenCV/FFmpeg de lecture vidéo. Les
images de l'application sont normalisées en PNG et les pages PDF sont rendues
avant inférence. Les conversions vidéo restent assurées par les sidecars
FFmpeg/ffprobe d'origine. Aucun codec image, code d'inférence, DLL Paddle,
binaire OpenCV, modèle, seuil de qualité ou option numérique n'est remplacé.
Licences et notices restent présentes.

LibreOffice : supprimer 4 182 composants de configuration traduite dans le seul
espace `org.openoffice.Office.UI`, répartis sur 123 fichiers de ressources.
Les 3 198 autres composants de ces fichiers sont identiques. Toutes les
bibliothèques de conversion, polices, données de locale, filtres et données de
césure sont conservées. Les modifications sont des plages d'octets sous hashes
source/résultat ; elles ne nécessitent pas de grosses copies XML versionnées.

Les nouvelles vues vivent dans `bundled-engine-profiles/windows-x64/v3/`.
Le dossier du lot 2 reste intact pour les anciens processus de développement.
Les fichiers inchangés sont liés physiquement ; seuls les petits manifestes et
les registres effectivement transformés sont écrits.

## Validation native

- Corpus OCR complet : **40 cas**, sept langues, cinq formats image et PDF
  natif/scanné/mixte ; documents propres **100 %**, difficiles **99,76 %**.
- Les **40 textes normalisés** correspondent exactement au rapport de référence
  dont l'archive est verrouillée par SHA-256. **296 observations réseau**,
  aucune connexion distante observée.
- LibreOffice : les sept sorties PDF/DOCX/DOC/ODT/RTF/HTML/TXT ont une parité
  exacte des textes, pages et rendus à 200 DPI avec le moteur original. L'agrégat
  de la vue après conversion reste identique à celui d'avant.
- Audit XML indépendant : chaque composant non-UI et chaque attribut racine est
  conservé ; les 123 résultats correspondent aux hashes approuvés.
- Les sources ont passé le contrôle général, la matrice des 11 groupes de
  conversions, le refus HTTP de FFmpeg/ffprobe et les contrôles Rust.

Ces preuves natives ne remplacent pas l'acceptation GUI du setup installé. Les
rapports sont dans `audits/2026-11-07/engine-lot3/`.

## Réinstallation sans perte de données

Le script NSIS réel ne désinstalle pas systématiquement l'ancienne version :
le mode updater et la réparation de même version peuvent conserver des fichiers.
Un profil qui refuserait tous les restes du lot 2 bloquerait donc l'OCR après
une mise à jour.

Le runtime Windows reconnaît les **2 256 fichiers retirés connus** uniquement
s'ils ont leur chemin, leur taille et leur hash d'origine exacts. Cette liste
est embarquée et dérivée du manifeste authentifié du runtime source. Elle
s'applique au seul profil allégé, pas aux modèles ni aux autres plateformes.
Un reste modifié ou un fichier inconnu est refusé. Tous les fichiers actifs
continuent d'être hashés ; la nouvelle distribution n'embarque aucun de ces
restes. Aucune suppression automatique n'est effectuée dans le profil utilisateur.

Un overlay représentant l'ancienne installation est préparé par liens physiques,
avec le nouveau manifeste, puis soumis au vérificateur Rust réel. Les tests
négatifs couvrent un ancien fichier modifié et un fichier supplémentaire inconnu.
La diminution des ressources d'une installation neuve n'est pas une promesse
de récupération de tout l'espace des anciennes installations/caches conservés.

## Pistes rejetées et limite de la cible

La variante officielle [OpenCV contrib headless 4.10.0.84](https://pypi.org/project/opencv-contrib-python-headless/4.10.0.84/)
a été mesurée à version égale : seulement **235 520 octets** de moins pour le
binaire Windows. Elle n'est pas adoptée : le binaire original est conservé.
Les moteurs et modèles principaux restent la majorité du paquet. Les DLL
référencées par les imports natifs ne peuvent pas être simplement retirées.
La compression solide du lot 2 avait déjà capturé une grande part des doublons.

La cible de 300 Mo n'est pas déclarée atteinte. On s'arrête au meilleur profil
validé ici ; aucune substitution de modèle, quantification ou suppression de
filtre/police/langue n'est utilisée pour forcer ce chiffre. Une refonte du coeur
d'inférence ou un autre moteur documentaire demanderait une nouvelle preuve de
parité, qui n'est pas acquise par ces tests de conditionnement.

## Contrôle du paquet

Le SHA de l'exécutable source diffère normalement de celui inclus dans NSIS :
[Tauri 2.11.2](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle.rs)
remplace `__TAURI_BUNDLE_TYPE_VAR_UNK` par `__TAURI_BUNDLE_TYPE_VAR_NSS`, puis
restaure la source après emballage. Le vérificateur reproduit cette unique
transformation en mémoire et compare tous les autres octets. Un test refuse
un marqueur ambigu et prouve qu'une modification ailleurs change le SHA attendu.

Le paquet définitif doit passer le décodage SHA-256 de chaque ressource, le
test du conteneur et la vérification cryptographique de sa signature updater.
Cela ne lui confère pas de signature Windows Authenticode.

## Reproduction

```powershell
npm run prepare:windows-resources
python -X utf8 tools/engine-profiles/audit-ui-profile.py
npm run test:engine-profiles
npm run test:libreoffice-profile:native
# Le corpus accepte MULTI_CONVERTER_OCR_CORPUS_EXECUTABLE et
# MULTI_CONVERTER_OCR_CORPUS_REPORT pour conserver les rapports antérieurs.
npm run test:ocr:corpus
npm run test:rust
npm run test:conversions
npm run tauri:build
npm run verify:windows-engine-package -- --installer "<setup.exe>" --report "<receipt.json>"
```

Python sert seulement à l'audit XML indépendant ; la préparation et le build
restent en Node/Rust. Les verrous d'origine et les politiques de distribution
sont distincts, pour garder une restauration et une validation reproductibles.
