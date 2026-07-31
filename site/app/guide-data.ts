export type GuidePage = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intent: string;
  intro: string;
  directAnswer: string;
  sections: Array<{
    heading: string;
    body: string;
    bullets: string[];
  }>;
  comparisonRows: Array<[criterion: string, local: string, online: string]>;
  faq: Array<[question: string, answer: string]>;
  relatedConversions: string[];
  relatedFormats: string[];
};

export const guidePages: GuidePage[] = [
  {
    slug: "convertisseur-fichiers-local",
    title: "Convertisseur de fichiers local pour Windows",
    description:
      "Comprendre les avantages d'un convertisseur de fichiers local pour Windows : confidentialité, fichiers lourds, usage hors ligne et absence de compte.",
    h1: "Convertisseur de fichiers local : convertir sans envoyer ses fichiers",
    intent: "Choisir un convertisseur local",
    intro:
      "Un convertisseur de fichiers local traite les documents, images, audios et vidéos directement sur votre ordinateur. C'est utile quand vous ne voulez pas confier vos fichiers à un service web ou dépendre d'une limite cloud.",
    directAnswer:
      "Un convertisseur de fichiers local est préférable quand la confidentialité, les gros fichiers, le travail hors ligne ou l'absence de compte sont importants. Multi-Converter suit cette logique : les conversions se font sur Windows, sans upload obligatoire et sans abonnement.",
    sections: [
      {
        heading: "Quand un convertisseur local est le bon choix",
        body:
          "La conversion locale est pertinente dès que le fichier contient des données personnelles, un document client, une archive lourde ou un média que vous ne voulez pas téléverser.",
        bullets: [
          "Documents administratifs ou professionnels à garder sur votre PC",
          "Vidéos et audios trop volumineux pour les offres gratuites cloud",
          "Conversions répétées sans recréer un compte sur un service web",
          "Travail dans un environnement avec connexion instable"
        ]
      },
      {
        heading: "Ce que Multi-Converter apporte",
        body:
          "Multi-Converter est conçu comme un outil Windows simple : choisir un fichier, choisir un format compatible, récupérer le résultat localement.",
        bullets: [
          "Traitement local pour les conversions prises en charge",
          "Logiciel gratuit et open source",
          "Aucun compte requis pour convertir",
          "Extension Maximum Quality optionnelle pour certains formats complexes"
        ]
      },
      {
        heading: "Limite importante à connaitre",
        body:
          "Un logiciel local dépend des moteurs installés et du format source. Il ne faut donc pas promettre toutes les conversions possibles entre tous les formats reconnus.",
        bullets: [
          "Les options proposées dépendent du fichier source",
          "Certains formats avancés nécessitent des moteurs spécialisés",
          "Le résultat peut varier selon la structure du fichier d'origine"
        ]
      }
    ],
    comparisonRows: [
      ["Confidentialité", "Fichier traité sur votre ordinateur", "Fichier envoyé à un service tiers"],
      ["Compte", "Aucun compte nécessaire", "Parfois requis selon le service"],
      ["Gros fichiers", "Limité surtout par votre machine", "Limites fréquentes en offre gratuite"],
      ["Hors ligne", "Possible après installation", "Connexion nécessaire"],
      ["Transparence", "Code source public", "Service propriétaire"]
    ],
    faq: [
      [
        "Un convertisseur local est-il plus privé qu'un convertisseur en ligne ?",
        "Oui, pour les conversions locales prises en charge, le fichier reste sur votre ordinateur au lieu d'être envoyé à un serveur tiers."
      ],
      [
        "Est-ce que Multi-Converter fonctionne sans compte ?",
        "Oui. Multi-Converter ne demande pas de compte utilisateur pour lancer une conversion locale."
      ],
      [
        "Est-ce que toutes les conversions sont possibles localement ?",
        "Non. Les conversions disponibles dépendent du format source, du format cible et des moteurs installés."
      ]
    ],
    relatedConversions: ["pdf-en-html", "docx-en-pdf", "mp4-en-mp3", "png-en-webp"],
    relatedFormats: ["pdf", "docx", "mp4", "png"]
  },
  {
    slug: "conversion-fichiers-hors-ligne",
    title: "Conversion de fichiers hors ligne sur Windows",
    description:
      "Guide pour convertir des fichiers hors ligne sur Windows avec un logiciel local, sans dépendre d'un service de conversion cloud.",
    h1: "Conversion de fichiers hors ligne : travailler sans service cloud",
    intent: "Convertir hors ligne",
    intro:
      "Convertir hors ligne signifie utiliser un logiciel installé sur votre ordinateur plutôt qu'un site web. C'est utile en déplacement, dans un réseau restreint ou pour éviter les interruptions liées à internet.",
    directAnswer:
      "Pour convertir des fichiers hors ligne sur Windows, il faut utiliser un convertisseur local. Multi-Converter permet de lancer des conversions sur le PC lorsque les moteurs nécessaires sont disponibles, sans compte et sans upload obligatoire.",
    sections: [
      {
        heading: "Pourquoi convertir hors ligne",
        body:
          "Le hors ligne réduit la dépendance à une plateforme externe et rend les conversions plus prévisibles dans un usage quotidien.",
        bullets: [
          "Pas besoin d'attendre un upload puis un téléchargement",
          "Travail possible avec une connexion instable",
          "Moins d'exposition pour les fichiers sensibles",
          "Pas de quota cloud pour les conversions courantes"
        ]
      },
      {
        heading: "Préparer son poste Windows",
        body:
          "Une fois Multi-Converter installé, vérifiez que le format voulu est reconnu et que l'extension Maximum Quality est activée si le fichier nécessite un moteur spécialisé.",
        bullets: [
          "Installer la version Windows x64",
          "Tester d'abord un petit fichier représentatif",
          "Activer les moteurs optionnels seulement si nécessaire",
          "Garder une copie du fichier original"
        ]
      },
      {
        heading: "Cas où le cloud peut rester pratique",
        body:
          "Un service web peut rester utile pour une conversion ponctuelle sur une machine où vous ne pouvez rien installer. Le choix dépend surtout du contexte.",
        bullets: [
          "Ordinateur verrouillé par une politique d'entreprise",
          "Besoin exceptionnel d'un format non pris en charge localement",
          "Partage direct avec une équipe déjà sur une plateforme cloud"
        ]
      }
    ],
    comparisonRows: [
      ["Dépendance internet", "Faible après installation", "Forte"],
      ["Temps d'attente", "Pas d'upload préalable", "Upload et téléchargement nécessaires"],
      ["Confidentialité", "Fichier conservé localement", "Fichier transmis au service"],
      ["Disponibilité", "Dépend de votre PC", "Dépend du site et de la connexion"],
      ["Installation", "Nécessaire", "Non nécessaire"]
    ],
    faq: [
      [
        "Peut-on convertir une vidéo hors ligne ?",
        "Oui, si la conversion vidéo demandée est prise en charge par les moteurs locaux disponibles, par exemple certaines conversions MP4, MOV, MKV ou WebM."
      ],
      [
        "Le hors ligne veut-il dire aucune connexion internet ?",
        "La connexion peut être nécessaire pour télécharger l'application ou une mise à jour, mais pas pour les conversions locales déjà prises en charge."
      ],
      [
        "Pourquoi tester un petit fichier d'abord ?",
        "Cela permet de vérifier rapidement le format de sortie, la qualité et les options disponibles avant de convertir un fichier plus lourd."
      ]
    ],
    relatedConversions: ["mov-en-mp4", "mkv-en-mp4", "webm-en-mp4", "wav-en-mp3"],
    relatedFormats: ["mp4", "mov", "mkv", "wav"]
  },
  {
    slug: "convertisseur-sans-upload",
    title: "Convertisseur sans upload obligatoire",
    description:
      "Pourquoi choisir un convertisseur de fichiers sans upload obligatoire pour garder documents, images, audio et vidéos sur son ordinateur.",
    h1: "Convertisseur sans upload : garder ses fichiers sur son ordinateur",
    intent: "Eviter l'upload de fichiers",
    intro:
      "Beaucoup de convertisseurs en ligne demandent d'envoyer le fichier avant de produire un résultat. Pour un fichier privé, lourd ou professionnel, ce n'est pas toujours acceptable.",
    directAnswer:
      "Un convertisseur sans upload obligatoire permet de transformer un fichier sans le transmettre à un serveur de conversion. Multi-Converter vise cet usage sur Windows : convertir localement quand le format et les moteurs installés le permettent.",
    sections: [
      {
        heading: "Les risques pratiques de l'upload",
        body:
          "Uploader un fichier n'est pas seulement une question de confidentialité. Cela peut aussi prendre du temps, échouer sur les fichiers lourds ou dépendre des limites gratuites du service.",
        bullets: [
          "Temps perdu sur les gros fichiers vidéo",
          "Risque de partager un document sensible par erreur",
          "Limites de taille ou de nombre de conversions",
          "Suppression et conservation des fichiers difficiles à vérifier"
        ]
      },
      {
        heading: "Ce que signifie sans upload obligatoire",
        body:
          "Le fichier est lu et transformé sur la machine de l'utilisateur. Le logiciel peut toujours avoir besoin d'internet pour les mises à jour, mais pas pour transmettre chaque fichier à convertir.",
        bullets: [
          "Conversion locale pour les formats compatibles",
          "Aucune inscription pour lancer le logiciel",
          "Pas de transfert obligatoire vers un convertisseur web",
          "Contrôle plus clair du fichier source et du résultat"
        ]
      },
      {
        heading: "Bonnes pratiques avant conversion",
        body:
          "Même avec un outil local, il faut garder une méthode propre : sauvegarder l'original, choisir un format adapté et vérifier le résultat.",
        bullets: [
          "Conserver le fichier source jusqu'à validation",
          "Comparer le rendu après conversion",
          "Utiliser l'extension Maximum Quality pour certains documents complexes",
          "Eviter les conversions inutiles qui dégradent la qualité"
        ]
      }
    ],
    comparisonRows: [
      ["Transfert du fichier", "Pas obligatoire", "Obligatoire"],
      ["Vie privée", "Meilleur contrôle local", "Dépend de la politique du service"],
      ["Limites gratuites", "Pas de limite serveur", "Limites fréquentes"],
      ["Compte", "Non requis", "Parfois requis"],
      ["Contrôle du résultat", "Résultat récupéré sur le PC", "Résultat récupéré après traitement cloud"]
    ],
    faq: [
      [
        "Sans upload veut-il dire que le logiciel n'utilise jamais internet ?",
        "Non. Internet peut servir au téléchargement, aux mises à jour ou à la consultation du dépôt, mais pas à l'envoi obligatoire du fichier pour une conversion locale."
      ],
      [
        "Pourquoi éviter l'upload pour un PDF ?",
        "Un PDF peut contenir des informations personnelles, contractuelles ou professionnelles. Le traitement local réduit l'exposition de ces données."
      ],
      [
        "Est-ce utile pour les vidéos ?",
        "Oui, car les vidéos sont souvent lourdes et dépassent vite les limites gratuites des convertisseurs en ligne."
      ]
    ],
    relatedConversions: ["pdf-en-html", "docx-en-pdf", "mp4-en-mp3", "mov-en-mp4"],
    relatedFormats: ["pdf", "docx", "mp4", "mov"]
  },
  {
    slug: "convertisseur-open-source-windows",
    title: "Convertisseur open source pour Windows",
    description:
      "Ce qu'apporte un convertisseur de fichiers open source sur Windows : transparence, gratuité, dépôt public et moteurs tiers identifiables.",
    h1: "Convertisseur open source Windows : convertir avec plus de transparence",
    intent: "Trouver un convertisseur open source",
    intro:
      "Un convertisseur open source donne plus de visibilité sur le produit que vous installez. Pour un outil qui manipule des fichiers personnels ou professionnels, cette transparence compte.",
    directAnswer:
      "Multi-Converter est un convertisseur de fichiers gratuit et open source pour Windows. Son code est publié sur GitHub sous licence AGPL-3.0-or-later, avec des moteurs tiers identifiables pour certaines conversions.",
    sections: [
      {
        heading: "Pourquoi l'open source compte",
        body:
          "L'open source ne garantit pas automatiquement la qualité, mais il rend le fonctionnement du logiciel plus inspectable et évite de dépendre uniquement d'une promesse marketing.",
        bullets: [
          "Code source public",
          "Possibilité de suivre les releases",
          "Licences plus faciles à identifier",
          "Corrections et améliorations visibles"
        ]
      },
      {
        heading: "Ce que Multi-Converter expose",
        body:
          "Le projet indique son dépôt source, ses releases Windows et les moteurs tiers utilisés par l'extension Maximum Quality.",
        bullets: [
          "Depot GitHub public",
          "Licence AGPL-3.0-or-later pour le code du projet",
          "FFmpeg et ffprobe pour les conversions audio/vidéo",
          "PDFium, LibreOffice, Pandoc et libvips via l'extension optionnelle"
        ]
      },
      {
        heading: "Ce que l'open source ne remplace pas",
        body:
          "Il faut toujours vérifier le résultat de conversion. Certains documents peuvent avoir une mise en page complexe ou des métadonnées qu'un moteur ne restitue pas parfaitement.",
        bullets: [
          "Contrôler le fichier final avant diffusion",
          "Conserver l'original",
          "Tester les documents complexes avant usage important"
        ]
      }
    ],
    comparisonRows: [
      ["Code source", "Public", "Souvent fermé"],
      ["Prix", "Gratuit", "Gratuit avec limites ou payant"],
      ["Moteurs tiers", "Identifiables", "Pas toujours détaillés"],
      ["Compte", "Non requis", "Variable"],
      ["Traitement", "Local pour les formats compatibles", "Serveur distant"]
    ],
    faq: [
      [
        "Multi-Converter est-il vraiment open source ?",
        "Oui. Le dépôt source public est disponible sur GitHub et le code du projet est indiqué sous licence AGPL-3.0-or-later."
      ],
      [
        "Open source veut-il dire gratuit ?",
        "Dans le cas de Multi-Converter, oui : le logiciel est présenté comme gratuit et open source."
      ],
      [
        "Les moteurs tiers ont-ils la même licence ?",
        "Non. Les moteurs tiers gardent leurs propres licences et notices."
      ]
    ],
    relatedConversions: ["markdown-en-html", "csv-en-json", "json-en-csv", "svg-en-png"],
    relatedFormats: ["csv", "json", "svg", "webp"]
  },
  {
    slug: "convertisseur-windows-gratuit",
    title: "Convertisseur de fichiers gratuit pour Windows",
    description:
      "Guide pour choisir un convertisseur de fichiers gratuit sur Windows sans compte, sans abonnement et sans limite cloud pour les conversions locales.",
    h1: "Convertisseur de fichiers gratuit pour Windows",
    intent: "Trouver un convertisseur gratuit",
    intro:
      "Un convertisseur gratuit peut vouloir dire beaucoup de choses : gratuit avec limites, gratuit avec compte, ou vraiment utilisable sans abonnement. Il faut regarder les conditions autant que les formats.",
    directAnswer:
      "Multi-Converter est un convertisseur de fichiers gratuit pour Windows x64. Il ne demande pas de compte, pas d'abonnement, et traite localement les conversions prises en charge par les moteurs disponibles.",
    sections: [
      {
        heading: "Ce qu'il faut vérifier dans un outil gratuit",
        body:
          "Les limites gratuites sont souvent le vrai coût d'un convertisseur. Taille maximale, nombre de conversions, attente ou compte obligatoire peuvent gêner l'usage quotidien.",
        bullets: [
          "Compte obligatoire ou non",
          "Limite de taille par fichier",
          "Limite quotidienne de conversions",
          "Traitement local ou cloud",
          "Formats réellement disponibles"
        ]
      },
      {
        heading: "Pourquoi choisir Multi-Converter",
        body:
          "Multi-Converter vise les conversions courantes sur Windows sans transformer chaque action en parcours d'inscription ou en abonnement.",
        bullets: [
          "Prix : 0 EUR",
          "Aucun compte pour utiliser l'application",
          "Pas d'abonnement",
          "Code source ouvert",
          "Extension qualité optionnelle également gratuite"
        ]
      },
      {
        heading: "Formats utiles à tester",
        body:
          "Commencez par les conversions les plus fréquentes pour valider que l'outil couvre votre usage réel.",
        bullets: [
          "PDF vers HTML pour récupérer du contenu",
          "DOCX vers PDF pour partager un document",
          "PNG vers WebP pour alléger une image",
          "MP4 vers MP3 pour extraire l'audio",
          "MOV, MKV ou WebM vers MP4 pour standardiser une vidéo"
        ]
      }
    ],
    comparisonRows: [
      ["Prix", "0 EUR", "Gratuit avec limites ou plans payants"],
      ["Compte", "Non requis", "Variable"],
      ["Abonnement", "Non", "Souvent proposé"],
      ["Limite serveur", "Non pour le local", "Fréquente"],
      ["Plateforme", "Windows x64", "Navigateur web"]
    ],
    faq: [
      [
        "Multi-Converter est-il payant ?",
        "Non. Multi-Converter est présenté comme gratuit, sans abonnement et sans fonctionnalité cachée derrière un paiement."
      ],
      [
        "L'extension Maximum Quality est-elle payante ?",
        "Non. Elle est optionnelle et gratuite, mais plus lourde à télécharger et à installer."
      ],
      [
        "Pourquoi un outil gratuit peut-il avoir des limites ?",
        "Un service cloud paie l'infrastructure serveur. Un logiciel local utilise surtout votre machine, ce qui évite certaines limites de service."
      ]
    ],
    relatedConversions: ["docx-en-pdf", "png-en-webp", "mp4-en-mp3", "webm-en-mp4"],
    relatedFormats: ["docx", "png", "mp4", "webp"]
  },
  {
    slug: "local-vs-convertisseur-en-ligne",
    title: "Convertisseur local ou en ligne : lequel choisir ?",
    description:
      "Comparaison entre un convertisseur de fichiers local comme Multi-Converter et les services de conversion en ligne.",
    h1: "Convertisseur local vs convertisseur en ligne",
    intent: "Comparer local et cloud",
    intro:
      "Un convertisseur en ligne est pratique quand vous ne voulez rien installer. Un convertisseur local est plus adapté quand le fichier doit rester sur votre ordinateur ou quand vous convertissez souvent.",
    directAnswer:
      "Choisissez un convertisseur local si vous voulez éviter l'upload, les comptes et les limites de taille. Choisissez un convertisseur en ligne si vous avez besoin d'une conversion ponctuelle depuis une machine où l'installation est impossible.",
    sections: [
      {
        heading: "Avantages du convertisseur local",
        body:
          "Le local donne plus de contrôle sur les fichiers et évite plusieurs contraintes des offres gratuites en ligne.",
        bullets: [
          "Fichiers conservés sur le PC",
          "Pas de limite serveur pour les conversions locales",
          "Pas de compte nécessaire avec Multi-Converter",
          "Utilisable hors ligne après installation"
        ]
      },
      {
        heading: "Avantages du convertisseur en ligne",
        body:
          "Le cloud reste utile pour un besoin ponctuel, surtout si vous travaillez sur un poste où vous ne pouvez pas installer de logiciel.",
        bullets: [
          "Aucune installation",
          "Accessible depuis un navigateur",
          "Peut proposer certains formats spécifiques",
          "Pratique pour un usage rare"
        ]
      },
      {
        heading: "Faire le bon choix",
        body:
          "La bonne réponse dépend du fichier. Plus le fichier est sensible, lourd ou récurrent, plus la conversion locale devient intéressante.",
        bullets: [
          "Fichier sensible : privilégier le local",
          "Fichier lourd : privilégier le local",
          "Conversion ponctuelle sans installation possible : service en ligne",
          "Usage fréquent : installer un outil local"
        ]
      }
    ],
    comparisonRows: [
      ["Installation", "Oui", "Non"],
      ["Upload", "Non obligatoire", "Obligatoire"],
      ["Limite de taille", "Machine locale", "Plan gratuit ou payant"],
      ["Confidentialité", "Contrôle local", "Dépend du service"],
      ["Usage fréquent", "Adapté", "Moins pratique avec quotas"]
    ],
    faq: [
      [
        "Un convertisseur en ligne est-il toujours moins bon ?",
        "Non. Il peut être très pratique pour une conversion ponctuelle. Le problème apparait surtout avec les fichiers sensibles, lourds ou fréquents."
      ],
      [
        "Pourquoi Multi-Converter compare-t-il les services cloud ?",
        "Parce que le choix dépend du contexte. Les pages alternatives expliquent les différences de manière transparente."
      ],
      [
        "Quel choix pour une vidéo lourde ?",
        "Un outil local est souvent plus confortable, car il évite l'upload et les limites de taille des offres gratuites."
      ]
    ],
    relatedConversions: ["mp4-en-mp3", "mov-en-mp4", "mkv-en-mp4", "webm-en-mp4"],
    relatedFormats: ["mp4", "mov", "mkv", "mp3"]
  },
  {
    slug: "convertisseur-pdf-local",
    title: "Convertisseur PDF local pour Windows",
    description:
      "Pourquoi utiliser un convertisseur PDF local pour traiter PDF, HTML, DOCX, ODT, RTF ou EPUB sans upload obligatoire.",
    h1: "Convertisseur PDF local : convertir ses documents sans cloud",
    intent: "Convertir des documents PDF localement",
    intro:
      "Les fichiers PDF et documents bureautiques contiennent souvent des informations personnelles, professionnelles ou administratives. Un convertisseur PDF local aide à les traiter sans les envoyer vers un service en ligne.",
    directAnswer:
      "Un convertisseur PDF local est utile quand vous devez convertir PDF, HTML, DOCX, ODT, RTF ou EPUB tout en gardant les fichiers sur votre ordinateur. Multi-Converter propose cette approche sur Windows, selon les formats et moteurs disponibles.",
    sections: [
      {
        heading: "Quand privilégier un outil PDF local",
        body:
          "Le traitement local est particulièrement pertinent pour les documents qui ne doivent pas quitter votre machine.",
        bullets: [
          "Contrats, factures, CV ou documents administratifs",
          "Rapports internes ou contenus de travail",
          "Documents longs qui dépassent les limites gratuites des services web",
          "Conversions répétées sans créer de compte"
        ]
      },
      {
        heading: "Conversions documentaires utiles",
        body:
          "Les conversions exactes dépendent du fichier et des moteurs installés, mais certaines intentions reviennent souvent.",
        bullets: [
          "DOCX vers PDF pour partager une version finale",
          "HTML vers PDF pour figer une page ou documentation",
          "EPUB vers PDF pour archiver une publication numérique",
          "PDF vers HTML pour récupérer un contenu exploitable"
        ]
      },
      {
        heading: "Qualité et moteurs spécialisés",
        body:
          "Les documents complexes demandent parfois des moteurs plus avancés. L'extension Maximum Quality peut ajouter LibreOffice headless, PDFium et Pandoc selon le cas.",
        bullets: [
          "Vérifier les tableaux et images après conversion",
          "Installer les polices nécessaires sur Windows",
          "Conserver le fichier source jusqu'à validation",
          "Tester un petit document avant une conversion importante"
        ]
      }
    ],
    comparisonRows: [
      ["Confidentialité", "Document traité sur le PC", "Document envoyé au service"],
      ["Compte", "Non requis avec Multi-Converter", "Souvent demandé selon le service"],
      ["Documents longs", "Limité par la machine", "Limites de taille fréquentes"],
      ["Moteurs", "Locaux et identifiables", "Côté serveur"],
      ["Contrôle", "Résultat récupéré localement", "Résultat après traitement distant"]
    ],
    faq: [
      [
        "Un PDF peut-il être converti parfaitement ?",
        "Pas toujours. Un PDF peut contenir du texte, des images, des polices ou des scans, ce qui influence le résultat."
      ],
      [
        "Pourquoi éviter un convertisseur PDF en ligne ?",
        "Parce qu'un PDF peut contenir des données personnelles ou professionnelles. Le local réduit l'exposition du fichier."
      ],
      [
        "Maximum Quality est-il obligatoire ?",
        "Non. Il est optionnel, mais utile pour certains documents complexes ou conversions bureautiques plus précises."
      ]
    ],
    relatedConversions: ["pdf-en-html", "docx-en-pdf", "html-en-pdf", "epub-en-pdf"],
    relatedFormats: ["pdf", "docx", "html", "epub"]
  },
  {
    slug: "convertisseur-audio-local",
    title: "Convertisseur audio local : MP3, WAV, FLAC, AAC, OGG",
    description:
      "Guide pour convertir des fichiers audio localement sur Windows : MP4 en MP3, WAV en MP3, FLAC en MP3, AAC en MP3 ou OGG en MP3.",
    h1: "Convertisseur audio local pour Windows",
    intent: "Convertir de l'audio localement",
    intro:
      "Les fichiers audio peuvent être des enregistrements personnels, voix de travail, pistes de projet ou archives. Les convertir localement évite de les envoyer vers un service cloud.",
    directAnswer:
      "Un convertisseur audio local permet de convertir ou extraire des fichiers audio directement sur Windows. Multi-Converter couvre des usages comme MP4 vers MP3, WAV vers MP3, FLAC vers MP3, AAC vers MP3 ou OGG vers MP3 selon les moteurs disponibles.",
    sections: [
      {
        heading: "Pourquoi convertir l'audio localement",
        body:
          "L'audio peut contenir des conversations, réunions, voix ou contenus de projet. Le traitement local garde ces fichiers sous votre contrôle.",
        bullets: [
          "Pas d'upload de voix ou enregistrements privés",
          "Pas de limite quotidienne d'un service gratuit",
          "Conversion possible après installation pour les formats compatibles",
          "Meilleur contrôle des fichiers source et résultat"
        ]
      },
      {
        heading: "Conversions audio fréquentes",
        body:
          "MP3 reste très compatible, tandis que WAV et FLAC servent souvent de sources plus lourdes ou plus qualitatives.",
        bullets: [
          "MP4 vers MP3 pour extraire l'audio d'une vidéo",
          "WAV vers MP3 pour réduire le poids",
          "FLAC vers MP3 pour créer une version compatible",
          "AAC ou OGG vers MP3 pour certains lecteurs"
        ]
      },
      {
        heading: "Attention à la qualité",
        body:
          "Certaines conversions audio passent d'un format compressé à un autre. Cela peut ajouter une perte de qualité.",
        bullets: [
          "Conserver la source si elle est importante",
          "Éviter les recompressions successives",
          "Écouter le résultat final",
          "Vérifier la durée et le volume"
        ]
      }
    ],
    comparisonRows: [
      ["Upload", "Non obligatoire", "Obligatoire"],
      ["Fichiers privés", "Restent sur le PC", "Envoyés au service"],
      ["Gros fichiers", "Limité par le disque et le PC", "Limité par l'offre"],
      ["Formats", "Selon moteurs locaux", "Selon catalogue cloud"],
      ["Compte", "Non requis", "Variable"]
    ],
    faq: [
      [
        "MP3 est-il toujours le meilleur format audio ?",
        "Non. MP3 est surtout très compatible. FLAC ou WAV peuvent être préférables pour conserver une source de qualité."
      ],
      [
        "Convertir FLAC en MP3 réduit-il la qualité ?",
        "Oui, MP3 est un format avec perte. Il faut garder le FLAC si vous voulez conserver une archive sans perte."
      ],
      [
        "Peut-on extraire l'audio d'une vidéo MP4 ?",
        "Oui, Multi-Converter documente le flux MP4 vers MP3 pour récupérer la piste audio localement."
      ]
    ],
    relatedConversions: ["mp4-en-mp3", "wav-en-mp3", "flac-en-mp3", "aac-en-mp3"],
    relatedFormats: ["mp3", "wav", "flac", "aac"]
  },
  {
    slug: "convertisseur-video-sans-upload",
    title: "Convertisseur vidéo sans upload pour Windows",
    description:
      "Convertir des vidéos localement sur Windows sans upload obligatoire : MOV en MP4, MKV en MP4, AVI en MP4, WebM en MP4 et plus.",
    h1: "Convertisseur vidéo sans upload",
    intent: "Convertir des vidéos sans upload",
    intro:
      "Les vidéos sont souvent lourdes, longues à téléverser et parfois privées. Un convertisseur vidéo local évite l'étape d'upload vers un serveur externe.",
    directAnswer:
      "Un convertisseur vidéo sans upload traite les fichiers sur votre ordinateur. Multi-Converter vise cet usage pour convertir des vidéos comme MOV, MKV, WebM, AVI, WMV, 3GP ou MPEG vers MP4 selon les moteurs disponibles.",
    sections: [
      {
        heading: "Pourquoi éviter l'upload vidéo",
        body:
          "Les fichiers vidéo dépassent vite les limites gratuites et peuvent contenir des contenus personnels ou professionnels.",
        bullets: [
          "Uploads longs sur les fichiers lourds",
          "Limites fréquentes de taille ou de durée",
          "Fichiers personnels ou professionnels à garder localement",
          "Contrôle direct du fichier source et du fichier final"
        ]
      },
      {
        heading: "MP4 comme format cible courant",
        body:
          "MP4 est souvent choisi pour sa compatibilité avec les lecteurs, plateformes et outils de montage.",
        bullets: [
          "MOV vers MP4 pour les vidéos issues d'appareils Apple",
          "MKV vers MP4 pour simplifier le partage",
          "WebM vers MP4 pour compatibilité hors web",
          "AVI, WMV, 3GP ou MPEG vers MP4 pour moderniser des archives"
        ]
      },
      {
        heading: "Contrôles après conversion",
        body:
          "Une conversion vidéo doit toujours être vérifiée, surtout si le fichier source utilise un codec ancien ou contient plusieurs pistes.",
        bullets: [
          "Lire le fichier généré jusqu'à la fin",
          "Vérifier la synchronisation audio",
          "Contrôler les sous-titres et pistes multiples",
          "Conserver la source jusqu'à validation"
        ]
      }
    ],
    comparisonRows: [
      ["Taille vidéo", "Limitée surtout par votre machine", "Limites fréquentes"],
      ["Upload", "Non obligatoire", "Nécessaire"],
      ["Confidentialité", "Vidéo gardée localement", "Vidéo envoyée au service"],
      ["Connexion", "Moins dépendant après installation", "Indispensable"],
      ["Formats anciens", "Selon moteurs installés", "Selon service"]
    ],
    faq: [
      [
        "Pourquoi convertir une vidéo en MP4 ?",
        "MP4 est généralement plus compatible avec les lecteurs, plateformes et workflows modernes."
      ],
      [
        "La conversion vidéo peut-elle être longue ?",
        "Oui. La durée dépend de la taille du fichier, du codec source et des performances du PC."
      ],
      [
        "Un convertisseur local impose-t-il une limite de taille cloud ?",
        "Non pour le traitement local. La limite pratique dépend surtout de votre ordinateur et de l'espace disque."
      ]
    ],
    relatedConversions: ["mov-en-mp4", "mkv-en-mp4", "avi-en-mp4", "mpeg-en-mp4"],
    relatedFormats: ["mp4", "mov", "mkv", "avi"]
  },
  {
    slug: "extension-maximum-quality",
    title: "Extension Maximum Quality de Multi-Converter",
    description:
      "Comprendre l'extension Maximum Quality : PDFium, LibreOffice, Pandoc et libvips pour améliorer certaines conversions locales.",
    h1: "Extension Maximum Quality : quand l'activer ?",
    intent: "Comprendre Maximum Quality",
    intro:
      "Maximum Quality est une extension optionnelle de Multi-Converter qui ajoute des moteurs spécialisés pour certains documents, PDF, contenus Markdown/HTML/EPUB et images avancées.",
    directAnswer:
      "Activez Maximum Quality quand une conversion locale n'est pas proposée ou quand le résultat d'un document complexe n'est pas suffisant. L'extension ajoute PDFium, LibreOffice headless, Pandoc et libvips, avec environ 540,9 Mo à télécharger et 1,79 Go une fois installée sur Windows x64.",
    sections: [
      {
        heading: "Ce que l'extension ajoute",
        body:
          "Maximum Quality installe des moteurs tiers séparés, chacun utile pour certains types de fichiers.",
        bullets: [
          "PDFium pour certains rendus PDF",
          "LibreOffice headless pour les documents Office et PDF",
          "Pandoc pour Markdown, HTML, EPUB et DOCX",
          "libvips pour certaines images avancées"
        ]
      },
      {
        heading: "Quand rester sur la base",
        body:
          "Il n'est pas nécessaire d'activer l'extension pour chaque usage. Les conversions courantes peuvent suffire sans moteurs supplémentaires.",
        bullets: [
          "Conversions simples déjà proposées dans l'application",
          "Besoin ponctuel sans exigence de mise en page forte",
          "Machine avec peu d'espace disque disponible",
          "Test rapide avant d'installer des moteurs lourds"
        ]
      },
      {
        heading: "Bonnes pratiques",
        body:
          "L'extension améliore certains cas, mais ne supprime pas la nécessité de vérifier le résultat.",
        bullets: [
          "Comparer le fichier source et le fichier généré",
          "Conserver l'original",
          "Vérifier les licences des moteurs tiers si vous redistribuez",
          "Installer l'extension seulement si elle répond à un besoin réel"
        ]
      }
    ],
    comparisonRows: [
      ["Installation", "Optionnelle", "Souvent invisible côté serveur"],
      ["Taille", "Environ 540,9 Mo à télécharger", "Dépend du service"],
      ["Moteurs", "PDFium, LibreOffice, Pandoc, libvips", "Non toujours détaillés"],
      ["Contrôle", "Moteurs locaux identifiables", "Traitement distant"],
      ["Prix", "0 EUR", "Variable selon le service"]
    ],
    faq: [
      [
        "Maximum Quality est-il payant ?",
        "Non. L'extension est présentée comme optionnelle et gratuite, mais plus lourde à télécharger et installer."
      ],
      [
        "Faut-il l'activer tout de suite ?",
        "Pas forcément. Vous pouvez commencer avec les conversions de base et l'activer si un format ou une qualité de rendu le justifie."
      ],
      [
        "Les moteurs tiers ont-ils leurs propres licences ?",
        "Oui. PDFium, LibreOffice, Pandoc et libvips gardent leurs propres licences et notices."
      ]
    ],
    relatedConversions: ["docx-en-pdf", "html-en-pdf", "epub-en-pdf", "tiff-en-png"],
    relatedFormats: ["pdf", "docx", "html", "tiff"]
  }
];

export function getGuidePage(slug: string) {
  return guidePages.find((page) => page.slug === slug);
}

export function getRelatedGuides(slug: string) {
  return guidePages.filter((page) => page.slug !== slug).slice(0, 3);
}
