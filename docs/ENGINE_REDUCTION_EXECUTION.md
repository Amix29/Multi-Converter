# Allègement des moteurs — exécution par lots

## Contrat et état au 7 novembre 2026

Le mainteneur autorise l'allègement des moteurs actuels, y compris une
distribution plus légère si elle conserve formats, qualité et OCR local.
L'[audit initial](ENGINE_SIZE_AUDIT_2026_11.md) reste la référence de mesure.
Pas de changement de modèle, de téléchargement OCR à l'exécution, de conversion
cloud, de publication ni de préparation Linux/macOS. Les anciens artefacts et
fichiers utilisateur sont conservés.

Lot 3 : **setup Windows construit, contenu complet et signature updater validés**.
La cible indicative de 300 Mo n'est pas atteinte. Arrêt au profil conservateur
validé ; les cinq modèles hors ligne et les bibliothèques d'inférence/conversion
restent inchangés. Voir [les changements, preuves et limites](ENGINE_REDUCTION_LOT3.md).

| Candidate Windows | Setup (octets) | Taille décimale |
| --- | ---: | ---: |
| Original avant allègement | 999 648 595 | 999,65 Mo |
| Lot 1, profil Office ZIP | 845 749 678 | 845,75 Mo |
| Lot 2, ressources directes + LZMA solide | 513 064 488 | 513,06 Mo |
| Lot 3, profil OCR et ressources UI Office | **499 243 548** | **499,24 Mo** |

Gain du lot 3 : **13 820 940 octets / 2,69 %** face au lot 2,
soit **50,06 %** face à l'original. Le
[reçu final](audits/2026-11-07/engine-lot3/windows-candidate.json) lie le setup,
sa signature et le binaire à ces mesures. Le
[contrôle du contenu](audits/2026-11-07/engine-lot3/windows-payload.json) confirme
**14 922 fichiers / 1 905 642 479 octets**
décodés et hashés sans extraction sur disque. Ce total logique n'est pas une
mesure physique du répertoire installé et de ses métadonnées.

La signature updater est vérifiée cryptographiquement ; Authenticode reste
`NotSigned`. Le setup reste privé, non publié et **non validé par le protocole
d'installation GUI**. Les anciens setups sont préservés par déplacement ; les
liens vers le [reçu du lot 2](audits/2026-11-07/engine-reduction/windows-solid-candidate.json)
sont corrigés vers son emplacement archivé et ses trois SHA ont été recontrôlés.
Aucun installateur n'a été exécuté ici. La compatibilité des anciens restes OCR
a été prouvée par un overlay natif isolé, pas par le parcours graphique updater.

## Lot 1 — LibreOffice Windows, profil de distribution headless

| Mesure | Original | Profil `windows-headless-v1` |
| --- | ---: | ---: |
| Archive ZIP | 483 796 141 octets | 328 694 744 octets |
| Runtime extrait | 1 513 332 017 octets | 1 142 267 215 octets |
| Fichiers | 19 325 | 9 888 |

Gain de l'archive : **155 101 397 octets**, environ 32,1 % du bloc LibreOffice.
Gain du runtime extrait : **371 064 802 octets**. Ces chiffres sont mesurés sur
les moteurs ; le gain du setup complet est mesuré séparément ci-dessus.

Le profil retire l'aide locale, la galerie, les thèmes d'icônes autres que
Colibre et les catalogues traduits de l'interface interne LibreOffice, avec
une exception prioritaire pour les fichiers de licence/copyright. Il garde
les bibliothèques exécutables, tous les filtres, dictionnaires, césures,
locales/ICU, polices, registres de formats et notices. Les langues des documents
ne dépendent pas des traductions de l'interface interne retirées.

Le ZIP est construit en recopiant les enregistrements déjà compressés et en
réécrivant seulement les offsets du répertoire ZIP. Aucun arbre moteur n'est
extrait/recompressé. Un buffer de 1 Mio suffit ; la sortie est le nouvel
artefact optimisé. La reconstruction explicite utilise au plus une archive
de sortie atomique temporaire, sans copie complète du runtime.

### Intégration et intégrité

- `src-tauri/engines-manifest.json` garde l'URL et le hash de l'archive originale
  publiée ; aucun hash nouveau n'est présenté comme un téléchargement déjà publié.
- `src-tauri/windows-libreoffice-profile.json` verrouille le hash source et le
  hash/volume/composition du paquet dérivé.
- `prepare:bundled-engines` produit ce profil ; le validateur vérifie ses
  empreintes et sa sélection sans créer d'archive quand il est en mode contrôle.
- Tauri Windows inclut uniquement l'archive profilée, sous le chemin runtime
  habituel `engine-archives/libreoffice.zip` ; le ZIP original reste conservé
  localement pour reproduction et retour arrière, hors paquet distribué.
- Le lecteur Rust vérifie le hash dérivé et sa limite d'extraction. Un cache
  indexé par ce hash préserve les anciens runtimes et évite de les écraser.
- Les configurations et résolveurs macOS/Linux gardent leur identité d'origine.

### Validation native et limites

Le runtime de référence déjà présent est vérifié par CRC de chaque fichier
retenu contre le ZIP source verrouillé. La vue candidate utilise des liens
physiques NTFS, sans dupliquer ses 1,14 Go de fichiers. Chaque conversion
utilise un profil utilisateur privé reprenant les paramètres de sécurité de
production ; aucun réglage LibreOffice de l'utilisateur n'est changé.

Sur un DOCX contrôlé de trois pages, créé avec le Pandoc inchangé : PDF,
DOCX, DOC, ODT, RTF, HTML et TXT passent la comparaison référence/candidate.
Pour les sorties paginées, le nombre de pages, le texte et les PNG PDFium
à 200 DPI correspondent exactement ; TXT est comparé par hash du contenu.
Le corpus contient tableaux, accents, petits caractères et texte arabe/chinois.
Ce contrôle établit une parité sur ce corpus, pas une fidélité universelle.

Le premier reçu couvre 9 887 fichiers ; l'ajout conservateur de
`help/media/icon-themes/COPYING-ICONS` conserve une notice supplémentaire sans
modifier le code ni les données de conversion. Le smoke final revérifie les
9 888 fichiers retenus et le PDF de trois pages avec le hash final
`d521a61c1c5fa175fc60871f872b221dcce858b20968b27a8708df3d7f8e7d70`.
Voir les [sept sorties](audits/2026-11-07/engine-reduction/libreoffice-native.json)
et le [smoke final](audits/2026-11-07/engine-reduction/libreoffice-final-profile-smoke.json).

Autres contrôles exécutés : quatre tests Node du profil/ZIP et refus des chemins
dangereux ; contrôle CRC ZIP indépendant ; lecture/décompression complète par
le lecteur ZIP Rust vers un puits, **sans extraire de fichiers** ; tests Rust,
matrice des 11 groupes de conversions réelles, contrôle HTTP négatif des médias
et Clippy avec avertissements refusés. Le contrôle général complet passe,
dont 64 tests frontend et les sept tests du wrapper PDFium ; la dernière passe
Rust compte 199 succès et 14 tests lourds ignorés par défaut. Les 11 groupes de
conversions et le test de flux ZIP sont exécutés séparément avec succès.
La préparation standard des moteurs est également exécutée avec succès et
réutilise le profil existant ; un contrôle de syntaxe des quatre points d'entrée
de préparation/validation protège contre les erreurs d'import dans ces scripts.

Le runtime OCR et les cinq modèles restent identiques et embarqués. Le corpus
OCR historique de 40 cas n'est pas rejoué pour ce changement LibreOffice ;
les contrats OCR et leurs verrous font partie des contrôles généraux. La
vérification finale du paquet recalcule aussi les hashes du runtime OCR et des
21 fichiers des cinq modèles, qui correspondent aux verrous d'origine. Aucun
test CLI moteur ne remplace l'acceptation GUI/installée de l'application finale.

Le setup précédent et son exécutable sont conservés par déplacement dans
`bundle-334bd2a5-before-engine-lot1`, sans copie supplémentaire. Les anciens
caches installés restent conservés : la réduction du runtime concerne une
nouvelle installation/extraction, pas une suppression de données anciennes.

## Distributions légères examinées

La [source Gyan](https://www.gyan.dev/ffmpeg/builds/) confirme que nous utilisons
déjà la variante Essentials. La variante Shared proposée par cet éditeur est
une Full, pas un remplacement Essentials automatiquement plus petit. Elle ne
sera pas substituée sans mesure de l'ensemble des DLL et parité des capacités.
Une compilation partagée de la version actuelle reste un lot séparé.

La [distribution libvips](https://www.libvips.org/install.html) distingue Web et
All ; le runtime actuel est déjà limité à 28,47 Mo. Changer vers un paquet
plus petit peut retirer un lecteur/codec nécessaire : aucun échange sans gain
mesuré et matrice de formats réussie. Le runtime OCR natif reste hors de ce
premier lot et conditionné à la parité des cinq modèles.

## Reproduction du lot

```powershell
npm run prepare:libreoffice-profile
npm run test:engine-profiles
node scripts/prepare-libreoffice-profile.mjs --check
# Définir MULTI_CONVERTER_LO_REFERENCE sur un runtime original correspondant au ZIP.
npm run test:libreoffice-profile:native
node scripts/cargo-test-temp.mjs test --manifest-path src-tauri/Cargo.toml prepared_libreoffice_profile_streams -- --ignored --nocapture
```

`--write-lock` est réservé à une nouvelle dérivation volontaire et revue.
Le contrôle natif réutilise les fichiers via liens physiques ; il ne doit
jamais copier un runtime si ces liens sont indisponibles. Le répertoire de
test optionnel doit rester dans le `tmp/` du dépôt. Les preuves peuvent être
gardées sans copier les fichiers moteur ; leur volume logique inclut les liens.

## Lots suivants

1. FFmpeg/ffprobe partagés : garder tous les formats et les replis logiciels,
   vérifier licences/DLL et mesurer le paquet complet avant adoption.
2. OCR Python ciblé : retirer seulement des dépendances démontrées inutiles,
   puis rejouer les cinq modules, les 40 cas et le comportement hors ligne.
3. Pandoc de distribution sans symboles : maintenir sandbox, lecteurs/rédacteurs
   et ressources embarquées ; mesurer séparément gains disque et setup.

Ces lots restent ouverts et ne sont pas déclarés implémentés par le lot 1.

## Lot 2 — ressources Windows directes et compression solide

Le mainteneur juge le setup de 845,75 Mo encore trop lourd. Le profil
`windows-offline-direct-v2` conserve les exécutables LibreOffice du ZIP verrouillé,
ses filtres, polices, locales et données de césure. Il retire 234 fichiers de
correction orthographique/thésaurus, inutilisés par les conversions sans éditeur,
et retire leurs 117 inscriptions des registres de dictionnaires. Les 56 petits
registres dérivés sont versionnés avec les hashes avant/après. Un audit XML
indépendant confirme que toutes les autres sémantiques restent identiques :
41 inscriptions de césure et les 43 fichiers `hyph*.dic` restent présents.

La vue LibreOffice finale compte **9 654 fichiers / 682 221 962 octets**, contre
1 513 332 017 octets dans la distribution initiale. Son agrégat SHA-256 est
`07f93cd73bb207da30f6b0d82246ab65db706bc13aeda3d30daa4a2e99a26a1c`.
Les cinq modèles et tous les fichiers du runtime OCR restent identiques aux
verrous initiaux. Les licences et notices des moteurs restent embarquées.

Windows installe désormais les fichiers LibreOffice et OCR directement, au lieu
d'embarquer leurs ZIP puis de conserver une extraction séparée dans le profil
utilisateur. Un seul flux solide LZMA avec dictionnaire de 128 Mio peut donc
compresser ensemble les moteurs. C'est une compression sans perte ; elle ne
change ni les codecs ni les poids OCR. Le démarrage conserve la vérification
cryptographique OCR avant inférence. Les chemins ZIP historiques restent lisibles
et les configurations Linux/macOS gardent leurs ressources antérieures.

La compilation Windows par défaut sépare `tauri build --no-bundle`, avec
ressources/sidecars exclus de la copie de compilation, puis `tauri bundle` sur
les sources préparées. La préparation réutilise les fichiers existants par liens
physiques ; un hôte neuf décompresse chaque entrée nécessaire une seule fois
vers la vue finale. Aucun double runtime temporaire n'est créé. Les bundles
précédents sont déplacés et conservés, jamais effacés par le lanceur de build.
Les caches utilisateurs existants restent intacts ; ce changement n'autorise
aucune suppression ni récupération automatique de leur espace.

Mesure exploratoire : un compteur de sortie LZMA1/128 Mio, sans fichier archive,
donne 512 075 710 octets pour 2 029 593 386 octets sources. Ce chiffre est une
**estimation du flux**, pas la taille du setup NSIS. L'ordre des fichiers et les
paramètres du véritable installateur peuvent produire un résultat différent.

Reproduction des nouveaux contrôles :

```powershell
node scripts/prepare-windows-resources.mjs
node scripts/prepare-windows-resources.mjs --check
python tools/engine-profiles/audit-dictionary-profile.py
npm run test:engine-profiles
npm run test:libreoffice-profile:native
npm run test:ocr:runtime
npm run tauri:build
```

L'audit XML utilise uniquement la bibliothèque standard Python ; la préparation
et le build de l'application restent en Node/Rust. Le test OCR réutilise la vue
directe lorsqu'elle est présente, sans extraire une autre copie de 662 Mo.
Un essai de fixture de césure avec contrôle négatif n'a pas activé la césure dans
la référence : il est **non concluant**, exclu des preuves de parité. La
préservation des registres/données de césure est vérifiée séparément. La parité
des sept formats reste une preuve native sur corpus contrôlé ; elle ne remplace
pas l'acceptation GUI du setup installé ni tous les documents réels possibles.

Deux échecs de préparation ont été conservés dans le journal local : caches
Python créés par le test LibreOffice, puis limite MAX_PATH de NSIS sur les
headers Paddle dans le long chemin du worktree. Les 42 caches générés (717 078
octets) ont été déplacés hors du paquet, sans suppression ; les conversions
LibreOffice désactivent désormais leur écriture. Le wrapper utilise une jonction
temporaire courte pour les seules adresses sources de l'empaquetage. Les cibles
installées restent identiques ; la jonction est retirée sans parcourir sa cible.
Aucun fichier OCR n'a été retiré pour contourner les chemins longs.

`npm run verify:windows-engine-package -- --installer "<setup.exe>" --report "<receipt.json>"`
vérifie le setup réel avec 7-Zip : il décode les ressources vers des consommateurs
SHA-256 en mémoire et compare les fichiers des moteurs, modèles, licences et de
l'application aux sources ou agrégats verrouillés. Il ne produit pas de copie
installée des moteurs. La signature updater est vérifiée séparément.

Le script NSIS généré confirme 9 654 fichiers Office et 7 247 fichiers OCR
runtime (manifeste compris), sans ZIP moteur supplémentaire. Les sources
passant par la jonction font au maximum 215 caractères, sous la limite qui
avait bloqué l'essai précédent. La seconde invocation de bundling avertit que
le marqueur Tauri a déjà été patché ; une inspection binaire confirme
`__TAURI_BUNDLE_TYPE_VAR_NSS`, interprété comme NSIS par la version Tauri utilisée.
Cela ne constitue pas une validation du parcours updater installé.

Le contrôle général du checkpoint intégré passe à nouveau. La suite Rust finale
série compte 200 succès / 15 tests lourds ignorés ; le contrôle direct OCR ignoré
par défaut est exécuté séparément et passe, ainsi que les 11 groupes natifs et
le refus HTTP des médias. Clippy et le format Rust passent. Les sept formats
Office passent encore avec écriture des caches désactivée ; le hash de la vue
après les conversions correspond exactement à celui d'avant.

Le compteur exploratoire est reproductible avec
`python tools/engine-profiles/benchmark-solid-stream.py`. Il ne crée aucune
archive et écrit seulement un petit rapport JSON sous `tmp/`. Le rapport initial
est conservé dans `audits/2026-11-07/engine-reduction/lzma-estimate.json` ; il
utilisait l'exécutable du lot 1 et ne remplace pas la taille du setup final.

### Résultat final du lot 2

Le véritable NSIS mesure **513 064 488 octets**, SHA-256
`48b73cbb75b3657ad422554114535807b7fe16c7abb5617b92a8a6068806b2b5`.
Les 17 178 fichiers applicatifs du conteneur correspondent aux hashes des
sources, des modèles et du profil verrouillé. `7z t` passe sur le fichier
complet, puis la signature updater est vérifiée avec la clé publique configurée.
Le statut Authenticode natif est `NotSigned` ; le contrôle a été effectué avec
PowerShell 7 après un échec d'auto-chargement du module dans PowerShell 5.

Les artefacts du lot 1 sont dans `bundle-9ae7321c-before-engine-lot2` ; leurs trois
hashes (setup, signature, exécutable) sont revérifiés inchangés et le reçu
historique référence ces nouveaux chemins. La préparation du checkout
`codex/test` utilise aussi les liens physiques, sans copie supplémentaire des
runtimes. La jonction courte de packaging est retirée après compilation.
Le téléchargement Node 27 provoqué par une invocation npm erronée a été écarté
vers la Corbeille ; l'empaquetage final utilise bien Node 24 du projet.

Il reste à exécuter l'acceptation GUI du setup installé avant toute déclaration
de release prête. Linux/macOS restent arrêtés ; les caches utilisateur et
anciens artefacts ne sont pas supprimés pour embellir la mesure.
