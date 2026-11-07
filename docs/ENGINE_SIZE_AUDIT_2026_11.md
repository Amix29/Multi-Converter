# Audit du poids des moteurs et du setup — 7 novembre 2026

Statut : **audit et propositions ; aucune optimisation produit appliquée**.
Ce statut décrit l'audit initial. Le mainteneur a ensuite autorisé l'exécution ;
voir [les lots et leurs validations](ENGINE_REDUCTION_EXECUTION.md) pour l'état courant.
Référence : source `19561e1e`, candidate Windows privée du 6 novembre,
fonctionnel `0b003d33`. Les fichiers utilisateur, anciennes installations,
archives et moteurs restent conservés. Aucune préparation Linux/macOS,
extraction de moteur ou reconstruction de setup n'a été lancée.

## Conclusion et recommandation

Le setup fait **999 648 595 octets**, soit **999,65 Mo / 953,34 Mio**.
Le catalogue des fichiers fournis à NSIS totalise **1 405 904 795 octets**,
avant compression externe et hors petit surcoût de désinstallation/bootstrap.
L'exécutable applicatif ne représente que **1,89 %** de ce catalogue.
Les fichiers frontend de production font **643 417 octets** ; ils sont déjà
embarqués dans l'application et ne doivent pas être ajoutés une deuxième fois.

La meilleure première intervention est un conditionnement minimal et vérifié
des moteurs existants, en gardant tous les formats et le fonctionnement local.
LibreOffice est la priorité pour le téléchargement ; les copies d'archives et
les anciennes versions sont une priorité distincte pour le disque installé.
FFmpeg partagé, le runtime OCR ciblé et Pandoc débarrassé de ses symboles suivent.
Une implémentation OCR native est une deuxième étape, conditionnée par la parité.

Un changement `.exe` → `.msi` ou un changement de framework UI ne résout pas
cette composition. Un petit téléchargeur peut réduire le fichier initial sans
réduire les octets nécessaires à toutes les fonctionnalités.

## Mesures et portée des preuves

Méthodes : lecture des déclarations `File /a` du script NSIS généré, tailles
réelles des fichiers sources, répertoires d'installation/données existants,
répertoires centraux ZIP et en-têtes PE/COFF. La simulation Pandoc compresse un
flux vers un compteur d'octets : elle ne produit aucun exécutable modifié.

| Bloc fourni à NSIS | Mo décimaux | Nature de la mesure |
| --- | ---: | --- |
| LibreOffice | 483,80 | ZIP déjà compressé ; 1 513,33 Mo une fois extrait |
| Runtime OCR | 236,81 | ZIP déjà compressé ; 662,04 Mo avec manifeste après extraction |
| Modèles OCR | 185,09 | 21 fichiers + verrou ; cinq modèles conservés |
| Pandoc | 231,07 | Exécutable et notices avant compression NSIS |
| FFmpeg + ffprobe | 202,71 | Deux exécutables statiques de 101,46 et 101,25 Mo |
| libvips | 28,47 | Runtime et licences, 222 fichiers |
| Application Rust/Tauri/Svelte | 26,64 | Exécutable de production |
| PDFium | 11,27 | DLL, wrapper et licences |
| Autres notices/ressources | 0,06 | Quatre petits fichiers |

Ce tableau **n'est pas une ventilation des 999,65 Mo finaux** : les exécutables
se compressent beaucoup mieux que les ZIP et les paramètres de réseaux de
neurones. Les octets ZIP dominent donc encore davantage le téléchargement.

Preuves : [inventaire des fichiers](audits/2026-11-07/engine-size-inventory.json),
[contenu ZIP](audits/2026-11-07/engine-zip-inventory.json),
[inspection Pandoc](audits/2026-11-07/pandoc-pe-compression.json),
[candidate signée pour l'updater](audits/2026-11-06/windows-svelte-installer.json).

L'installation Windows trouvée dans le registre pointe vers un ancien dossier
de QA. Son volume est 1 406,01 Mo, mais son exécutable n'a pas le SHA-256 de la
candidate source actuelle. Elle ne prouve donc pas l'acceptation installée de
cette candidate. Les volumes des données persistantes ci-dessous mélangent
également plusieurs générations.

## 1. LibreOffice : surplus bureautiques mesurés

Le moteur est déjà lancé avec `--headless`, mais ce paramètre ne retire aucun
fichier de la distribution. L'archive contient 19 325 fichiers.

| Ensemble candidat à un conditionnement plus fin | Taille extraite Mo | Données ZIP compressées Mo |
| --- | ---: | ---: |
| Dictionnaires d'extensions, ensemble complet | 475,51 | 117,17 |
| Traductions de l'interface `program/resource` | 274,41 | 81,27 |
| 21 thèmes d'icônes | 75,15 | 59,37 |
| Galerie | 13,25 | 9,32 |
| Aide locale | 11,42 | 5,34 |
| Python LibreOffice | 32,76 | 10,39 |

Les nombres sont des inventaires de candidats, **pas des suppressions toutes
validées ni des gains NSIS garantis**. Les familles se recoupent parfois ;
Python est une piste séparée, à risque plus élevé.

Dans les dictionnaires : les synonymes pèsent 162,92 Mo / 43,25 Mo ZIP, les
fichiers orthographiques 286,41 Mo / 66,27 Mo ZIP, et les fichiers de césure
6,11 Mo / 2,01 Mo ZIP. La césure peut modifier lignes et pagination : conserver
ses données, les locales, ICU, les polices et les filtres de document.
Supprimer aveuglément tous les dictionnaires n'est donc pas acceptable.

Proposition : définir une liste de fichiers de runtime reproductible ; retirer
d'abord aide/galerie, thèmes surnuméraires et synonymes ; conserver une langue
interne de diagnostic et les seules traductions nécessaires. Les langues de
l'interface LibreOffice sont distinctes des langues des documents à convertir.
Nettoyer les déclarations d'extensions en même temps que leurs fichiers.

Conserver Writer/Calc/Impress/Draw et les filtres réellement nécessaires à la
matrice actuelle. Ni l'absence d'éditeur dans Multi-Converter ni le mode
headless ne permettent de retirer ces bibliothèques au hasard. La suppression
de Python, Java ou des composants Base requiert une analyse des filtres et
dépendances ; elle n'entre pas dans les gains faciles promis.

Le [système de build LibreOffice](https://github.com/LibreOffice/core/blob/master/configure.ac)
sépare les langues UI (`--with-lang`) des locales et permet notamment de ne pas
embarquer l'aide locale. La [documentation linguistique](https://help.libreoffice.org/latest/en-US/text/shared/optionen/01010400.html)
sépare orthographe, synonymes et césure. Ces options doivent être adaptées à une
version stable verrouillée, sans compiler ici la branche de développement.

## 2. OCR : alléger le runtime avant de toucher aux modèles

Le contrat actuel impose les cinq modules de `PP-OCRv6_medium` : orientation du
document, redressement UVDoc, orientation des lignes, détection et reconnaissance.
Leur contenu vérifié fait 185 082 003 octets, hors fichier manifeste des modèles.
Ils restent embarqués et utilisables hors ligne.

Le runtime ZIP contient 662 035 027 octets : 660 643 156 octets déclarés dans
le verrou + 1 391 871 octets du manifeste. Ses principaux ensembles sont
Paddle (376,98 Mo), OpenCV (116,23 Mo), le worker (37,24 Mo), les bibliothèques
NumPy (20,98 Mo), Pillow (13,51 Mo), Pandas (13,10 Mo), HF Xet (9,39 Mo) et
un autre PDFium Python (7,22 Mo).

Le build canonique utilise `--collect-all paddle`, `paddleocr` et `paddlex`.
Une spec dite ciblée existe, mais **n'est pas utilisée par cette commande** ;
elle collecte encore tous les sous-modules et ne constitue pas un runtime
réduit validé. Les [hooks PyInstaller](https://pyinstaller.org/en/stable/hooks.html)
permettent des sélections plus précises.

Périmètre candidat, sans chevauchement entre les cinq lignes :

| Candidat OCR | Mo extraits | Mo ZIP |
| --- | ---: | ---: |
| En-têtes, bibliothèques statiques, fichiers de typage | 24,66 | 4,24 |
| OpenCV vidéo / FFmpeg interne | 26,39 | 10,93 |
| HF Xet | 9,39 | 3,82 |
| PDFium Python | 7,22 | 3,59 |
| Codec AVIF Pillow | 7,89 | 4,32 |
| Ensemble candidat | 75,55 | 26,90 |

Le pipeline Rust remet des images préparées au worker, ce qui rend ces dernières
dépendances intéressantes à examiner. Leur retrait doit néanmoins prouver que
les imports dynamiques, les formats préparés et les cinq modules fonctionnent.
Garder les notices, métadonnées nécessaires et manifestes d'intégrité.
Les grosses DLL de calcul MKL/oneDNN ne sont pas des déchets à retirer à la main.

Deuxième étape : comparer un worker natif Paddle Inference et une voie ONNX
Runtime CPU avec pré/post-traitements équivalents. Le [build personnalisé ORT](https://onnxruntime.ai/docs/build/custom.html)
permet de sélectionner les opérateurs requis ; cela ne prouve pas que les cinq
modèles exacts se convertissent correctement. Les builds minimaux ORT ont aussi
des contraintes de format de modèle. La [documentation PaddleOCR](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/deployment/high_performance_inference.html)
signale des limites de conversion/opérateurs selon les modèles.

Aucun runtime natif n'est sélectionné dans cet audit. Changer vers Tesseract,
un modèle mobile, retirer UVDoc ou quantifier en INT8 est une expérience de
qualité séparée, pas une compression sans conséquence. Garder un seul runtime
de production par plateforme, sans cumuler l'ancien et le candidat.

## 3. FFmpeg/ffprobe : partager les bibliothèques et définir les capacités

Les exécutables réels sont `8.1.1-essentials_build-www.gyan.dev`, avec
`--enable-static`, GPL et une longue liste de bibliothèques optionnelles.
Ils pèsent ensemble 202 708 992 octets, dont presque deux fois le même ensemble
de fonctions compilées ; aucune mesure de déduplication exacte n'est revendiquée.

Proposition : même version de FFmpeg, `ffmpeg` et `ffprobe` liés à un seul jeu
cohérent de DLL libav*. La [documentation Windows FFmpeg](https://ffmpeg.org/platform.html)
décrit `--enable-shared`. Conserver les deux outils et la détection fiable.
Verrouiller les DLL et leur recherche locale, les licences et la provenance.

Ensuite, déduire codecs, muxers/demuxers, parseurs, filtres et accélérateurs de
notre véritable matrice ; conserver les formats d'entrée et les cas de secours.
Supprimer d'abord outils interactifs, capture ou protocoles non utilisés si la
matrice et les commandes le prouvent. Une liste de sorties seule ne suffit pas.
Mesurer `--enable-small`/LTO contre les performances, sans retirer les chemins
logiciels au profit d'un GPU qui n'existe pas sur toutes les machines.

## 4. Pandoc : gain sur disque réel, gain setup plus modeste

L'exécutable fait 231 056 136 octets. L'inspection identifie 527 273 symboles
COFF : table de symboles 9 490 914 octets + chaînes 52 514 768 octets, soit
**62 005 682 octets**. Le fichier contient aussi une table de certificat PE ;
une transformation doit traiter la provenance et la signature du nouvel artefact.

Compression de flux mesurée : original 40 032 310 octets en Zlib niveau 9 ;
préfixe avant tables COFF 35 230 662 octets. Écart **4 801 648 octets**.
Ce préfixe est une simulation de compressibilité, pas un EXE utilisable ;
le gain NSIS final et le comportement d'un binaire correctement stripped restent
à vérifier. Annoncer 62 Mo de gain de téléchargement serait faux.

Proposition : produire un artefact Pandoc de distribution sans ces symboles via
un outil de build adapté, en gardant le binaire original de diagnostic à part.
L'[outil de stripping LLVM](https://llvm.org/docs/CommandGuide/llvm-strip.html)
documente ces transformations ; ne pas tronquer un PE manuellement. Vérifier
lecteurs/rédacteurs, `--sandbox`, JSON AST, accents, ressources embarquées et
conversions DOCX/ODT/Markdown/HTML utilisées. Une mise à niveau ou une réécriture
Rust n'est pas nécessaire pour ce premier gain.

## 5. PDFium, libvips et interface : conserver le bon rapport capacité/poids

PDFium ne fait que 11,27 Mo et libvips 28,47 Mo. Le paquet libvips possède déjà
un petit runtime, pas un SDK entier : sa plus grosse DLL est libaom, 5,53 Mo.
Les supprimer ou les remplacer par une suite image plus générale n'est pas une
priorité démontrée. La [distribution officielle libvips](https://www.libvips.org/install.html)
distingue déjà variantes web et all, et expose des options de compilation.
Retirer AOM/HEIF/AVIF ou SVG casserait potentiellement des formats existants.

L'application n'a ni Electron ni runtime Node à distribuer. WebView2 est une
dépendance système partagée ; son cache utilisateur n'est pas un moteur de
conversion embarqué dans les 999,65 Mo. Les optimisations Rust/UI restent
secondaires et ne doivent pas prendre la place du travail sur les moteurs.

## 6. Setup, duplication installée et mises à jour

La configuration actuelle force `compression: zlib` ; le script NSIS utilise
déjà `/SOLID`. LZMA n'est donc pas une découverte non testée : un
[essai historique à charge identique](audits/2026-10-30/windows-nsis-compression-comparison.json)
mesure 999 609 888 → 950 990 375 octets, soit **−4,86 %**, pour 18 min 25 s de
construction LZMA. Ce résultat appartient à un checkpoint antérieur ; il n'a
pas été rejoué aujourd'hui et ne mesure pas la durée d'installation.
La [documentation NSIS](https://nsis.sourceforge.io/Reference/SetCompressor)
explique les compromis algorithme, bloc solide et dictionnaire.

LibreOffice ZIP + runtime OCR ZIP occupent **720 607 293 octets** à eux seuls.
Ils restent dans les ressources lorsque leurs contenus sont décompressés dans
les données locales. À usage complet, le budget calculé est donc environ
**3 581,27 Mo** : 1 405,90 Mo livrés + 1 513,33 Mo LibreOffice + 662,04 Mo OCR,
hors WebView, sorties, fichiers temporaires et anciennes versions.

Proposition : une seule copie exécutable installée par moteur/version, vérifiée
par manifeste. Le setup assure la compression de transport ; le produit
résout directement le runtime installé. Cela pourrait éliminer les **720,61 Mo
de ZIP persistants** après usage complet, avant même l'élagage des moteurs.
En contrepartie, une installation complète matérialiserait les runtimes dès
l'installation ; le point de référence après usage serait proche de 2 860,66 Mo.
La réparation hors ligne doit réutiliser le setup ou un pack explicite. Changer
seulement le format des ZIP ne corrige pas cette duplication.

Le resolver OCR indexe actuellement un cache par hash sans ramasse-miettes des
anciennes versions dans ce chemin. Quatre runtimes sont présents sur cette
machine : total 2 734,09 Mo, dont environ **2 072,05 Mo** pour trois générations
différentes du verrou courant. Ce sont des données de plusieurs versions de
développement, pas une obligation de chaque installation neuve.

Autres mesures historiques distinctes : 310,84 Mo de cache WebView et 5 315,10 Mo
dans l'ancien emplacement `Local/Multi-Converter`, dont 3 300,71 Mo de `tool-env`.
**Aucun de ces dossiers n'a été nettoyé**. Le nettoyage futur doit identifier
les consommateurs, les jobs actifs et les versions de retour arrière, préserver
les données utilisateur, puis appliquer une politique bornée. Ne pas effacer
un ancien runtime utilisé par un autre checkout de développement.

Les mises à jour actuelles livrent le setup complet. À terme, versionner les
packs de moteurs indépendamment de l'interface éviterait de retransférer OCR
et LibreOffice pour une correction CSS. Contrats à prévoir : signature du
catalogue/paquets, hash, OS/architecture/ABI, dépendances, admission d'espace,
installation atomique, verrou d'usage et retour arrière borné.

## Comparaison de stratégies réelles

Il n'existe pas de classement universel de « meilleur moteur » : il faut comparer
couverture, fidélité, autonomie, licence et maintenance à périmètre égal.
Les exemples ci-dessous sont documentés, pas installés ou benchmarkés ici.

| Projet | Observation de source primaire | Enseignement pour Multi-Converter |
| --- | --- | --- |
| HandBrake | Le setup Windows x64 1.11.2 est annoncé à 24,2 MB. Son build FFmpeg sélectionne filtres, encodeurs et conteneurs et désactive les programmes FFmpeg externes. | Compiler les capacités utiles et intégrer/partager les bibliothèques ; son périmètre vidéo n'inclut pas notre suite Office/OCR. |
| Shutter Encoder | Utilise FFmpeg pour ses conversions audio/vidéo/images. | Garder ce moteur reconnu ; le bénéfice vient du conditionnement et du périmètre, pas d'un codec miracle. |
| File Converter | Indique qu'un Microsoft Office installé et activé est nécessaire aux conversions Office. | Une dépendance externalisée allège le setup en transférant le coût à une autre installation ; ce n'est pas l'autonomie actuelle de Multi-Converter. |
| XnConvert | Catalogue officiel : setup Windows x64 1.118.0 de 26M ; projet consacré aux images. | Large couverture image possible avec un moteur ciblé ; ne pas comparer ce poids à vidéo + Office + cinq modèles OCR. |
| NAPS2 | Demande le téléchargement des langues lors du premier usage OCR. | Exemple de modularité explicite ; ne pas copier ce comportement silencieusement dans notre contrat hors ligne. |
| PDF24 Creator | Présente sa version desktop comme solution PDF hors ligne. | La confidentialité n'impose pas le cloud ; ce site ne démontre pas l'équivalence avec notre OCR/matrice complète. |

Sources : [HandBrake, actifs officiels](https://github.com/HandBrake/HandBrake/releases/tag/1.11.2),
[build FFmpeg HandBrake](https://github.com/HandBrake/HandBrake/blob/master/contrib/ffmpeg/module.defs),
[Shutter Encoder](https://www.shutterencoder.com/),
[File Converter et dépendance Office](https://file-converter.io/),
[catalogue XnConvert](https://download.xnview.com/versions/XnConvert/),
[NAPS2 OCR](https://www.naps2.com/doc/ocr),
[PDF24 desktop](https://tools.pdf24.org/en/pdf24-creator).
Les tailles affichées sont celles des éditeurs au moment de la consultation,
avec leurs unités ; elles n'incluent pas forcément les prérequis externes.

## Plan proposé et critères d'acceptation

Les tailles suivantes sont des **objectifs de conception, pas des résultats**.
Les gains se chevauchent : ne pas additionner des économies ZIP, raw, cache et
compression sans reconstruire puis mesurer le paquet final.

| Lot | Contenu | Cible et preuve exigée |
| --- | --- | --- |
| A — Allègement conservateur | LibreOffice minimal, OCR Python ciblé, Pandoc stripped, comparaison FFmpeg partagé | Premier setup complet sous 800 Mo ; hypothèse de travail 650–800 Mo, à confirmer. Tous les formats et cinq modèles restent présents. |
| B — Runtime et stockage | Une copie installée par runtime, cache borné, provenance et budgets ; prototype OCR natif comparé | Objectif 400–600 Mo pour le complet si la parité native permet les gains attendus ; aucun engagement avant mesure. Réduction disque séparément démontrée. |
| C — Distribution modulaire optionnelle | Petit socle média/images/PDF texte, packs Office et OCR explicites, variante complète hors ligne | Socle optimisé visé 80–150 Mo, **sans** Office/OCR/Pandoc embarqués ; téléchargement total complet annoncé séparément. |

Le lot C est une proposition de changement produit/distribution : les règles
actuelles interdisent les téléchargements de modèles à l'exécution, imposent
l'OCR embarqué et fixent strictement les actifs de release. Rien de cela n'est
modifié ici. Une voie compatible avec l'usage hors ligne serait l'import manuel
de packs locaux signés ; une édition complète resterait nécessaire pour
« tout fonctionne après une installation sans réseau ».

Ordre recommandé : **A, puis B ; C seulement si une édition modulaire est voulue**.
Limiter la première expérimentation à un moteur à la fois et à un espace de
travail borné, sans copier plusieurs arbres de moteurs ni reconstruire les
trois plateformes en parallèle sur ce PC.

Validation avant adoption :

1. Mesurer octets du setup, installation neuve, après premier Office/OCR,
   pic temporaire, démarrage froid et temps d'installation. Comparer aussi
   les volumes téléchargés sur une mise à jour d'interface seule.
2. Exécuter la matrice complète des conversions réelles ; contrôler lisibilité,
   accents, profils couleur, orientation, ICO et GIF animé/statique. Comparer
   nombre de pages, tableaux, césure, polices et rendu Office sur corpus fixe.
3. Rejouer les 40 cas OCR verrouillés, les seuils existants et les PDF scannés/
   mixtes ; ajouter documents multilingues, déformés et petits caractères pour
   tester les coupes de dépendances. Contrôler temps, mémoire, hors ligne,
   annulation, reprise et intégrité des originaux, pas seulement un score moyen.
4. Tester chaque variante réellement installée : DLL absente, moteur corrompu,
   disque insuffisant, mise à jour, retour arrière, seconde ouverture et
   désinstallation. Ne pas confondre tests de protocole et validation produit.
5. Vérifier licences/notices, verrous/hashes et signatures de l'artefact final ;
   ajouter des budgets de taille par moteur et par setup dans les contrôles CI.
   macOS/Linux nécessiteront leurs preuves natives quand ces travaux reprendront.

Les contrôles effectués pour cet audit sont des mesures de fichiers, inspections
de structure et recherches de sources primaires ; aucune nouvelle parité de
conversion, aucun nouveau paquet optimisé ni acceptation de release n'est revendiqué.
