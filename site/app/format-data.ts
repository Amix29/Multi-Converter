import { conversionPages } from "./conversion-data";

export type FormatPage = {
  slug: string;
  name: string;
  longName: string;
  category: "Document" | "Données" | "Image" | "Audio" | "Vidéo";
  title: string;
  description: string;
  h1: string;
  intro: string;
  localUse: string;
  commonUses: string[];
  qualityTips: string[];
};

const coreFormatPages: FormatPage[] = [
  {
    slug: "pdf",
    name: "PDF",
    longName: "Portable Document Format",
    category: "Document",
    title: "Format PDF : conversion locale sur Windows",
    description:
      "Convertissez des fichiers PDF localement avec Multi-Converter, sans envoyer vos documents vers un service cloud.",
    h1: "Convertir des fichiers PDF localement",
    intro:
      "PDF est un format courant pour partager des documents figés. Il peut contenir du texte, des images, des formulaires ou des pages scannées, ce qui rend certaines conversions plus délicates.",
    localUse:
      "Un convertisseur PDF local est utile pour les contrats, factures, cours, archives ou documents internes que vous ne voulez pas téléverser sur un site tiers.",
    commonUses: [
      "Transformer un PDF en format web ou document éditable lorsque le fichier le permet.",
      "Préparer des documents pour l'archivage ou le partage.",
      "Extraire ou convertir certains contenus sans passer par un service en ligne."
    ],
    qualityTips: [
      "Vérifiez toujours la mise en page après conversion, surtout pour les tableaux et documents scannés.",
      "Gardez le PDF source tant que le résultat n'est pas validé.",
      "Utilisez l'extension Maximum Quality pour les documents complexes si l'option est disponible."
    ]
  },
  {
    slug: "docx",
    name: "DOCX",
    longName: "Microsoft Word Open XML Document",
    category: "Document",
    title: "Convertisseur DOCX local",
    description:
      "Convertissez des documents DOCX depuis Windows avec un outil gratuit, local et open source.",
    h1: "Convertir des fichiers DOCX sur son PC",
    intro:
      "DOCX est le format moderne le plus courant pour les documents Word. Il peut contenir styles, images, tableaux, en-têtes et pieds de page.",
    localUse:
      "Convertir DOCX localement permet de traiter CV, rapports, devis, notes ou documents professionnels sans upload obligatoire.",
    commonUses: [
      "Exporter un document vers PDF pour le partager plus facilement.",
      "Transformer un document en format compatible avec d'autres outils.",
      "Préparer une version finale tout en gardant le fichier source modifiable."
    ],
    qualityTips: [
      "Installez les polices utilisées par le document avant conversion.",
      "Vérifiez les tableaux, sauts de page et en-têtes dans le fichier final.",
      "Préférez les moteurs de qualité maximale pour les documents très mis en forme."
    ]
  },
  {
    slug: "csv",
    name: "CSV",
    longName: "Comma-Separated Values",
    category: "Données",
    title: "Convertisseur CSV local",
    description:
      "Convertissez des fichiers CSV localement pour transformer des données tabulaires sans envoyer vos exports en ligne.",
    h1: "Convertir des fichiers CSV localement",
    intro:
      "CSV est un format simple pour stocker des données en lignes et colonnes. Il est utilisé par les tableurs, exports métier, bases de données et outils d'analyse.",
    localUse:
      "Les fichiers CSV contiennent souvent des données clients, listes internes ou exports de travail. Une conversion locale réduit le risque de fuite par upload.",
    commonUses: [
      "Convertir CSV en JSON pour une application ou une API.",
      "Nettoyer des exports avant analyse.",
      "Passer d'un format tabulaire à un format plus structuré."
    ],
    qualityTips: [
      "Vérifiez le séparateur utilisé par le fichier : virgule, point-virgule ou tabulation.",
      "Gardez une première ligne de colonnes claire.",
      "Contrôlez l'encodage si le fichier contient des accents."
    ]
  },
  {
    slug: "json",
    name: "JSON",
    longName: "JavaScript Object Notation",
    category: "Données",
    title: "Convertisseur JSON local",
    description:
      "Convertissez des fichiers JSON localement avec Multi-Converter pour préparer des données sans service cloud.",
    h1: "Convertir des fichiers JSON sur Windows",
    intro:
      "JSON est un format de données structuré très utilisé par les applications, API et scripts. Il peut être plat ou fortement imbriqué.",
    localUse:
      "Un convertisseur JSON local aide à traiter des exports techniques ou données internes sans les copier dans un outil web.",
    commonUses: [
      "Convertir JSON en CSV pour ouvrir les données dans un tableur.",
      "Préparer un fichier pour une analyse ou une migration.",
      "Contrôler des exports d'API dans un format plus lisible."
    ],
    qualityTips: [
      "Validez la syntaxe JSON avant conversion.",
      "Les structures imbriquées peuvent demander une vérification manuelle après conversion.",
      "Conservez le fichier source pour comparer les champs."
    ]
  },
  {
    slug: "png",
    name: "PNG",
    longName: "Portable Network Graphics",
    category: "Image",
    title: "Convertisseur PNG local",
    description:
      "Convertissez des images PNG localement vers WebP, JPG ou d'autres formats selon les moteurs disponibles.",
    h1: "Convertir des images PNG localement",
    intro:
      "PNG est un format d'image courant pour les captures, interfaces, icônes et visuels avec transparence.",
    localUse:
      "La conversion locale est utile pour les captures d'écran, ressources graphiques, maquettes ou visuels non publics.",
    commonUses: [
      "Convertir PNG en WebP pour alléger une page web.",
      "Préparer des images pour une documentation ou une application.",
      "Transformer un visuel vers un format plus compatible."
    ],
    qualityTips: [
      "Vérifiez la transparence après conversion.",
      "Gardez le PNG source si vous avez besoin d'une version sans perte.",
      "Comparez le poids et la netteté du fichier final."
    ]
  },
  {
    slug: "jpg",
    name: "JPG",
    longName: "JPEG Image",
    category: "Image",
    title: "Convertisseur JPG local",
    description:
      "Convertissez des images JPG ou JPEG sur Windows avec Multi-Converter, sans upload obligatoire.",
    h1: "Convertir des fichiers JPG sur son PC",
    intro:
      "JPG est un format photo très répandu. Il compresse les images avec perte, ce qui le rend léger mais moins adapté aux éditions répétées.",
    localUse:
      "Convertir JPG localement évite d'envoyer des photos personnelles, visuels produit ou images de travail à un service tiers.",
    commonUses: [
      "Convertir JPG en PNG pour certains usages d'édition.",
      "Préparer des images pour une application ou une documentation.",
      "Changer de format lorsque l'outil cible refuse JPEG."
    ],
    qualityTips: [
      "Un passage vers PNG ne restaure pas les détails déjà perdus par JPEG.",
      "Évitez les conversions répétées avec perte.",
      "Gardez les originaux si vous devez retravailler les images."
    ]
  },
  {
    slug: "svg",
    name: "SVG",
    longName: "Scalable Vector Graphics",
    category: "Image",
    title: "Convertisseur SVG local",
    description:
      "Convertissez des fichiers SVG localement vers PNG ou d'autres formats compatibles selon les options disponibles.",
    h1: "Convertir des fichiers SVG localement",
    intro:
      "SVG est un format vectoriel utilisé pour les icônes, logos et illustrations. Il se redimensionne sans perte mais n'est pas accepté partout.",
    localUse:
      "Un convertisseur SVG local aide à exporter des ressources de marque ou maquettes sans les déposer sur un service web.",
    commonUses: [
      "Convertir SVG en PNG pour obtenir une image bitmap compatible.",
      "Préparer des icônes pour une documentation ou un logiciel.",
      "Exporter un logo dans une taille fixe."
    ],
    qualityTips: [
      "Choisissez une taille de sortie suffisante pour éviter le flou.",
      "Vérifiez les polices si le SVG contient du texte.",
      "Conservez le SVG source pour créer d'autres dimensions plus tard."
    ]
  },
  {
    slug: "webp",
    name: "WebP",
    longName: "WebP Image",
    category: "Image",
    title: "Convertisseur WebP local",
    description:
      "Convertissez des images WebP localement pour préparer des visuels web ou obtenir un format plus compatible.",
    h1: "Convertir des images WebP sur Windows",
    intro:
      "WebP est un format d'image moderne souvent utilisé sur le web pour réduire le poids des pages.",
    localUse:
      "La conversion WebP locale aide à traiter des images de site, exports ou visuels privés sans passer par un outil en ligne.",
    commonUses: [
      "Convertir WebP vers un format accepté par un logiciel plus ancien.",
      "Préparer des images web plus légères.",
      "Comparer qualité visuelle et poids du fichier."
    ],
    qualityTips: [
      "Contrôlez les zones transparentes après conversion.",
      "Vérifiez la compatibilité du format cible avec votre outil.",
      "Gardez une version source si vous devez retravailler l'image."
    ]
  },
  {
    slug: "mp4",
    name: "MP4",
    longName: "MPEG-4 Video",
    category: "Vidéo",
    title: "Convertisseur MP4 local pour Windows",
    description:
      "Convertissez ou extrayez des fichiers MP4 localement avec Multi-Converter, sans envoyer vos vidéos vers le cloud.",
    h1: "Convertir des fichiers MP4 localement",
    intro:
      "MP4 est l'un des formats vidéo les plus compatibles. Il peut contenir vidéo, audio, sous-titres et métadonnées selon le fichier.",
    localUse:
      "Les vidéos sont souvent lourdes ou privées. Une conversion locale évite les uploads longs et les limites de taille des services gratuits.",
    commonUses: [
      "Extraire l'audio d'une vidéo MP4 vers MP3.",
      "Préparer une vidéo pour un lecteur ou une plateforme.",
      "Réduire la dépendance aux convertisseurs vidéo en ligne."
    ],
    qualityTips: [
      "Vérifiez la synchronisation audio après conversion.",
      "Gardez la vidéo source tant que le résultat n'est pas validé.",
      "Prévoyez du temps et de l'espace disque pour les gros fichiers."
    ]
  },
  {
    slug: "mov",
    name: "MOV",
    longName: "QuickTime Movie",
    category: "Vidéo",
    title: "Convertisseur MOV local",
    description:
      "Convertissez des vidéos MOV localement vers MP4 ou d'autres formats selon les moteurs disponibles.",
    h1: "Convertir des fichiers MOV sur Windows",
    intro:
      "MOV est fréquent sur les appareils Apple et dans certains workflows vidéo. MP4 est souvent plus simple à partager.",
    localUse:
      "Convertir MOV localement évite de téléverser des vidéos personnelles ou professionnelles vers un service de conversion.",
    commonUses: [
      "Convertir MOV en MP4 pour améliorer la compatibilité.",
      "Préparer une vidéo pour un outil de montage ou de partage.",
      "Garder les fichiers lourds sur son disque pendant le traitement."
    ],
    qualityTips: [
      "Vérifiez l'audio, l'image et la durée après conversion.",
      "Gardez le MOV source tant que le MP4 n'est pas validé.",
      "Les vidéos longues peuvent prendre du temps selon votre PC."
    ]
  },
  {
    slug: "mkv",
    name: "MKV",
    longName: "Matroska Video",
    category: "Vidéo",
    title: "Convertisseur MKV local",
    description:
      "Convertissez des vidéos MKV localement vers MP4 pour une meilleure compatibilité avec certains lecteurs.",
    h1: "Convertir des fichiers MKV localement",
    intro:
      "MKV est un conteneur vidéo flexible qui peut contenir plusieurs pistes audio, sous-titres et chapitres.",
    localUse:
      "Les fichiers MKV peuvent être volumineux. Les traiter localement évite les longs uploads et garde le contrôle sur le fichier.",
    commonUses: [
      "Convertir MKV en MP4 pour un lecteur ou une plateforme.",
      "Préparer une version plus simple à partager.",
      "Adapter une vidéo à un workflow plus compatible."
    ],
    qualityTips: [
      "Vérifiez les sous-titres et pistes audio après conversion.",
      "Prévoyez de l'espace disque pour le fichier de sortie.",
      "Conservez le MKV source si plusieurs pistes doivent être préservées."
    ]
  },
  {
    slug: "mp3",
    name: "MP3",
    longName: "MPEG Audio Layer III",
    category: "Audio",
    title: "Convertisseur MP3 local",
    description:
      "Convertissez des fichiers MP3 ou extrayez de l'audio localement avec Multi-Converter sur Windows.",
    h1: "Convertir des fichiers MP3 localement",
    intro:
      "MP3 est un format audio compressé très compatible. Il est pratique pour l'écoute, le partage et l'archivage léger.",
    localUse:
      "Un convertisseur MP3 local permet de traiter enregistrements, exports audio ou pistes privées sans passer par un service cloud.",
    commonUses: [
      "Extraire l'audio d'une vidéo vers MP3.",
      "Convertir un fichier WAV plus lourd vers MP3.",
      "Préparer un fichier audio compatible avec de nombreux lecteurs."
    ],
    qualityTips: [
      "MP3 est un format avec perte : gardez une source non compressée si elle existe.",
      "Évitez les recompressions répétées.",
      "Écoutez le résultat final pour vérifier les artefacts."
    ]
  },
  {
    slug: "wav",
    name: "WAV",
    longName: "Waveform Audio File Format",
    category: "Audio",
    title: "Convertisseur WAV local",
    description:
      "Convertissez des fichiers WAV localement vers MP3 ou d'autres formats audio compatibles.",
    h1: "Convertir des fichiers WAV sur Windows",
    intro:
      "WAV est un format audio souvent non compressé, utilisé pour l'enregistrement et le montage. Il peut produire des fichiers volumineux.",
    localUse:
      "Convertir WAV localement est utile pour les voix, sons de travail, extraits audio ou fichiers que vous ne voulez pas envoyer en ligne.",
    commonUses: [
      "Convertir WAV en MP3 pour réduire le poids.",
      "Préparer un fichier audio pour partage ou lecture courante.",
      "Conserver une source de meilleure qualité pour le montage."
    ],
    qualityTips: [
      "Gardez le WAV original pour les modifications futures.",
      "Utilisez MP3 pour le partage, pas comme unique archive de qualité.",
      "Vérifiez le volume et les coupures après conversion."
    ]
  },
  {
    slug: "txt",
    name: "TXT",
    longName: "Plain Text File",
    category: "Document",
    title: "Convertisseur TXT local",
    description:
      "Convertissez des fichiers TXT ou texte brut localement avec Multi-Converter, sans envoyer vos notes ou exports en ligne.",
    h1: "Convertir des fichiers TXT localement",
    intro:
      "TXT est un format texte simple utilisé pour les notes, journaux, exports et contenus sans mise en forme complexe.",
    localUse:
      "Un convertisseur TXT local est utile pour traiter des notes, logs ou exports internes sans les copier dans un outil web.",
    commonUses: [
      "Préparer un texte pour un format document ou web selon les moteurs disponibles.",
      "Nettoyer des contenus simples avant conversion.",
      "Traiter des fichiers texte issus d'outils métier ou de scripts."
    ],
    qualityTips: [
      "Vérifiez l'encodage si le fichier contient des accents.",
      "Gardez une structure claire avec des lignes et titres lisibles.",
      "Contrôlez le résultat si le fichier contient des caractères spéciaux."
    ]
  },
  {
    slug: "html",
    name: "HTML",
    longName: "HyperText Markup Language",
    category: "Document",
    title: "Convertisseur HTML local",
    description:
      "Convertissez des fichiers HTML localement avec Multi-Converter pour préparer documents, pages ou exports web.",
    h1: "Convertir des fichiers HTML sur Windows",
    intro:
      "HTML structure les pages web et certains exports de documentation. Il peut contenir du texte, des liens, des tableaux et des références à des images.",
    localUse:
      "Convertir HTML localement permet de travailler sur une page, une documentation ou un export sans transmettre le contenu à un service tiers.",
    commonUses: [
      "Préparer une page HTML pour un autre format documentaire.",
      "Convertir un contenu web vers un format plus facile à partager.",
      "Tester un export HTML avant publication ou archivage."
    ],
    qualityTips: [
      "Gardez les images et fichiers liés dans un dossier cohérent.",
      "Vérifiez les liens internes après conversion.",
      "Utilisez Maximum Quality si Pandoc est nécessaire pour un document plus structuré."
    ]
  },
  {
    slug: "odt",
    name: "ODT",
    longName: "OpenDocument Text",
    category: "Document",
    title: "Convertisseur ODT local",
    description:
      "Convertissez des documents ODT localement sur Windows avec Multi-Converter et ses moteurs disponibles.",
    h1: "Convertir des fichiers ODT localement",
    intro:
      "ODT est un format de document ouvert utilisé notamment par LibreOffice et d'autres suites bureautiques.",
    localUse:
      "Un convertisseur ODT local aide à traiter rapports, documents administratifs ou fichiers bureautiques sans upload obligatoire.",
    commonUses: [
      "Préparer un document ODT pour partage.",
      "Transformer un document bureautique vers un format plus compatible.",
      "Archiver un document issu de LibreOffice ou OpenOffice."
    ],
    qualityTips: [
      "Vérifiez les styles, tableaux et sauts de page.",
      "Installez les polices nécessaires avant conversion.",
      "L'extension Maximum Quality peut améliorer les conversions bureautiques complexes."
    ]
  },
  {
    slug: "rtf",
    name: "RTF",
    longName: "Rich Text Format",
    category: "Document",
    title: "Convertisseur RTF local",
    description:
      "Convertissez des fichiers RTF localement pour traiter des documents texte mis en forme sans service cloud.",
    h1: "Convertir des fichiers RTF sur son PC",
    intro:
      "RTF est un format texte enrichi compatible avec de nombreux éditeurs. Il peut contenir gras, italique, listes et éléments de mise en forme simples.",
    localUse:
      "Convertir RTF localement est utile pour des documents anciens, notes de travail ou fichiers reçus que vous voulez garder sur votre machine.",
    commonUses: [
      "Transformer un RTF vers un format plus actuel.",
      "Préparer un document texte pour partage.",
      "Récupérer un contenu avec mise en forme simple."
    ],
    qualityTips: [
      "Contrôlez la mise en forme après conversion.",
      "Gardez le fichier original si le document contient des tableaux.",
      "Vérifiez les caractères accentués et symboles."
    ]
  },
  {
    slug: "epub",
    name: "EPUB",
    longName: "Electronic Publication",
    category: "Document",
    title: "Convertisseur EPUB local",
    description:
      "Convertissez des fichiers EPUB localement avec Multi-Converter pour préparer ou transformer des publications numériques.",
    h1: "Convertir des fichiers EPUB localement",
    intro:
      "EPUB est un format courant pour les livres numériques et publications structurées.",
    localUse:
      "Un convertisseur EPUB local permet de manipuler une publication numérique sans l'envoyer à un outil web.",
    commonUses: [
      "Préparer un contenu EPUB pour un autre format documentaire.",
      "Tester une publication numérique avant archivage.",
      "Travailler sur des contenus longs structurés."
    ],
    qualityTips: [
      "Vérifiez la table des matières après conversion.",
      "Contrôlez les images intégrées et les liens internes.",
      "Pandoc via Maximum Quality peut être utile pour les publications structurées."
    ]
  },
  {
    slug: "xml",
    name: "XML",
    longName: "Extensible Markup Language",
    category: "Données",
    title: "Convertisseur XML local",
    description:
      "Convertissez ou préparez des fichiers XML localement avec Multi-Converter pour garder vos données sur votre PC.",
    h1: "Convertir des fichiers XML localement",
    intro:
      "XML est un format de données structuré utilisé par des applications, exports techniques, flux et fichiers de configuration.",
    localUse:
      "Convertir XML localement réduit l'exposition des exports techniques, configurations ou données internes.",
    commonUses: [
      "Préparer un fichier XML pour un autre format de données.",
      "Traiter des exports techniques sans outil en ligne.",
      "Comparer une structure XML avant transformation."
    ],
    qualityTips: [
      "Validez la structure XML avant conversion.",
      "Conservez le fichier source pour comparer les balises.",
      "Les XML très imbriqués peuvent nécessiter un contrôle manuel."
    ]
  },
  {
    slug: "tiff",
    name: "TIFF",
    longName: "Tagged Image File Format",
    category: "Image",
    title: "Convertisseur TIFF local",
    description:
      "Convertissez des images TIFF localement avec Multi-Converter pour traiter scans, archives ou visuels volumineux.",
    h1: "Convertir des fichiers TIFF localement",
    intro:
      "TIFF est souvent utilisé pour des scans, images haute qualité ou archives graphiques. Les fichiers peuvent être lourds.",
    localUse:
      "Un convertisseur TIFF local évite d'envoyer des scans ou images sensibles vers un service de conversion en ligne.",
    commonUses: [
      "Transformer un TIFF vers un format image plus léger.",
      "Préparer des scans pour partage ou documentation.",
      "Traiter des images haute définition depuis le disque local."
    ],
    qualityTips: [
      "Vérifiez la résolution après conversion.",
      "Gardez le TIFF source si c'est une archive qualité.",
      "Prévoyez de l'espace disque pour les fichiers volumineux."
    ]
  },
  {
    slug: "bmp",
    name: "BMP",
    longName: "Bitmap Image File",
    category: "Image",
    title: "Convertisseur BMP local",
    description:
      "Convertissez des images BMP localement sur Windows pour obtenir un format plus léger ou plus compatible.",
    h1: "Convertir des fichiers BMP sur Windows",
    intro:
      "BMP est un format bitmap ancien et souvent volumineux, encore rencontré dans certains logiciels ou ressources Windows.",
    localUse:
      "Convertir BMP localement est pratique pour alléger des images ou les adapter sans utiliser de convertisseur web.",
    commonUses: [
      "Passer d'un BMP à un format image plus moderne.",
      "Préparer des ressources graphiques pour une application.",
      "Réduire le poids de fichiers bitmap anciens."
    ],
    qualityTips: [
      "Comparez le poids avant et après conversion.",
      "Vérifiez les couleurs et zones transparentes si nécessaire.",
      "Gardez l'original si le BMP sert de ressource technique."
    ]
  },
  {
    slug: "ico",
    name: "ICO",
    longName: "Icon File",
    category: "Image",
    title: "Convertisseur ICO local",
    description:
      "Convertissez des fichiers ICO localement pour gérer icônes, favicons et ressources d'interface.",
    h1: "Convertir des fichiers ICO localement",
    intro:
      "ICO est un format d'icône utilisé par Windows, les applications et certains favicons de sites.",
    localUse:
      "Un convertisseur ICO local aide à manipuler des ressources d'interface ou de marque sans les envoyer en ligne.",
    commonUses: [
      "Préparer une icône pour une application Windows.",
      "Transformer une icône vers un format image courant.",
      "Contrôler plusieurs tailles d'icônes."
    ],
    qualityTips: [
      "Vérifiez le rendu aux petites tailles.",
      "Gardez une source haute résolution pour recréer l'icône.",
      "Contrôlez les bords transparents après conversion."
    ]
  },
  {
    slug: "aac",
    name: "AAC",
    longName: "Advanced Audio Coding",
    category: "Audio",
    title: "Convertisseur AAC local",
    description:
      "Convertissez des fichiers AAC ou M4A localement avec Multi-Converter pour traiter vos audios sans upload obligatoire.",
    h1: "Convertir des fichiers AAC localement",
    intro:
      "AAC est un format audio compressé courant dans les appareils mobiles, plateformes et fichiers M4A.",
    localUse:
      "Convertir AAC localement permet de garder enregistrements, voix ou pistes audio sur son ordinateur.",
    commonUses: [
      "Préparer un fichier audio pour un lecteur différent.",
      "Transformer un audio mobile vers un format plus compatible.",
      "Gérer des pistes audio sans service cloud."
    ],
    qualityTips: [
      "Évitez les recompressions successives.",
      "Écoutez le résultat final pour repérer les artefacts.",
      "Gardez la source si elle est de meilleure qualité."
    ]
  },
  {
    slug: "flac",
    name: "FLAC",
    longName: "Free Lossless Audio Codec",
    category: "Audio",
    title: "Convertisseur FLAC local",
    description:
      "Convertissez des fichiers FLAC localement sur Windows pour préparer des audios sans perte ou des versions plus légères.",
    h1: "Convertir des fichiers FLAC sur son PC",
    intro:
      "FLAC est un format audio sans perte apprécié pour l'archivage et l'écoute de qualité.",
    localUse:
      "Un convertisseur FLAC local permet de créer des versions compatibles ou plus légères sans envoyer les fichiers audio en ligne.",
    commonUses: [
      "Créer une version MP3 plus légère selon les options disponibles.",
      "Préparer une bibliothèque audio pour différents lecteurs.",
      "Conserver une source sans perte pour l'archive."
    ],
    qualityTips: [
      "Gardez le FLAC original pour conserver la qualité maximale.",
      "Utilisez un format compressé seulement pour le partage ou l'écoute courante.",
      "Vérifiez le volume et la durée après conversion."
    ]
  },
  {
    slug: "ogg",
    name: "OGG",
    longName: "Ogg Audio",
    category: "Audio",
    title: "Convertisseur OGG local",
    description:
      "Convertissez des fichiers OGG localement avec Multi-Converter pour adapter des pistes audio sans passer par le cloud.",
    h1: "Convertir des fichiers OGG localement",
    intro:
      "OGG est un conteneur audio libre utilisé pour certains fichiers musicaux, sons de jeux ou ressources web.",
    localUse:
      "Convertir OGG localement aide à traiter des sons de projet, pistes ou ressources privées sans upload.",
    commonUses: [
      "Adapter un fichier OGG à un lecteur plus courant.",
      "Préparer des ressources audio pour un projet.",
      "Garder le traitement audio sur son ordinateur."
    ],
    qualityTips: [
      "Écoutez le résultat pour vérifier la qualité.",
      "Conservez la source avant toute recompression.",
      "Contrôlez la compatibilité du format cible."
    ]
  },
  {
    slug: "opus",
    name: "OPUS",
    longName: "Opus Audio",
    category: "Audio",
    title: "Convertisseur OPUS local",
    description:
      "Convertissez des fichiers OPUS localement pour traiter messages vocaux, pistes web ou audios compressés.",
    h1: "Convertir des fichiers OPUS sur Windows",
    intro:
      "OPUS est un codec audio moderne utilisé pour la voix, le streaming et certains fichiers issus d'applications de messagerie.",
    localUse:
      "Un convertisseur OPUS local est utile pour garder des messages vocaux ou audios privés sur votre machine pendant le traitement.",
    commonUses: [
      "Adapter un fichier OPUS à un lecteur ou outil de montage.",
      "Préparer une piste vocale pour archivage.",
      "Transformer un audio compressé sans l'envoyer en ligne."
    ],
    qualityTips: [
      "Vérifiez l'intelligibilité de la voix après conversion.",
      "Évitez les conversions répétées avec perte.",
      "Gardez le fichier source si l'audio est important."
    ]
  },
  {
    slug: "avi",
    name: "AVI",
    longName: "Audio Video Interleave",
    category: "Vidéo",
    title: "Convertisseur AVI local",
    description:
      "Convertissez des vidéos AVI localement sur Windows avec Multi-Converter, sans upload obligatoire.",
    h1: "Convertir des fichiers AVI localement",
    intro:
      "AVI est un ancien conteneur vidéo encore présent dans des archives, caméras et logiciels historiques.",
    localUse:
      "Convertir AVI localement évite d'envoyer de gros fichiers vidéo ou archives personnelles à un service web.",
    commonUses: [
      "Préparer une vidéo AVI pour un lecteur plus récent.",
      "Transformer une archive vidéo vers un format plus compatible.",
      "Garder les vidéos volumineuses sur le disque local."
    ],
    qualityTips: [
      "Vérifiez l'audio et l'image après conversion.",
      "Conservez l'AVI original jusqu'à validation.",
      "Les codecs anciens peuvent demander un moteur compatible."
    ]
  },
  {
    slug: "wmv",
    name: "WMV",
    longName: "Windows Media Video",
    category: "Vidéo",
    title: "Convertisseur WMV local",
    description:
      "Convertissez des fichiers WMV localement pour rendre des vidéos Windows plus compatibles.",
    h1: "Convertir des fichiers WMV sur Windows",
    intro:
      "WMV est un format vidéo Microsoft utilisé dans certaines anciennes archives et présentations.",
    localUse:
      "Un convertisseur WMV local permet de moderniser des vidéos sans dépendre d'un service de conversion en ligne.",
    commonUses: [
      "Adapter une vidéo WMV à un lecteur plus courant.",
      "Préparer une archive vidéo pour partage.",
      "Traiter des vidéos d'entreprise ou anciennes localement."
    ],
    qualityTips: [
      "Testez la lecture complète du fichier converti.",
      "Vérifiez la synchronisation audio.",
      "Gardez la source si le codec est ancien ou rare."
    ]
  },
  {
    slug: "3gp",
    name: "3GP",
    longName: "3GPP Multimedia File",
    category: "Vidéo",
    title: "Convertisseur 3GP local",
    description:
      "Convertissez des vidéos 3GP localement pour récupérer ou moderniser des fichiers issus d'anciens téléphones.",
    h1: "Convertir des fichiers 3GP localement",
    intro:
      "3GP est un format vidéo mobile ancien, souvent associé aux téléphones et archives basse résolution.",
    localUse:
      "Convertir 3GP localement est utile pour récupérer des vidéos personnelles anciennes sans les envoyer en ligne.",
    commonUses: [
      "Adapter une vidéo 3GP à un format plus moderne.",
      "Archiver d'anciens fichiers mobiles.",
      "Préparer une vidéo pour lecture sur un PC récent."
    ],
    qualityTips: [
      "La qualité source peut être limitée par l'ancien format.",
      "Vérifiez la durée et le son après conversion.",
      "Conservez le fichier original si l'archive est personnelle."
    ]
  },
  {
    slug: "mpeg",
    name: "MPEG",
    longName: "MPEG Video",
    category: "Vidéo",
    title: "Convertisseur MPEG local",
    description:
      "Convertissez des fichiers MPEG, MPG ou MPEG-2 localement avec Multi-Converter pour traiter des vidéos anciennes.",
    h1: "Convertir des fichiers MPEG localement",
    intro:
      "MPEG et MPG sont des formats vidéo présents dans de nombreuses archives, DVD, caméras et anciens workflows.",
    localUse:
      "Un convertisseur MPEG local évite les uploads de vidéos lourdes et garde les archives sur votre ordinateur.",
    commonUses: [
      "Adapter une vidéo MPEG à un format plus compatible.",
      "Préparer une archive vidéo pour lecture moderne.",
      "Traiter des fichiers MPG ou MPEG-2 sans cloud."
    ],
    qualityTips: [
      "Vérifiez la qualité après conversion car les sources anciennes varient beaucoup.",
      "Gardez le fichier source avant toute transformation.",
      "Contrôlez le ratio d'image et la synchronisation audio."
    ]
  }
];

function createFormatPage({
  category,
  longName,
  name,
  slug
}: Pick<FormatPage, "category" | "longName" | "name" | "slug">): FormatPage {
  return {
    slug,
    name,
    longName,
    category,
    title: `Convertisseur ${name} local`,
    description:
      `Convertissez des fichiers ${name} localement avec Multi-Converter selon les moteurs disponibles sur Windows.`,
    h1: `Convertir des fichiers ${name} localement`,
    intro:
      `${name} est un format reconnu par Multi-Converter. Les conversions disponibles dépendent du fichier source, du format cible et des moteurs installés localement.`,
    localUse:
      `Un convertisseur ${name} local permet de traiter des fichiers sur votre PC sans upload obligatoire vers un service en ligne.`,
    commonUses: [
      `Reconnaître et préparer des fichiers ${name} dans un workflow de conversion local.`,
      "Changer vers un format plus pratique lorsque l'option est proposée.",
      "Garder les documents, médias ou exports sur votre ordinateur pendant le traitement."
    ],
    qualityTips: [
      "Vérifiez le fichier généré avant de supprimer l'original.",
      "Les options proposées dépendent des moteurs disponibles sur la machine.",
      "Activez Maximum Quality lorsque le format ou la fidélité demandée nécessite des moteurs spécialisés."
    ]
  };
}

const additionalFormatPages: FormatPage[] = [
  createFormatPage({
    slug: "doc",
    name: "DOC",
    longName: "Microsoft Word Binary Document",
    category: "Document"
  }),
  createFormatPage({
    slug: "log",
    name: "LOG",
    longName: "Log Text File",
    category: "Document"
  }),
  createFormatPage({
    slug: "htm",
    name: "HTM",
    longName: "HyperText Markup Language File",
    category: "Document"
  }),
  createFormatPage({
    slug: "markdown",
    name: "Markdown",
    longName: "Markdown Document",
    category: "Document"
  }),
  createFormatPage({
    slug: "md",
    name: "MD",
    longName: "Markdown Document",
    category: "Document"
  }),
  createFormatPage({
    slug: "jpeg",
    name: "JPEG",
    longName: "JPEG Image",
    category: "Image"
  }),
  createFormatPage({
    slug: "gif",
    name: "GIF",
    longName: "Graphics Interchange Format",
    category: "Image"
  }),
  createFormatPage({
    slug: "tif",
    name: "TIF",
    longName: "Tagged Image File Format",
    category: "Image"
  }),
  createFormatPage({
    slug: "m4a",
    name: "M4A",
    longName: "MPEG-4 Audio",
    category: "Audio"
  }),
  createFormatPage({
    slug: "oga",
    name: "OGA",
    longName: "Ogg Audio",
    category: "Audio"
  }),
  createFormatPage({
    slug: "wma",
    name: "WMA",
    longName: "Windows Media Audio",
    category: "Audio"
  }),
  createFormatPage({
    slug: "aiff",
    name: "AIFF",
    longName: "Audio Interchange File Format",
    category: "Audio"
  }),
  createFormatPage({
    slug: "aif",
    name: "AIF",
    longName: "Audio Interchange File Format",
    category: "Audio"
  }),
  createFormatPage({
    slug: "alac",
    name: "ALAC",
    longName: "Apple Lossless Audio Codec",
    category: "Audio"
  }),
  createFormatPage({
    slug: "ac3",
    name: "AC3",
    longName: "Dolby Digital Audio",
    category: "Audio"
  }),
  createFormatPage({
    slug: "mp2",
    name: "MP2",
    longName: "MPEG Audio Layer II",
    category: "Audio"
  }),
  createFormatPage({
    slug: "amr",
    name: "AMR",
    longName: "Adaptive Multi-Rate Audio",
    category: "Audio"
  }),
  createFormatPage({
    slug: "au",
    name: "AU",
    longName: "Sun Audio File",
    category: "Audio"
  }),
  createFormatPage({
    slug: "snd",
    name: "SND",
    longName: "Sound File",
    category: "Audio"
  }),
  createFormatPage({
    slug: "caf",
    name: "CAF",
    longName: "Core Audio Format",
    category: "Audio"
  }),
  createFormatPage({
    slug: "m4v",
    name: "M4V",
    longName: "MPEG-4 Video",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "webm",
    name: "WebM",
    longName: "WebM Video",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "3g2",
    name: "3G2",
    longName: "3GPP2 Multimedia File",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "mts",
    name: "MTS",
    longName: "AVCHD Video",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "m2ts",
    name: "M2TS",
    longName: "Blu-ray BDAV Video",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "mpeg-2",
    name: "MPEG-2",
    longName: "MPEG-2 Video",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "mpg",
    name: "MPG",
    longName: "MPEG Video",
    category: "Vidéo"
  }),
  createFormatPage({
    slug: "ogv",
    name: "OGV",
    longName: "Ogg Video",
    category: "Vidéo"
  })
];

export const formatPages: FormatPage[] = [...coreFormatPages, ...additionalFormatPages];

export function getFormatPage(slug: string) {
  return formatPages.find((page) => page.slug === slug);
}

export function getFormatConversions(formatName: string) {
  const aliases: Record<string, string> = {
    "3g2": "3gp",
    doc: "docx",
    htm: "html",
    jpeg: "jpg",
    log: "txt",
    m4a: "aac",
    m4v: "mp4",
    md: "markdown",
    "mpeg-2": "mpeg",
    mpg: "mpeg",
    oga: "ogg",
    tif: "tiff"
  };
  const normalized = formatName.toLowerCase();
  const normalizedAlias = aliases[normalized] || normalized;

  return conversionPages.filter(
    (page) =>
      page.source.toLowerCase() === normalized ||
      page.target.toLowerCase() === normalized ||
      page.source.toLowerCase() === normalizedAlias ||
      page.target.toLowerCase() === normalizedAlias ||
      (normalized === "jpg" && page.source.toLowerCase() === "jpeg")
  );
}
