# Objectif 300–350 Mo — lot 4 Windows natif

## Contrat et état

État au 8 novembre 2026. Le mainteneur demande une nouvelle tentative, cible environ 300 Mo et plafond
350 Mo, sans perte de qualité, de formats ou d'OCR hors ligne. Le setup Windows
final validé fait **341 519 995 octets / 341,52 Mo**, contre 499 243 548 au
lot 3. Le plafond est atteint avec les cinq modules FP32, tous les formats et
l'OCR hors ligne. L'installation graphique reste à valider.

Les moteurs de référence et les cinq modèles restent intacts. Les essais
utilisent des liens physiques, des buffers en mémoire et des sorties compressées
uniques ; aucun arbre moteur complet n'est recopié. Pas de préparation Linux/macOS,
d'installation utilisateur, de publication ou de modification du site.

## Compression sans changement de moteur

- Réordonnancement réversible des octets des cinq fichiers de paramètres :
  chaque transformation est inversée en mémoire et son SHA-256 comparé à la
  source. Avec le même LZMA2, 144 384 883 → 133 120 010 octets, gain de
  **11 264 873 octets**. Il s'agit des paramètres seuls, pas d'un setup.
- Plans de bits + Zstandard 19 également testés, avec contrôle aller-retour.
- Archive complète 7-Zip 26.01, dictionnaire 512 Mio, solidité activée, filtres
  BCJ2/ARM64 automatiques : **465 516 611 octets**, contre un setup existant de
  499 243 548 octets. Cette archive contient les 14 922 entrées sources ; ce
  n'est ni un programme d'installation, ni une validation d'installation.
- Imports PE de Paddle inspectés : `libpaddle.pyd` et `phi.dll` importent
  directement `mkldnn.dll`. Cette DLL ne peut pas être retirée sous prétexte que
  l'accélération est désactivée.

## Candidate ONNX CPU isolée

La [documentation officielle PaddleOCR 3.7.0](https://github.com/PaddlePaddle/PaddleOCR/blob/v3.7.0/docs/version3.x/inference_deployment/local_inference/inference_engine.en.md)
prévoit un moteur ONNX. Les cinq modèles officiels correspondants existent dans
l'organisation PaddlePaddle sur Hugging Face, y compris UVDoc et les variantes
**medium** de détection/reconnaissance. Chaque révision Git et SHA-256 LFS est
épinglé avant téléchargement. Les configurations et le dictionnaire de caractères
proviennent des fichiers de référence inchangés. Pas de modèle mobile, INT8,
FP16 ou de téléchargement lors de la reconnaissance.

Le convertisseur Paddle2ONNX 2.1.0 échoue à charger son extension avec le Paddle
3.3.1 verrouillé (`procedure not found`). Aucune DLL de remplacement ni mise à
niveau du runtime de référence n'est utilisée pour contourner cet échec.
Les variantes ONNX officielles sont testées séparément.

Les premiers essais réutilisent CPython 3.12.10 et les paquets verrouillés du
cache uv par liens physiques. Paddle est masqué aux détecteurs de dépendances
et son import est explicitement interdit : la candidate ne peut pas se rabattre
silencieusement sur l'ancien moteur.

Le corpus natif de **40 cas** passe avec les cinq modèles et le vrai processus
Python surveillé : 100 % propre/difficile, 39 textes identiques et un cas bruité
amélioré de 97,62 % à 100 %. La première configuration conserve trop de mémoire
(environ 2,3 Gio). Désactiver l'arène CPU, sans changer les calculs ni les modèles,
conserve les 40 réussites et ramène le maximum observé après reconnaissance à
**382 369 792 octets / 364,7 Mio**, médiane 2 720 ms, 49 observations réseau,
aucune connexion distante observée. Ce n'est pas une capture réseau continue.

Une candidate PyInstaller autonome est construite par liens physiques. Les
tests de démarrage ont révélé des imports obligatoires : Pandas, les modules
dynamiques PaddleX et le PDFium Python sont conservés/rétablis. L'exécutable
autonome passe les 40 cas à 100 %, maximum observé après traitement 385 036 288
octets, 124 observations réseau et aucune connexion distante observée.
L'archive complète de cette candidate fait **393 194 102 octets** : ses
14 258 fichiers / 1 547 858 495 octets sont décodés et vérifiés par SHA-256,
sans extraction sur disque. Elle reste au-dessus du plafond avant même
d'ajouter le programme d'installation.

Les 4 323 modules du PYZ ont ensuite été reconstruits en zlib niveau 0 :
**tous leurs octets décompressés et les autres charges embarquées sont identiques**.
Une comparaison LZMA sur l'exécutable seul mesure 23 165 097 → 12 781 025 octets,
soit 10 384 072 octets gagnés. Ce gain isolé ne s'additionne pas aveuglément à
une mesure de setup. La variante autonome passe à nouveau les 40 cas à 100 %
(384 507 904 octets observés après traitement, 277 observations réseau, zéro
connexion distante observée). Des erreurs Windows localisées ont révélé le
besoin d'un protocole UTF-8 explicite ; cette initialisation est ajoutée à la
seule candidate. Entrée absente, requête malformée, annulation après 250 ms et
redémarrage/reprise passent ensuite, sans modification de l'image source.

## Prototype Rust natif

Une seconde candidate isolée utilise `oar-ocr = 0.10.2` (Apache-2.0) et
`ort = 2.0.0-rc.13`, en chargeant le même ONNX Runtime CPU 1.26.0 local et
les cinq fichiers ONNX déjà vérifiés. Les fonctionnalités `auto-download`,
`download-binaries` et accélérateurs ne sont pas compilées. Le dictionnaire
de 18 708 caractères est dérivé de la configuration officielle, sans substitution.

Les paramètres réellement inspectés de la référence sont imposés explicitement :
détection 1536/max, limite supérieure 4000, seuil 0,3, seuil de boîte 0,6,
unclip 1,5 et reconnaissance sans filtrage supplémentaire. Les valeurs du preset
PP-OCRv6 d'une autre bibliothèque ne sont pas utilisées à leur place.

L'exécutable scalaire fait **3 406 848 octets**, hors DLL ONNX et modèles.
Le corpus scalaire détecte une régression : `clean-ja-3` obtient 94,12 %, avec
le petit `ァ` reconnu `ア` ; les 39 autres cas passent. SIMD reproduit le même
défaut. Cette première candidate est rejetée, sans correction artificielle du texte ni
abaissement du seuil de 98 %.

Une différence de prétraitement est identifiée : `image::Triangle` applique
un filtre élargi à la réduction et ne reproduit pas `cv2.INTER_LINEAR`. Une
correction générique est isolée dans le code tiers du prototype. Sept images
aléatoires reproductibles (réduction, agrandissement, axes d'un pixel et tailles
de reconnaissance) donnent **36 384 composantes de pixels identiques à OpenCV
4.10.0**, delta maximal nul. Cette correction seule ne résout pas le japonais.
Le recadrage est ensuite aligné sur le noyau cubique -0,75, la table de coordonnées
1/32 et les coefficients signés 15 bits d'OpenCV ; sept comparaisons synthétiques
donnent aussi des pixels strictement identiques.

Le diagnostic des étapes révèle la cause principale : le constructeur d'adaptateur
utilisé par le pipeline réduit l'image à **512 × 512 avant UVDoc**, contrairement
au constructeur de prédicteur dont le défaut est déjà dynamique. Le défaut réel
est corrigé pour conserver la pleine résolution. Les **3 420 000 composantes**
de l'image japonaise corrigée correspondent alors exactement à la référence,
et le japonais repasse à 100 %. Ce diagnostic évite un contournement du texte.

L'alignement s'étend au redimensionnement de détection/classification et à la
troncature de largeur propre à chaque ligne avant le padding du lot. Le worker
natif passe les **40 cas à 100 % propre et difficile**, maximum observé après
traitement 237 711 360 octets, médiane 6 041 ms, 98 observations réseau et zéro
connexion distante observée. Les mesures ne constituent ni un pic continu de
mémoire ni une comparaison de vitesse sous charge identique.

## Distribution native et stockage réversible

Le worker de distribution ignore les variables de DLL/trace de diagnostic,
charge le DLL ONNX local vérifié par un SHA compilé, désactive la télémétrie et
borne les lectures, images, messages et sorties. Les sources du runtime sont
épinglées sur le wheel PyPI 1.26.0 de 13 026 427 octets ; tous les DLL/notices
retenus sont comparés aux membres du wheel officiel, sans extraction d'arbre.
Les trois DLL Microsoft proviennent de l'archive de référence vérifiée.

L'audit des imports PE normaux/différés a ensuite trouvé `MSVCP140_1.dll`
absent : l'hôte de développement le fournissait. Le profil final ajoute ce
fichier depuis le [redistribuable Microsoft officiel](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
**14.51.36247.0**, de la même famille que les trois bibliothèques retenues. Le paquet signé
de 18 731 856 octets est épinglé par SHA ; seuls la DLL de 35 768 octets et les
métadonnées originales contenant le lien de licence sont extraits par
`expand.exe`. Aucun installateur Microsoft n'est exécuté. Le SHA de cette DLL
est aussi celui de l'exemplaire System32 observé sur cet hôte.

Le [contrôle des sept PE](audits/2026-11-08/engine-lot4/native-imports.json)
refuse tout recours au MSVC système, et le test de cycle relève les chemins
des cinq DLL réellement chargées : toutes proviennent du dossier du worker. Cette
preuve est répétée depuis le chemin accentué du checkout intégré. Ces contrôles
sont intégrés au workflow Windows ; ils ne remplacent pas un lancement sur OS
propre. La candidate NSIS interrompue pendant ce diagnostic est explicitement
[rejetée](audits/2026-11-08/engine-lot4/interrupted-build-rejection.json), même
si le lanceur avait renvoyé zéro : le contrôle d'archive a bien refusé le fichier.

Les cinq fichiers ONNX sont stockés avec un réordonnancement d'octets par quatre
plans, puis restaurés **uniquement en mémoire** avant chargement. Chaque modèle
restauré doit correspondre au SHA officiel compilé ; aucun poids n'est quantifié,
arrondi ou supprimé. Les queues non multiples de quatre sont couvertes par un
test indépendant sur 133 longueurs ; les cinq fichiers réels sont inversés et
comparés intégralement pendant la préparation. Aucun cache décodé n'est créé.

La candidate autonome avec ce stockage passe à nouveau les **40 cas à 100 %**,
médiane 5 511 ms, environ 227 Mio observés après traitement, 104 observations
réseau et aucune connexion distante observée. L'identité du dictionnaire de
18 708 caractères est contrôlée séparément. Les variantes officielles ONNX sont
une sérialisation différente des fichiers Paddle, dont les octets originaux
restent conservés comme référence ; aucune identité de ces deux conteneurs
n'est prétendue.

Le profil `windows-native-ocr-v1` préparé contient **542 fichiers / 24 637 577
octets de runtime**, contre 4 990 / 612 271 290 pour le profil précédent. Les
modèles et configurations occupent **11 fichiers / 184 084 883 octets**.
Les notices historiques sont conservées, celles des dépendances Rust sont
inventoriées et les textes omis par certains paquets sont ajoutés depuis leurs
révisions Git épinglées. Les macros de compilation sont distinguées des
bibliothèques de runtime distribuées.

Le résolveur Tauri Windows sélectionne des attentes compilées distinctes pour
le runtime et ses modèles. Les marqueurs doivent former une paire approuvée et
garder l'origine initiale ; les fichiers actifs sont tous hashés, les inconnus
refusés. Les anciens restes ne sont tolérés qu'à leurs chemins/tailles/SHA
originaux exacts. Les verrous globaux et les ressources macOS/Linux ne changent
pas. Les commandes et prérequis sont dans le
[guide du worker](../tools/ocr-runtime/native-worker/README.md).

## Mesures de conteneurs et validation du setup

L'audit Rust a bloqué l'adoption de la première intégration : `oar-ocr` 0.10.2
référençait ZIP 8.6, affecté par RUSTSEC-2026-0367/-0368/-0369/-0429.
Le [correctif publié](https://rustsec.org/advisories/RUSTSEC-2026-0369.html)
est ZIP >= 9. La source de ce paquet est isolée dans `vendor/oar-ocr`, avec
sa licence ; seul son manifeste passe à ZIP **9.0.0**, également utilisé par
l'application. Aucune exception d'audit n'est ajoutée et aucun algorithme OCR
n'est modifié. Le binaire, la curation et les validations sont renouvelés après
ce changement. Les preuves antérieures restent distinguées de ce binaire final.
L'audit des quatre verrous Rust passe ; les avertissements de maintenance
préexistants restent visibles. La comparaison avec les archives Cargo dont les
SHA correspondent à l'index confirme 150 fichiers source/manifeste inchangés,
les sept corrections génériques de prétraitement déclarées et le seul changement
de manifeste ZIP. Voir [le relevé](audits/2026-11-08/engine-lot4/vendor-diff.json).

Une archive de recherche avec le petit worker scalaire initial, les cinq modèles
et tous les autres moteurs mesure **326 987 635 octets**. Ses **9 923 fichiers /
1 311 650 512 octets** ont été décodés vers des consommateurs SHA-256 sans
extraction et correspondent aux sources. Ce worker scalaire avait échoué au
cas japonais : cette archive n'est donc pas une candidate distribuable et sa
taille ne remplace pas celle du setup final. Le compteur NSIS exploratoire
interrompu n'est pas utilisé comme preuve.

La source est figée à `2e907a86`. Le binaire final
`95ade536e35ce087987305c0747e8ceb89683399d64a602436bfb82584a6aa49`
repasse les **40 cas à 100 %** propre/difficile ; maximum échantillonné
233 357 312 octets, médiane 6 252 ms, 108 observations réseau, aucune connexion
distante observée. Ces mesures sous compilation concurrente ne sont pas un
benchmark de vitesse. Voir [le corpus final](audits/2026-11-08/engine-lot4/final-corpus.json).

Les contrôles canoniques, 203 tests Rust, Clippy, 11 groupes de conversions
réelles, le contrôle HTTP négatif et l'intégrité native du profil passent.
Les sept tests PDFium, neuf tests de profils, formats Rust, tests/Clippy du
worker et audit des quatre verrous passent aussi. Le
[cycle réel du worker](audits/2026-11-08/engine-lot4/final-lifecycle.json) couvre
échec, annulation, reprise, protection des entrées/sorties, requête surdimensionnée
et absence de DLL locale. Les
[outils de préparation](audits/2026-11-08/engine-lot4/preparation-reproduction.json)
revérifient les sources et restaurent les cinq modèles exacts sur des liens NTFS,
sans modifier le profil de production ni copier ses gros fichiers.

Le **véritable NSIS** fait **341 519 995 octets / 341,52 Mo**, soit **31,59 %**
de moins que le lot 3 (157 723 553 octets gagnés) et **65,84 %** de moins que
l'original. Le plafond demandé de **350 000 000 octets** est respecté ; les
300 Mo idéaux ne sont pas atteints.

Les **10 464 fichiers / 1 317 504 996 octets logiques** du
[setup exact](audits/2026-11-08/engine-lot4/windows-payload.json) ont tous été
décodés vers des consommateurs SHA, sans extraction d'arbre. Les cinq modèles
stockés sont aussi inversés en mémoire et vérifiés contre leurs SHA officiels.
Le contrôle CRC de 7-Zip et la vérification cryptographique de la signature
updater passent. Le binaire source est comparé intégralement après la seule
substitution documentée du marqueur Tauri UNK vers NSS. Authenticode reste
`NotSigned`. Le [reçu final](audits/2026-11-08/engine-lot4/windows-candidate.json)
contient les chemins, tailles, SHA et preuves liées ; aucun setup n'est exécuté.

Les copies documentaires utilisent des chemins portables et du JSON normalisé.
Les rapports bruts exacts restent dans le cache privé de travail ; leurs SHA et
ceux des copies sont consignés dans
[l'index des preuves](audits/2026-11-08/engine-lot4/evidence-index.json).

Le workflow de
qualité Windows prépare désormais aussi ce worker depuis ses sources avant les
gates complets ; son contrat passe localement, sans exécution GitHub revendiquée.
Le workflow de publication nécessite encore le staging des entrées OCR revues.

## Limites de validation et de distribution

Le poids de 341,52 Mo est celui du **setup compressé** ; le volume logique des
ressources décompressées est d'environ **1,32 Go**, sans mesure physique GUI.
Les validations de la source et du runtime ne prouvent pas un parcours GUI
d'installation/mise à jour. Aucun setup nouveau n'est installé ni publié.
Les anciennes ressources restent conservées ; une mise à jour peut garder les
anciens fichiers inutilisés, dont l'intégrité reste vérifiée. La conversion
LibreOffice reste au profil v3 validé, avec tous ses filtres, polices et locales.
