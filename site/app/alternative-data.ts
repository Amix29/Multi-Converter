export type AlternativePage = {
  slug: string;
  service: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  bestForService: string;
  bestForMultiConverter: string;
  comparisonRows: [criterion: string, multiConverter: string, serviceValue: string][];
  faq: [question: string, answer: string][];
};

export const alternativePages: AlternativePage[] = [
  {
    slug: "cloudconvert",
    service: "CloudConvert",
    title: "Alternative à CloudConvert pour convertir localement",
    description:
      "Comparez CloudConvert et Multi-Converter si vous cherchez un convertisseur de fichiers local, gratuit et sans upload obligatoire.",
    h1: "Alternative à CloudConvert : convertir ses fichiers localement",
    intro:
      "CloudConvert est un service web de conversion pratique lorsque l'on veut convertir depuis un navigateur. Multi-Converter répond à un autre besoin : convertir directement sur un PC Windows, sans compte et sans envoyer ses fichiers dans le cloud.",
    bestForService:
      "CloudConvert peut convenir si vous voulez une conversion en ligne accessible depuis plusieurs appareils et que l'envoi du fichier vers un service web ne pose pas de problème.",
    bestForMultiConverter:
      "Multi-Converter est plus adapté si vous voulez garder vos fichiers sur votre ordinateur, éviter les limites d'un plan gratuit en ligne et utiliser un outil open source.",
    comparisonRows: [
      ["Type d'outil", "Application Windows locale", "Service web cloud"],
      ["Upload des fichiers", "Non obligatoire pour les conversions locales", "Oui, les fichiers sont envoyés au service"],
      ["Compte", "Aucun compte nécessaire", "Compte utile ou requis selon l'usage"],
      ["Prix", "Gratuit et open source", "Offre gratuite limitée, options payantes possibles"],
      ["Limite de taille", "Dépend surtout de votre ordinateur", "Dépend des limites du service et du plan"],
      ["Confidentialité", "Fichiers traités localement", "Fichiers traités côté serveur"]
    ],
    faq: [
      [
        "Multi-Converter remplace-t-il CloudConvert pour tous les formats ?",
        "Non. Les deux outils n'ont pas exactement le même modèle ni les mêmes moteurs. Multi-Converter vise surtout les conversions locales courantes et les formats proposés dépendent des moteurs installés."
      ],
      [
        "Pourquoi choisir un convertisseur local plutôt qu'un service cloud ?",
        "Un convertisseur local évite l'upload de fichiers privés et réduit la dépendance aux limites gratuites des services web."
      ]
    ]
  },
  {
    slug: "convertio",
    service: "Convertio",
    title: "Alternative à Convertio sans upload obligatoire",
    description:
      "Découvrez Multi-Converter comme alternative locale à Convertio pour convertir documents, images, audio et vidéos sur Windows.",
    h1: "Alternative à Convertio pour Windows",
    intro:
      "Convertio est connu pour convertir des fichiers en ligne depuis un navigateur. Multi-Converter se positionne différemment : une application Windows gratuite et open source pour convertir localement.",
    bestForService:
      "Convertio peut être pratique pour une conversion ponctuelle depuis un navigateur, surtout si le fichier n'est pas sensible et que les limites gratuites suffisent.",
    bestForMultiConverter:
      "Multi-Converter est préférable pour convertir régulièrement des fichiers depuis son PC, sans inscription et sans envoyer les documents vers un site tiers.",
    comparisonRows: [
      ["Type d'outil", "Logiciel Windows", "Service de conversion en ligne"],
      ["Confidentialité", "Fichiers conservés sur la machine", "Fichiers téléversés vers le service"],
      ["Open source", "Oui", "Non"],
      ["Compte", "Non", "Non pour certains usages gratuits, selon le service"],
      ["Usage hors ligne", "Oui après installation pour les conversions locales", "Non"],
      ["Formats", "Documents, images, audio et vidéo selon moteurs disponibles", "Large catalogue de conversions en ligne"]
    ],
    faq: [
      [
        "Multi-Converter est-il gratuit comme Convertio ?",
        "Multi-Converter est gratuit et open source. Convertio propose un usage web gratuit avec des limites qui peuvent évoluer."
      ],
      [
        "Puis-je convertir des fichiers sensibles avec Multi-Converter ?",
        "Oui, l'intérêt principal est de garder les conversions sur l'ordinateur au lieu d'envoyer les fichiers à un service cloud."
      ]
    ]
  },
  {
    slug: "freeconvert",
    service: "FreeConvert",
    title: "Alternative à FreeConvert locale et open source",
    description:
      "Comparez FreeConvert et Multi-Converter pour choisir entre conversion en ligne et conversion locale sur Windows.",
    h1: "Alternative à FreeConvert : un convertisseur local pour PC",
    intro:
      "FreeConvert propose des conversions depuis le web. Multi-Converter privilégie une application locale pour Windows, utile quand vous voulez garder les fichiers sur votre disque.",
    bestForService:
      "FreeConvert peut convenir pour un usage occasionnel en ligne, notamment si vous ne voulez rien installer.",
    bestForMultiConverter:
      "Multi-Converter convient mieux si vous convertissez souvent, si vous ne voulez pas dépendre d'une limite serveur ou si vous travaillez avec des fichiers privés.",
    comparisonRows: [
      ["Installation", "Oui, application Windows", "Non, service web"],
      ["Upload", "Non obligatoire", "Oui"],
      ["Open source", "Oui", "Non"],
      ["Compte", "Non", "Variable selon l'usage"],
      ["Limites gratuites", "Pas de limite cloud imposée", "Limites liées au service"],
      ["Données privées", "Traitement local", "Traitement sur serveur"]
    ],
    faq: [
      [
        "FreeConvert est-il plus simple si je ne veux rien installer ?",
        "Oui, un service web est pratique pour un usage ponctuel. Multi-Converter devient plus intéressant quand la confidentialité et l'usage répété comptent."
      ],
      [
        "Multi-Converter impose-t-il une limite quotidienne ?",
        "Multi-Converter n'impose pas de limite quotidienne de service cloud. La limite réelle dépend surtout de votre ordinateur et des moteurs disponibles."
      ]
    ]
  },
  {
    slug: "online-convert",
    service: "Online-Convert",
    title: "Alternative à Online-Convert pour conversion locale",
    description:
      "Multi-Converter est une alternative locale à Online-Convert pour les utilisateurs Windows qui veulent éviter l'upload de fichiers.",
    h1: "Alternative à Online-Convert sans cloud obligatoire",
    intro:
      "Online-Convert est un service web généraliste. Multi-Converter vise les utilisateurs qui veulent convertir leurs fichiers depuis Windows, dans une application locale et gratuite.",
    bestForService:
      "Online-Convert peut être utile pour une conversion rapide depuis un navigateur lorsque le fichier peut être envoyé en ligne.",
    bestForMultiConverter:
      "Multi-Converter est plus adapté aux fichiers personnels, documents professionnels, vidéos lourdes ou conversions répétées que vous préférez gérer localement.",
    comparisonRows: [
      ["Mode de conversion", "Local sur Windows", "En ligne"],
      ["Compte", "Non", "Selon les usages et options"],
      ["Fichiers lourds", "Dépend du PC et du disque", "Dépend des limites du service"],
      ["Confidentialité", "Pas d'upload obligatoire", "Upload nécessaire"],
      ["Prix", "Gratuit", "Offre gratuite avec limites possibles"],
      ["Code source", "Public sur GitHub", "Service propriétaire"]
    ],
    faq: [
      [
        "Pourquoi éviter un convertisseur en ligne ?",
        "Pour ne pas envoyer des fichiers sensibles, éviter les limites de taille ou garder le contrôle du processus de conversion."
      ],
      [
        "Multi-Converter fonctionne-t-il sur macOS ?",
        "Oui. Multi-Converter v1.0.6 est disponible pour Windows x64, macOS universel et Linux x64."
      ]
    ]
  },
  {
    slug: "zamzar",
    service: "Zamzar",
    title: "Alternative à Zamzar gratuite et locale",
    description:
      "Comparez Zamzar et Multi-Converter si vous cherchez un convertisseur gratuit, open source et local pour Windows.",
    h1: "Alternative à Zamzar pour convertir sans envoyer ses fichiers",
    intro:
      "Zamzar est un convertisseur de fichiers en ligne historique. Multi-Converter propose une approche locale pour Windows, pensée pour convertir sans compte et sans upload obligatoire.",
    bestForService:
      "Zamzar peut convenir si vous avez besoin d'un service web simple depuis un navigateur et que les limites du service suffisent.",
    bestForMultiConverter:
      "Multi-Converter est plus pertinent si vous voulez une application gratuite, open source et utilisable localement pour documents, images, audio et vidéos.",
    comparisonRows: [
      ["Type", "Application locale", "Service web"],
      ["Upload", "Non obligatoire", "Oui"],
      ["Compte", "Non", "Selon l'usage"],
      ["Prix", "Gratuit", "Offre gratuite avec limites possibles"],
      ["Open source", "Oui", "Non"],
      ["Vie privée", "Fichiers gardés sur le PC", "Fichiers envoyés au service"]
    ],
    faq: [
      [
        "Multi-Converter est-il une alternative gratuite à Zamzar ?",
        "Oui pour les conversions locales proposées par l'application. Les formats disponibles dépendent du fichier source et des moteurs installés."
      ],
      [
        "Quel est l'avantage principal par rapport à Zamzar ?",
        "Le principal avantage est de convertir localement, sans compte et sans upload obligatoire vers un service web."
      ]
    ]
  }
];

export function getAlternativePage(slug: string) {
  return alternativePages.find((page) => page.slug === slug);
}
