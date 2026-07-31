export type ConversionPage = {
  slug: string;
  source: string;
  target: string;
  category: "Document" | "Données" | "Image" | "Audio" | "Vidéo";
  title: string;
  description: string;
  h1: string;
  intro: string;
  localBenefit: string;
  qualityNote: string;
  steps: string[];
  tips: string[];
  faq: [question: string, answer: string][];
};

export const conversionPages: ConversionPage[] = [
  {
    slug: "pdf-en-html",
    source: "PDF",
    target: "HTML",
    category: "Document",
    title: "Convertir PDF en HTML localement",
    description:
      "Convertissez un PDF en HTML sur Windows avec Multi-Converter, sans envoyer votre document vers un service cloud.",
    h1: "Convertir PDF en HTML sur son PC",
    intro:
      "La conversion PDF vers HTML sert à récupérer une version web ou éditable d'un document. Avec Multi-Converter, le fichier reste traité localement sur Windows, avec des options qui dépendent des moteurs disponibles.",
    localBenefit:
      "C'est utile pour les documents privés, les contrats, les cours ou les archives que vous ne voulez pas déposer sur un convertisseur en ligne.",
    qualityNote:
      "Pour les PDF complexes, l'extension Maximum Quality peut améliorer le rendu grâce à des moteurs spécialisés comme PDFium ou LibreOffice selon le type de document.",
    steps: [
      "Ajoutez le fichier PDF dans Multi-Converter.",
      "Choisissez HTML si l'option est proposée pour ce fichier.",
      "Lancez la conversion et récupérez le résultat dans le dossier de sortie."
    ],
    tips: [
      "Vérifiez les images et tableaux après conversion, car un PDF n'est pas toujours structuré comme une page web.",
      "Gardez le PDF source si vous devez comparer la mise en page originale.",
      "Activez les moteurs de qualité maximale pour les documents longs ou très mis en forme."
    ],
    faq: [
      [
        "Est-ce que le PDF est envoyé en ligne ?",
        "Non. Multi-Converter est conçu pour convertir localement les fichiers sur votre ordinateur."
      ],
      [
        "Le HTML obtenu sera-t-il identique au PDF ?",
        "Pas toujours. La fidélité dépend de la structure du PDF, des polices, des images et des moteurs installés."
      ]
    ]
  },
  {
    slug: "docx-en-pdf",
    source: "DOCX",
    target: "PDF",
    category: "Document",
    title: "Convertir DOCX en PDF sans cloud",
    description:
      "Transformez un document DOCX en PDF depuis Windows avec un convertisseur gratuit, local et open source.",
    h1: "Convertir DOCX en PDF localement",
    intro:
      "La conversion DOCX vers PDF permet de partager un document dans un format plus stable. Multi-Converter privilégie une conversion locale, sans compte et sans upload obligatoire.",
    localBenefit:
      "Les documents de travail, CV, factures ou notes internes restent sur votre machine au lieu de passer par un service web.",
    qualityNote:
      "Les fichiers Office complexes peuvent nécessiter l'extension Maximum Quality, qui ajoute notamment LibreOffice headless pour une meilleure fidélité.",
    steps: [
      "Ajoutez le fichier DOCX dans l'application.",
      "Sélectionnez PDF dans les formats de sortie disponibles.",
      "Lancez la conversion puis ouvrez le PDF généré pour vérifier le rendu."
    ],
    tips: [
      "Installez les polices nécessaires sur Windows avant la conversion.",
      "Vérifiez les en-têtes, pieds de page et tableaux dans le PDF final.",
      "Utilisez Maximum Quality si la mise en page du document est importante."
    ],
    faq: [
      [
        "Faut-il Microsoft Word ?",
        "Multi-Converter peut s'appuyer sur des moteurs séparés selon la conversion. Les options exactes dépendent de l'installation locale."
      ],
      [
        "Le PDF est-il créé gratuitement ?",
        "Oui. Multi-Converter est gratuit et open source."
      ]
    ]
  },
  {
    slug: "markdown-en-html",
    source: "Markdown",
    target: "HTML",
    category: "Document",
    title: "Convertir Markdown en HTML",
    description:
      "Convertissez un fichier Markdown en HTML localement avec Multi-Converter pour préparer une page ou une documentation.",
    h1: "Convertir Markdown en HTML",
    intro:
      "Markdown est pratique pour écrire vite, HTML est nécessaire pour publier sur le web. Multi-Converter peut aider à passer de l'un à l'autre depuis une application Windows locale.",
    localBenefit:
      "Vos brouillons, documentations et notes restent sur votre PC pendant la conversion.",
    qualityNote:
      "L'extension Maximum Quality peut ajouter Pandoc, un moteur reconnu pour les conversions Markdown, HTML, EPUB et DOCX.",
    steps: [
      "Ajoutez le fichier .md ou Markdown.",
      "Choisissez HTML comme format de sortie si disponible.",
      "Récupérez le fichier HTML généré et testez-le dans votre navigateur."
    ],
    tips: [
      "Utilisez des titres Markdown propres pour obtenir une structure HTML claire.",
      "Gardez les images dans un dossier facile à retrouver si votre Markdown en référence.",
      "Préférez Pandoc pour les documents longs ou techniques."
    ],
    faq: [
      [
        "Markdown et MD sont-ils la même chose ?",
        "Oui. .md est l'extension la plus courante pour les fichiers Markdown."
      ],
      [
        "Puis-je convertir du HTML vers Markdown ?",
        "Les conversions proposées dépendent du fichier source et des moteurs installés dans Multi-Converter."
      ]
    ]
  },
  {
    slug: "csv-en-json",
    source: "CSV",
    target: "JSON",
    category: "Données",
    title: "Convertir CSV en JSON localement",
    description:
      "Convertissez des données CSV en JSON sur votre PC avec Multi-Converter, sans envoyer vos fichiers de données en ligne.",
    h1: "Convertir CSV en JSON sans upload",
    intro:
      "CSV est pratique pour les tableaux, JSON est plus adapté aux applications et API. Multi-Converter vise à rendre ce passage simple tout en gardant les données sur votre ordinateur.",
    localBenefit:
      "C'est particulièrement important pour des exports clients, listes internes, inventaires ou fichiers de travail confidentiels.",
    qualityNote:
      "La qualité dépend surtout de la propreté du CSV : séparateur cohérent, encodage lisible et colonnes nommées.",
    steps: [
      "Ajoutez le fichier CSV dans Multi-Converter.",
      "Choisissez JSON dans les formats de sortie proposés.",
      "Vérifiez le fichier JSON généré dans votre éditeur ou votre outil de développement."
    ],
    tips: [
      "Vérifiez que la première ligne contient des noms de colonnes explicites.",
      "Corrigez les séparateurs incohérents avant conversion.",
      "Ouvrez le JSON final pour contrôler les accents et caractères spéciaux."
    ],
    faq: [
      [
        "Le CSV doit-il utiliser des virgules ?",
        "Pas forcément. Les fichiers CSV peuvent utiliser différents séparateurs, mais un fichier régulier donne de meilleurs résultats."
      ],
      [
        "Pourquoi convertir CSV en JSON ?",
        "JSON est souvent plus facile à utiliser dans une application, un script ou une API."
      ]
    ]
  },
  {
    slug: "json-en-csv",
    source: "JSON",
    target: "CSV",
    category: "Données",
    title: "Convertir JSON en CSV",
    description:
      "Transformez un fichier JSON en CSV localement pour l'ouvrir dans un tableur sans passer par un service web.",
    h1: "Convertir JSON en CSV sur Windows",
    intro:
      "Le JSON est courant pour les applications, mais le CSV reste plus simple à lire dans Excel, LibreOffice Calc ou un outil d'analyse. Multi-Converter aide à convertir localement quand la structure le permet.",
    localBenefit:
      "Vos exports d'API, fichiers techniques ou données internes ne sont pas envoyés à un convertisseur en ligne.",
    qualityNote:
      "Un JSON plat se convertit plus facilement qu'un JSON très imbriqué. Les structures complexes peuvent nécessiter un contrôle manuel après conversion.",
    steps: [
      "Ajoutez le fichier JSON dans Multi-Converter.",
      "Sélectionnez CSV si l'application le propose.",
      "Ouvrez le CSV dans votre tableur pour vérifier les colonnes."
    ],
    tips: [
      "Validez le JSON avant conversion si le fichier vient d'une API.",
      "Aplatissez les structures très imbriquées si votre tableur ne les gère pas bien.",
      "Vérifiez l'encodage pour conserver les caractères accentués."
    ],
    faq: [
      [
        "Tous les JSON peuvent-ils devenir un CSV propre ?",
        "Non. Un JSON très imbriqué peut perdre en lisibilité dans un format tabulaire."
      ],
      [
        "Le fichier peut-il contenir des données sensibles ?",
        "Oui, l'intérêt de Multi-Converter est justement de traiter les fichiers localement sur votre machine."
      ]
    ]
  },
  {
    slug: "png-en-webp",
    source: "PNG",
    target: "WebP",
    category: "Image",
    title: "Convertir PNG en WebP",
    description:
      "Convertissez des images PNG en WebP localement pour réduire le poids des fichiers tout en gardant le contrôle.",
    h1: "Convertir PNG en WebP localement",
    intro:
      "WebP est souvent utilisé pour alléger les images sur le web. Multi-Converter permet de préparer des images depuis Windows sans dépendre d'un outil en ligne.",
    localBenefit:
      "Les captures d'écran, visuels produit et images privées restent sur votre ordinateur.",
    qualityNote:
      "Pour les traitements d'image avancés, l'extension Maximum Quality peut ajouter libvips selon les besoins.",
    steps: [
      "Ajoutez une ou plusieurs images PNG.",
      "Choisissez WebP comme format de sortie.",
      "Comparez le poids et le rendu du WebP généré."
    ],
    tips: [
      "Gardez le PNG original si vous avez besoin d'une version sans perte.",
      "Utilisez WebP pour les pages web, galeries et images de documentation.",
      "Vérifiez les zones transparentes après conversion."
    ],
    faq: [
      [
        "Pourquoi convertir PNG en WebP ?",
        "WebP peut réduire le poids des images, ce qui aide les pages web à charger plus vite."
      ],
      [
        "La transparence est-elle conservée ?",
        "Elle peut l'être selon le fichier et le moteur utilisé. Il faut vérifier le résultat final."
      ]
    ]
  },
  {
    slug: "jpg-en-png",
    source: "JPG",
    target: "PNG",
    category: "Image",
    title: "Convertir JPG en PNG",
    description:
      "Convertissez JPG en PNG depuis Windows avec Multi-Converter, un convertisseur de fichiers gratuit et local.",
    h1: "Convertir JPG en PNG sur son PC",
    intro:
      "PNG est utile quand vous voulez un format largement compatible pour l'édition, les captures ou certains visuels. Multi-Converter effectue la conversion depuis votre machine.",
    localBenefit:
      "Aucune image n'a besoin d'être téléversée vers un convertisseur web pour ce flux local.",
    qualityNote:
      "Convertir un JPG en PNG ne recrée pas les détails déjà perdus par la compression JPEG, mais peut faciliter certains usages d'édition.",
    steps: [
      "Ajoutez le fichier JPG ou JPEG.",
      "Sélectionnez PNG dans les options compatibles.",
      "Lancez la conversion et contrôlez l'image générée."
    ],
    tips: [
      "Conservez le JPG original pour éviter les conversions répétées.",
      "Utilisez PNG pour les captures, interfaces et images avec aplats.",
      "Évitez de convertir de grandes bibliothèques sans vérifier le poids final."
    ],
    faq: [
      [
        "PNG améliore-t-il la qualité d'un JPG ?",
        "Non. Le PNG peut éviter une nouvelle perte, mais il ne restaure pas les détails supprimés par le JPG."
      ],
      [
        "Puis-je convertir plusieurs images ?",
        "Multi-Converter est conçu pour gérer des fichiers depuis une interface de conversion, selon les options disponibles."
      ]
    ]
  },
  {
    slug: "svg-en-png",
    source: "SVG",
    target: "PNG",
    category: "Image",
    title: "Convertir SVG en PNG",
    description:
      "Transformez une image SVG en PNG localement avec Multi-Converter pour obtenir un fichier bitmap compatible.",
    h1: "Convertir SVG en PNG localement",
    intro:
      "SVG est vectoriel, PNG est bitmap. Convertir SVG en PNG sert à exporter un logo, une icône ou une illustration vers un format accepté partout.",
    localBenefit:
      "Vos icônes, maquettes ou ressources de marque restent sur votre ordinateur.",
    qualityNote:
      "La taille d'export influence fortement la netteté du PNG final. Les moteurs disponibles peuvent varier selon l'installation.",
    steps: [
      "Ajoutez le fichier SVG.",
      "Choisissez PNG comme format de sortie si disponible.",
      "Contrôlez la taille et la netteté du PNG généré."
    ],
    tips: [
      "Exportez dans une dimension suffisante pour votre usage final.",
      "Vérifiez les polices si le SVG contient du texte.",
      "Gardez le SVG source pour les futures tailles d'export."
    ],
    faq: [
      [
        "Pourquoi passer de SVG à PNG ?",
        "PNG est plus simple à utiliser dans certains logiciels, documents et plateformes qui n'acceptent pas le SVG."
      ],
      [
        "Le PNG reste-t-il vectoriel ?",
        "Non. PNG est une image bitmap, donc il ne se redimensionne pas comme un SVG."
      ]
    ]
  },
  {
    slug: "mp4-en-mp3",
    source: "MP4",
    target: "MP3",
    category: "Audio",
    title: "Convertir MP4 en MP3 localement",
    description:
      "Extrayez l'audio d'une vidéo MP4 en MP3 sur Windows avec Multi-Converter, sans upload obligatoire.",
    h1: "Convertir MP4 en MP3 sur Windows",
    intro:
      "Convertir MP4 en MP3 sert à récupérer la piste audio d'une vidéo. Multi-Converter s'appuie sur des moteurs locaux pour éviter l'envoi du fichier vidéo vers un service web.",
    localBenefit:
      "C'est adapté aux vidéos personnelles, enregistrements de réunion, cours ou extraits que vous préférez garder hors ligne.",
    qualityNote:
      "La qualité du MP3 dépend de la piste audio d'origine et des paramètres de conversion disponibles.",
    steps: [
      "Ajoutez la vidéo MP4 dans Multi-Converter.",
      "Choisissez MP3 comme format de sortie audio.",
      "Lancez la conversion et récupérez le fichier audio."
    ],
    tips: [
      "Utilisez un fichier source propre pour éviter les artefacts audio.",
      "Vérifiez la durée du MP3 final après extraction.",
      "Respectez les droits d'auteur des vidéos que vous convertissez."
    ],
    faq: [
      [
        "Est-ce une conversion vidéo ou une extraction audio ?",
        "Dans ce cas, il s'agit surtout d'extraire ou convertir la piste audio de la vidéo MP4 vers MP3."
      ],
      [
        "La vidéo est-elle envoyée sur internet ?",
        "Non. Multi-Converter vise une conversion locale sur votre ordinateur."
      ]
    ]
  },
  {
    slug: "wav-en-mp3",
    source: "WAV",
    target: "MP3",
    category: "Audio",
    title: "Convertir WAV en MP3",
    description:
      "Réduisez le poids d'un fichier audio WAV en le convertissant en MP3 localement avec Multi-Converter.",
    h1: "Convertir WAV en MP3 localement",
    intro:
      "WAV est souvent volumineux, MP3 est plus léger et compatible avec beaucoup d'appareils. Multi-Converter permet de convertir depuis Windows sans passer par un site tiers.",
    localBenefit:
      "Vos enregistrements vocaux, sons de travail ou fichiers audio privés restent sur votre PC.",
    qualityNote:
      "MP3 est un format compressé avec perte. Gardez le WAV source si vous devez conserver une archive de qualité maximale.",
    steps: [
      "Ajoutez le fichier WAV.",
      "Choisissez MP3 comme sortie.",
      "Écoutez le MP3 obtenu pour valider le résultat."
    ],
    tips: [
      "Gardez le WAV original pour le montage audio.",
      "Utilisez MP3 pour le partage et l'écoute courante.",
      "Évitez de recompresser plusieurs fois le même fichier."
    ],
    faq: [
      [
        "Pourquoi le MP3 est-il plus léger ?",
        "MP3 compresse le son avec perte, ce qui réduit fortement la taille du fichier."
      ],
      [
        "La conversion fonctionne-t-elle hors ligne ?",
        "Les conversions locales de Multi-Converter sont pensées pour fonctionner sans upload vers le cloud."
      ]
    ]
  },
  {
    slug: "mov-en-mp4",
    source: "MOV",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir MOV en MP4",
    description:
      "Convertissez une vidéo MOV en MP4 localement sur Windows avec Multi-Converter, sans compte ni cloud obligatoire.",
    h1: "Convertir MOV en MP4 sur Windows",
    intro:
      "MOV est fréquent sur les appareils Apple, tandis que MP4 est très compatible pour le partage et la lecture. Multi-Converter aide à effectuer cette conversion localement.",
    localBenefit:
      "Les vidéos personnelles ou professionnelles peuvent rester sur votre ordinateur pendant la conversion.",
    qualityNote:
      "La durée de conversion dépend de la taille de la vidéo, du codec source et des performances de votre PC.",
    steps: [
      "Ajoutez la vidéo MOV dans l'interface.",
      "Sélectionnez MP4 parmi les sorties compatibles.",
      "Lancez la conversion et testez la lecture du MP4."
    ],
    tips: [
      "Branchez votre PC portable pendant les longues conversions vidéo.",
      "Gardez la vidéo source tant que vous n'avez pas validé le MP4.",
      "Vérifiez l'audio et la vidéo dans le fichier final."
    ],
    faq: [
      [
        "Pourquoi convertir MOV en MP4 ?",
        "MP4 est généralement mieux accepté par les lecteurs, plateformes et logiciels."
      ],
      [
        "La conversion vidéo peut-elle être longue ?",
        "Oui. Les fichiers vidéo lourds demandent plus de temps et dépendent des performances de l'ordinateur."
      ]
    ]
  },
  {
    slug: "mkv-en-mp4",
    source: "MKV",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir MKV en MP4",
    description:
      "Transformez une vidéo MKV en MP4 depuis votre PC Windows avec un convertisseur gratuit, local et open source.",
    h1: "Convertir MKV en MP4 localement",
    intro:
      "MKV est flexible, MP4 est souvent plus simple à lire sur de nombreux appareils. Multi-Converter permet de préparer une version MP4 sans envoyer votre vidéo en ligne.",
    localBenefit:
      "Les gros fichiers vidéo restent sur votre disque, ce qui évite les uploads longs et les limites des services gratuits.",
    qualityNote:
      "Selon les codecs, une conversion complète peut être nécessaire. Le résultat dépend du fichier source et des moteurs installés.",
    steps: [
      "Ajoutez le fichier MKV.",
      "Choisissez MP4 si la conversion est proposée.",
      "Attendez la fin du traitement puis vérifiez le fichier généré."
    ],
    tips: [
      "Prévoyez de l'espace disque pour le fichier de sortie.",
      "Testez quelques secondes du MP4 avant de supprimer le MKV source.",
      "Les sous-titres et pistes multiples peuvent demander une vérification particulière."
    ],
    faq: [
      [
        "MP4 est-il toujours meilleur que MKV ?",
        "Non. MP4 est surtout plus compatible. MKV peut rester préférable pour certains usages avancés."
      ],
      [
        "Y a-t-il une limite de taille ?",
        "Multi-Converter n'impose pas une limite cloud gratuite. La limite pratique dépend de votre ordinateur."
      ]
    ]
  },
  {
    slug: "webm-en-mp4",
    source: "WebM",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir WebM en MP4",
    description:
      "Convertissez WebM en MP4 localement pour obtenir une vidéo plus compatible avec les lecteurs et plateformes.",
    h1: "Convertir WebM en MP4 sans cloud",
    intro:
      "WebM est courant sur le web, mais MP4 reste souvent demandé pour le partage, le montage ou certaines plateformes. Multi-Converter traite la conversion localement sur Windows.",
    localBenefit:
      "Vous évitez les uploads de vidéos lourdes et gardez le contrôle des fichiers.",
    qualityNote:
      "Le rendu dépend du codec WebM source, du débit et des options disponibles dans l'application.",
    steps: [
      "Ajoutez la vidéo WebM.",
      "Sélectionnez MP4 comme format de sortie.",
      "Lancez la conversion et ouvrez la vidéo MP4 pour contrôle."
    ],
    tips: [
      "Vérifiez la synchronisation audio après conversion.",
      "Gardez une copie du WebM source jusqu'à validation.",
      "Utilisez MP4 si votre outil de montage ou plateforme refuse WebM."
    ],
    faq: [
      [
        "Pourquoi WebM n'est-il pas toujours accepté ?",
        "Certains lecteurs et services prennent mieux en charge MP4 que WebM."
      ],
      [
        "Puis-je convertir hors ligne ?",
        "Multi-Converter est conçu autour de conversions locales, sans upload obligatoire."
      ]
    ]
  },
  {
    slug: "html-en-pdf",
    source: "HTML",
    target: "PDF",
    category: "Document",
    title: "Convertir HTML en PDF localement",
    description:
      "Convertissez un fichier HTML en PDF sur Windows avec Multi-Converter, sans envoyer votre page ou documentation vers le cloud.",
    h1: "Convertir HTML en PDF sur Windows",
    intro:
      "Convertir HTML en PDF sert à figer une page, une documentation ou un export web dans un format facile à partager. Multi-Converter peut traiter ce type de fichier localement selon les moteurs disponibles.",
    localBenefit:
      "C'est utile pour les documentations internes, pages de rapport ou exports web que vous voulez garder sur votre ordinateur.",
    qualityNote:
      "La qualité dépend des feuilles de style, images liées et moteurs installés. Pandoc via Maximum Quality peut aider pour certains documents structurés.",
    steps: [
      "Ajoutez le fichier HTML dans Multi-Converter.",
      "Choisissez PDF si l'option est disponible pour ce fichier.",
      "Lancez la conversion puis vérifiez la mise en page du PDF."
    ],
    tips: [
      "Gardez les images et fichiers CSS accessibles dans le même dossier.",
      "Vérifiez les sauts de page dans le PDF final.",
      "Testez d'abord un HTML court si le document contient beaucoup de styles."
    ],
    faq: [
      [
        "Le rendu HTML sera-t-il identique dans le PDF ?",
        "Pas toujours. Le rendu dépend des styles, des ressources liées et du moteur de conversion utilisé."
      ],
      [
        "Pourquoi convertir HTML en PDF localement ?",
        "Pour produire un document partageable sans envoyer une page interne ou une documentation à un service web."
      ]
    ]
  },
  {
    slug: "odt-en-pdf",
    source: "ODT",
    target: "PDF",
    category: "Document",
    title: "Convertir ODT en PDF localement",
    description:
      "Transformez un document ODT en PDF sur Windows avec un convertisseur local, gratuit et open source.",
    h1: "Convertir ODT en PDF sur son PC",
    intro:
      "ODT est courant avec LibreOffice et OpenOffice. Le convertir en PDF permet de partager un document plus stable tout en gardant le traitement sur votre ordinateur.",
    localBenefit:
      "Les rapports, courriers ou documents administratifs restent sur votre PC au lieu d'être envoyés à un convertisseur en ligne.",
    qualityNote:
      "Les documents ODT complexes peuvent bénéficier de LibreOffice headless via l'extension Maximum Quality.",
    steps: [
      "Ajoutez le fichier ODT dans Multi-Converter.",
      "Sélectionnez PDF si l'option est proposée.",
      "Ouvrez le PDF généré pour contrôler les styles et sauts de page."
    ],
    tips: [
      "Installez les polices utilisées par le document.",
      "Vérifiez les tableaux et images après conversion.",
      "Gardez l'ODT source jusqu'à validation du PDF."
    ],
    faq: [
      [
        "Faut-il LibreOffice installé séparément ?",
        "Les options exactes dépendent des moteurs disponibles. Maximum Quality peut ajouter LibreOffice headless pour certaines conversions bureautiques."
      ],
      [
        "Le PDF est-il plus adapté au partage ?",
        "Oui, PDF conserve généralement mieux une version finale qu'un document modifiable."
      ]
    ]
  },
  {
    slug: "rtf-en-pdf",
    source: "RTF",
    target: "PDF",
    category: "Document",
    title: "Convertir RTF en PDF",
    description:
      "Convertissez un fichier RTF en PDF localement pour partager un document texte enrichi sans service cloud.",
    h1: "Convertir RTF en PDF localement",
    intro:
      "RTF est un format texte enrichi compatible avec de nombreux éditeurs. Le convertir en PDF aide à figer la mise en forme pour le partage ou l'archivage.",
    localBenefit:
      "Un traitement local évite d'envoyer des notes, lettres ou documents anciens vers un outil web.",
    qualityNote:
      "La fidélité dépend de la mise en forme, des polices et du moteur utilisé. Les documents simples se vérifient plus facilement.",
    steps: [
      "Ajoutez le fichier RTF.",
      "Choisissez PDF parmi les sorties compatibles.",
      "Lancez la conversion et relisez le PDF obtenu."
    ],
    tips: [
      "Vérifiez les caractères spéciaux et accents.",
      "Contrôlez les listes et tableaux simples.",
      "Conservez le RTF original tant que le PDF n'est pas validé."
    ],
    faq: [
      [
        "Pourquoi passer de RTF à PDF ?",
        "PDF est plus pratique pour partager une version finale sans dépendre de l'éditeur de texte du destinataire."
      ],
      [
        "RTF conserve-t-il toute sa mise en forme ?",
        "La mise en forme peut varier selon le fichier et les moteurs installés, donc il faut vérifier le résultat."
      ]
    ]
  },
  {
    slug: "epub-en-pdf",
    source: "EPUB",
    target: "PDF",
    category: "Document",
    title: "Convertir EPUB en PDF localement",
    description:
      "Convertissez un fichier EPUB en PDF sur Windows avec Multi-Converter pour préparer une publication numérique hors cloud.",
    h1: "Convertir EPUB en PDF localement",
    intro:
      "EPUB est conçu pour la lecture numérique adaptable, tandis que PDF fige davantage la mise en page. La conversion peut servir à archiver ou partager une publication.",
    localBenefit:
      "Les manuscrits, documents longs ou publications internes peuvent rester sur votre ordinateur pendant la conversion.",
    qualityNote:
      "Pandoc via Maximum Quality peut être utile pour les contenus EPUB structurés, mais le résultat dépend du livre et des ressources intégrées.",
    steps: [
      "Ajoutez le fichier EPUB.",
      "Choisissez PDF si l'option est disponible.",
      "Vérifiez la table des matières, les images et la pagination."
    ],
    tips: [
      "Contrôlez les chapitres après conversion.",
      "Vérifiez les images et liens internes.",
      "Gardez l'EPUB source si vous devez refaire une mise en page."
    ],
    faq: [
      [
        "EPUB et PDF ont-ils la même mise en page ?",
        "Non. EPUB est fluide alors que PDF est plus figé, donc la pagination peut changer."
      ],
      [
        "Pourquoi convertir EPUB en PDF localement ?",
        "Pour préparer une archive ou un partage sans envoyer la publication à un service tiers."
      ]
    ]
  },
  {
    slug: "bmp-en-png",
    source: "BMP",
    target: "PNG",
    category: "Image",
    title: "Convertir BMP en PNG localement",
    description:
      "Convertissez une image BMP en PNG sur Windows avec Multi-Converter pour obtenir un fichier plus pratique sans upload.",
    h1: "Convertir BMP en PNG",
    intro:
      "BMP est souvent volumineux et ancien, tandis que PNG est largement compatible pour les images bitmap et captures.",
    localBenefit:
      "Les ressources graphiques, captures ou images de travail restent sur votre PC pendant la conversion.",
    qualityNote:
      "PNG peut conserver une image sans perte visible, mais le poids final dépend du fichier BMP source.",
    steps: [
      "Ajoutez l'image BMP.",
      "Sélectionnez PNG comme sortie.",
      "Comparez le rendu et le poids du fichier généré."
    ],
    tips: [
      "Vérifiez les couleurs après conversion.",
      "Gardez le BMP original si c'est une ressource technique.",
      "Utilisez PNG pour les captures et interfaces."
    ],
    faq: [
      [
        "Pourquoi convertir BMP en PNG ?",
        "PNG est généralement plus pratique, plus courant et souvent plus léger que BMP."
      ],
      [
        "La conversion améliore-t-elle la qualité ?",
        "Non, elle change surtout le format. Elle ne recrée pas des détails absents de l'image source."
      ]
    ]
  },
  {
    slug: "tiff-en-png",
    source: "TIFF",
    target: "PNG",
    category: "Image",
    title: "Convertir TIFF en PNG",
    description:
      "Convertissez des images TIFF en PNG localement pour traiter scans et archives graphiques depuis votre PC.",
    h1: "Convertir TIFF en PNG localement",
    intro:
      "TIFF est fréquent pour les scans et archives haute qualité. PNG peut être plus simple à ouvrir, partager ou intégrer dans une documentation.",
    localBenefit:
      "Les scans, documents numérisés ou visuels sensibles n'ont pas besoin d'être envoyés à un convertisseur web.",
    qualityNote:
      "Les TIFF peuvent être lourds ou multipages. Le résultat dépend du fichier source et des moteurs installés.",
    steps: [
      "Ajoutez le fichier TIFF.",
      "Choisissez PNG si l'option est proposée.",
      "Vérifiez la résolution et le rendu du PNG."
    ],
    tips: [
      "Gardez le TIFF source pour l'archivage qualité.",
      "Prévoyez de l'espace disque pour les fichiers lourds.",
      "Contrôlez les pages ou images si le TIFF contient plusieurs éléments."
    ],
    faq: [
      [
        "Pourquoi convertir TIFF en PNG ?",
        "PNG est souvent plus facile à utiliser dans des documents, interfaces ou outils courants."
      ],
      [
        "Le TIFF peut-il être multipage ?",
        "Oui, certains TIFF sont multipages. Il faut donc vérifier le résultat après conversion."
      ]
    ]
  },
  {
    slug: "aac-en-mp3",
    source: "AAC",
    target: "MP3",
    category: "Audio",
    title: "Convertir AAC en MP3 localement",
    description:
      "Convertissez un fichier AAC en MP3 sur Windows avec Multi-Converter, sans envoyer votre audio vers un service cloud.",
    h1: "Convertir AAC en MP3",
    intro:
      "AAC est courant dans les fichiers audio modernes, tandis que MP3 reste très compatible avec les lecteurs et appareils.",
    localBenefit:
      "Les enregistrements, pistes ou fichiers audio privés restent sur votre ordinateur.",
    qualityNote:
      "AAC et MP3 sont des formats compressés avec perte. Une reconversion peut réduire la qualité, donc gardez la source si elle est importante.",
    steps: [
      "Ajoutez le fichier AAC.",
      "Choisissez MP3 comme format de sortie.",
      "Écoutez le fichier généré pour valider le rendu."
    ],
    tips: [
      "Évitez les conversions répétées.",
      "Gardez l'AAC original si possible.",
      "Vérifiez le volume et les artefacts audio."
    ],
    faq: [
      [
        "Pourquoi convertir AAC en MP3 ?",
        "MP3 est accepté par un très grand nombre de lecteurs, logiciels et plateformes."
      ],
      [
        "La qualité peut-elle baisser ?",
        "Oui, car AAC et MP3 sont compressés avec perte. Il faut écouter le résultat."
      ]
    ]
  },
  {
    slug: "flac-en-mp3",
    source: "FLAC",
    target: "MP3",
    category: "Audio",
    title: "Convertir FLAC en MP3",
    description:
      "Convertissez FLAC en MP3 localement pour obtenir un fichier audio plus léger et compatible.",
    h1: "Convertir FLAC en MP3 localement",
    intro:
      "FLAC conserve l'audio sans perte, tandis que MP3 réduit fortement le poids pour l'écoute courante et le partage.",
    localBenefit:
      "Votre bibliothèque audio ou vos exports restent sur votre PC sans passer par un service en ligne.",
    qualityNote:
      "MP3 est avec perte. Gardez le FLAC original si vous voulez conserver une archive de qualité maximale.",
    steps: [
      "Ajoutez le fichier FLAC.",
      "Sélectionnez MP3 comme format de sortie.",
      "Lancez la conversion et écoutez le MP3 final."
    ],
    tips: [
      "Gardez le FLAC source pour l'archivage.",
      "Utilisez MP3 pour le partage ou les lecteurs très compatibles.",
      "Contrôlez le volume et la durée du fichier généré."
    ],
    faq: [
      [
        "Pourquoi FLAC est-il plus lourd que MP3 ?",
        "FLAC conserve plus d'information audio, tandis que MP3 compresse avec perte."
      ],
      [
        "Le MP3 sera-t-il sans perte ?",
        "Non. MP3 est un format avec perte, même s'il peut être suffisant pour l'écoute courante."
      ]
    ]
  },
  {
    slug: "ogg-en-mp3",
    source: "OGG",
    target: "MP3",
    category: "Audio",
    title: "Convertir OGG en MP3 localement",
    description:
      "Convertissez OGG en MP3 depuis Windows avec Multi-Converter pour améliorer la compatibilité audio.",
    h1: "Convertir OGG en MP3 sur Windows",
    intro:
      "OGG est utilisé pour certains fichiers audio libres ou ressources web, mais MP3 reste plus largement accepté.",
    localBenefit:
      "Les sons de projet, pistes ou ressources audio restent sur votre ordinateur pendant la conversion.",
    qualityNote:
      "Une conversion entre formats compressés peut créer une perte supplémentaire. Vérifiez le rendu final.",
    steps: [
      "Ajoutez le fichier OGG.",
      "Choisissez MP3 si la sortie est proposée.",
      "Écoutez le résultat avant de supprimer le fichier source."
    ],
    tips: [
      "Gardez l'OGG original pour éviter les pertes successives.",
      "Vérifiez la compatibilité du lecteur cible.",
      "Contrôlez la qualité sonore après conversion."
    ],
    faq: [
      [
        "Pourquoi convertir OGG en MP3 ?",
        "MP3 est souvent plus simple à lire sur des appareils et logiciels anciens."
      ],
      [
        "OGG est-il moins bon que MP3 ?",
        "Pas forcément. Le choix dépend surtout de la compatibilité recherchée."
      ]
    ]
  },
  {
    slug: "avi-en-mp4",
    source: "AVI",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir AVI en MP4 localement",
    description:
      "Convertissez une vidéo AVI en MP4 localement sur Windows avec Multi-Converter, sans upload obligatoire.",
    h1: "Convertir AVI en MP4 sur Windows",
    intro:
      "AVI est un ancien conteneur vidéo encore présent dans des archives. MP4 est souvent plus compatible avec les lecteurs et plateformes modernes.",
    localBenefit:
      "Les vidéos anciennes ou volumineuses restent sur votre disque au lieu d'être téléversées vers un service web.",
    qualityNote:
      "La conversion dépend du codec AVI source. Certains fichiers anciens nécessitent un moteur compatible.",
    steps: [
      "Ajoutez la vidéo AVI.",
      "Sélectionnez MP4 comme sortie si disponible.",
      "Lancez la conversion et testez la lecture du MP4."
    ],
    tips: [
      "Vérifiez l'audio et l'image après conversion.",
      "Gardez l'AVI source jusqu'à validation.",
      "Prévoyez du temps pour les fichiers volumineux."
    ],
    faq: [
      [
        "Pourquoi convertir AVI en MP4 ?",
        "MP4 est généralement mieux pris en charge par les appareils, navigateurs et plateformes actuels."
      ],
      [
        "Tous les AVI se convertissent-ils facilement ?",
        "Non. AVI peut contenir différents codecs, donc le résultat dépend du fichier et des moteurs installés."
      ]
    ]
  },
  {
    slug: "wmv-en-mp4",
    source: "WMV",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir WMV en MP4",
    description:
      "Convertissez WMV en MP4 localement pour moderniser une vidéo Windows sans service cloud.",
    h1: "Convertir WMV en MP4 localement",
    intro:
      "WMV est un format vidéo Microsoft parfois présent dans d'anciennes archives ou présentations. MP4 est plus pratique pour le partage actuel.",
    localBenefit:
      "Les vidéos d'entreprise, archives ou fichiers personnels restent sur votre ordinateur pendant la conversion.",
    qualityNote:
      "Le rendu dépend de l'encodage WMV source et des moteurs disponibles dans l'application.",
    steps: [
      "Ajoutez le fichier WMV.",
      "Choisissez MP4 comme format de sortie.",
      "Vérifiez l'image, le son et la durée du MP4."
    ],
    tips: [
      "Testez la lecture complète du fichier généré.",
      "Gardez le WMV original tant que la conversion n'est pas validée.",
      "Contrôlez la synchronisation audio."
    ],
    faq: [
      [
        "Pourquoi convertir WMV en MP4 ?",
        "MP4 est plus largement accepté par les lecteurs modernes et les plateformes de partage."
      ],
      [
        "La conversion peut-elle échouer avec un vieux WMV ?",
        "Oui, certains codecs anciens peuvent demander un moteur compatible ou une vérification particulière."
      ]
    ]
  },
  {
    slug: "3gp-en-mp4",
    source: "3GP",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir 3GP en MP4 localement",
    description:
      "Convertissez des vidéos 3GP en MP4 sur Windows pour récupérer d'anciennes vidéos mobiles sans upload.",
    h1: "Convertir 3GP en MP4",
    intro:
      "3GP est un ancien format mobile. Le convertir en MP4 facilite la lecture, le partage et l'archivage sur des appareils récents.",
    localBenefit:
      "Les anciennes vidéos personnelles peuvent rester sur votre PC pendant la conversion.",
    qualityNote:
      "La qualité source d'un 3GP est souvent limitée. La conversion améliore surtout la compatibilité, pas la définition d'origine.",
    steps: [
      "Ajoutez la vidéo 3GP.",
      "Sélectionnez MP4 si l'option est disponible.",
      "Lancez la conversion puis vérifiez le fichier obtenu."
    ],
    tips: [
      "Ne supprimez pas le 3GP source avant validation.",
      "Vérifiez le son, la durée et l'orientation.",
      "Gardez en tête que la résolution peut rester faible."
    ],
    faq: [
      [
        "Pourquoi convertir 3GP en MP4 ?",
        "MP4 est plus facile à lire sur les appareils et logiciels actuels."
      ],
      [
        "Le MP4 sera-t-il en haute définition ?",
        "Non si la vidéo 3GP source est basse définition. La conversion ne crée pas de détails absents."
      ]
    ]
  },
  {
    slug: "mpeg-en-mp4",
    source: "MPEG",
    target: "MP4",
    category: "Vidéo",
    title: "Convertir MPEG en MP4",
    description:
      "Convertissez des vidéos MPEG, MPG ou MPEG-2 en MP4 localement avec Multi-Converter sur Windows.",
    h1: "Convertir MPEG en MP4 localement",
    intro:
      "MPEG et MPG sont présents dans de nombreuses archives vidéo. MP4 est souvent plus simple à lire, partager et intégrer.",
    localBenefit:
      "Les vidéos lourdes ou anciennes restent sur votre disque, sans upload vers un convertisseur en ligne.",
    qualityNote:
      "Le résultat dépend du codec, du ratio d'image et de la qualité du fichier source.",
    steps: [
      "Ajoutez le fichier MPEG ou MPG.",
      "Choisissez MP4 comme sortie compatible.",
      "Vérifiez la lecture, le ratio et la synchronisation audio."
    ],
    tips: [
      "Gardez le fichier source avant validation.",
      "Contrôlez le ratio d'image si la vidéo vient d'une archive ancienne.",
      "Prévoyez du temps pour les longues vidéos."
    ],
    faq: [
      [
        "MPEG et MPG sont-ils proches ?",
        "Oui, MPG est souvent une extension utilisée pour des fichiers MPEG."
      ],
      [
        "Pourquoi convertir MPEG en MP4 ?",
        "MP4 est plus compatible avec les plateformes, lecteurs et workflows modernes."
      ]
    ]
  }
];

export function getConversionPage(slug: string) {
  return conversionPages.find((page) => page.slug === slug);
}

export function getRelatedConversions(currentSlug: string, limit = 4) {
  const current = getConversionPage(currentSlug);

  return conversionPages
    .filter((page) => page.slug !== currentSlug)
    .sort((a, b) => {
      const aScore = Number(a.category === current?.category) + Number(a.source === current?.source || a.target === current?.target);
      const bScore = Number(b.category === current?.category) + Number(b.source === current?.source || b.target === current?.target);
      return bScore - aScore || a.slug.localeCompare(b.slug);
    })
    .slice(0, limit);
}
