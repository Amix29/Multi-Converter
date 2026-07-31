import type { AlternativePage } from "./alternative-data";
import type { ConversionPage } from "./conversion-data";
import type { FormatPage } from "./format-data";
import type { GuidePage } from "./guide-data";

export function englishCategory(category: string) {
  const categories: Record<string, string> = {
    Données: "Data",
    Vidéo: "Video"
  };

  return categories[category] || category;
}

export function conversionTitle(page: Pick<ConversionPage, "source" | "target">) {
  return `Convert ${page.source} to ${page.target} locally on Windows`;
}

export function conversionDescription(page: Pick<ConversionPage, "source" | "target">) {
  return `Convert ${page.source} to ${page.target} on Windows with Multi-Converter, a free local file converter that avoids cloud upload, accounts and subscriptions.`;
}

export function conversionH1(page: Pick<ConversionPage, "source" | "target">) {
  return `Convert ${page.source} to ${page.target} on your PC`;
}

export function conversionIntro(page: Pick<ConversionPage, "source" | "target">) {
  return `${page.source} to ${page.target} conversion is useful when you need a different file format without sending the original file to an online converter. Multi-Converter keeps supported conversions local on Windows, depending on the engines available on the computer.`;
}

export function conversionBenefit(page: Pick<ConversionPage, "source" | "target">) {
  return `A local ${page.source} to ${page.target} converter helps keep private files, large media and work documents on your own machine instead of uploading them to a third-party service.`;
}

export function conversionQualityNote(page: Pick<ConversionPage, "source" | "target">) {
  return `Quality depends on the source file structure, installed engines and selected output format. For complex files, the optional Maximum Quality extension can unlock more specialized local engines.`;
}

export function conversionSteps(page: Pick<ConversionPage, "source" | "target">) {
  return [
    `Add the ${page.source} file to Multi-Converter.`,
    `Choose ${page.target} when it is offered for this file.`,
    "Start the conversion and open the generated file from the output folder."
  ];
}

export function conversionTips(page: Pick<ConversionPage, "source" | "target">) {
  return [
    "Keep the original file until you have checked the converted result.",
    "Review layout, images, tables, audio or video quality after conversion.",
    "Enable Maximum Quality when the base app does not offer the conversion or when fidelity matters."
  ];
}

export function conversionFaq(page: Pick<ConversionPage, "source" | "target">): [string, string][] {
  return [
    [
      `Is the ${page.source} file uploaded online?`,
      "No. Multi-Converter is designed for local file conversion on your computer for supported conversions."
    ],
    [
      `Will the ${page.target} result always match the original?`,
      "Not always. Output quality depends on the source file, the target format and the local engines installed on Windows."
    ]
  ];
}

export function formatTitle(page: Pick<FormatPage, "name">) {
  return `${page.name} file converter for Windows PCs`;
}

export function formatDescription(page: Pick<FormatPage, "name">) {
  return `Convert ${page.name} files locally with Multi-Converter on Windows, keeping supported documents, images, audio or video files off cloud services.`;
}

export function formatH1(page: Pick<FormatPage, "name">) {
  return `Convert ${page.name} files locally`;
}

export function formatIntro(page: Pick<FormatPage, "name" | "longName">) {
  return `${page.name} (${page.longName}) is one of the file formats recognized by Multi-Converter. Available conversions depend on the source file, target format and local engines installed on the computer.`;
}

export function formatLocalUse(page: Pick<FormatPage, "name">) {
  return `A local ${page.name} converter is useful when you want to process documents, data, images, audio or video files without uploading them to an online converter.`;
}

export function formatCommonUses(page: Pick<FormatPage, "name">) {
  return [
    `Convert ${page.name} files to a more practical output format when supported.`,
    "Prepare files for sharing, archiving, editing or playback.",
    "Keep sensitive or large files on your own Windows computer."
  ];
}

export function formatQualityTips(page: Pick<FormatPage, "name">) {
  return [
    "Check the converted file before deleting the original.",
    "Use Maximum Quality for complex documents, advanced images or conversions that need stronger fidelity.",
    `Remember that recognizing ${page.name} does not mean every conversion from or to ${page.name} is available.`
  ];
}

export function formatWorkflowNote(page: Pick<FormatPage, "name" | "category">) {
  const categoryUses: Record<FormatPage["category"], string> = {
    Document:
      "document layouts, embedded images, fonts, tables and exported pages can change depending on the local document engine",
    Données:
      "data files need clean separators, valid syntax and predictable columns or keys before a reliable conversion is possible",
    Image:
      "image conversions should be checked for transparency, color changes, dimensions and compression artifacts",
    Audio:
      "audio conversions should be checked for duration, volume, codec compatibility and quality loss when moving to compressed formats",
    Vidéo:
      "video conversions should be checked for playback, audio synchronization, subtitles, duration and file size"
  };

  return `For ${page.name} files, the most important check is the result, not only the file extension. ${categoryUses[page.category]}. Multi-Converter keeps the workflow local, but the available targets still depend on the source file and the engines installed on Windows.`;
}

export function formatSearchIntentAnswer(page: Pick<FormatPage, "name" | "category">) {
  const categoryAnswer: Record<FormatPage["category"], string> = {
    Document:
      "Local document conversion is useful for contracts, notes, reports, school files, archives and Office-style documents that should not be uploaded to a web service.",
    Données:
      "Local data conversion is useful for exports, logs, API files, spreadsheets and internal datasets where privacy and clean structure matter.",
    Image:
      "Local image conversion is useful for screenshots, design assets, product images, icons and private pictures that should stay on the computer.",
    Audio:
      "Local audio conversion is useful for voice notes, recordings, podcasts, music files and meeting audio where upload limits or privacy are concerns.",
    Vidéo:
      "Local video conversion is useful for large personal videos, screen recordings, camera files and work media that would be slow or sensitive to upload."
  };

  return `${categoryAnswer[page.category]} A ${page.name} converter page should therefore explain compatibility, local processing and the limits of recognized formats clearly.`;
}

export function formatFaq(page: Pick<FormatPage, "name">): [string, string][] {
  return [
    [
      `Can Multi-Converter convert every ${page.name} file?`,
      `Not necessarily. Multi-Converter recognizes ${page.name} files, but the available conversions depend on the file itself, the requested output format and the local engines installed on Windows.`
    ],
    [
      `Why use a local ${page.name} converter instead of an online service?`,
      `A local ${page.name} converter helps keep supported files on your computer, avoids mandatory upload and avoids account or subscription requirements for local conversions.`
    ]
  ];
}

export function guideTitle(page: GuidePage) {
  const titles: Record<string, string> = {
    "convertisseur-fichiers-local": "Local file converter for Windows",
    "conversion-fichiers-hors-ligne": "Offline file conversion on Windows",
    "convertisseur-sans-upload": "File converter without upload",
    "convertisseur-open-source-windows": "Open source file converter for Windows",
    "convertisseur-windows-gratuit": "Free Windows file converter",
    "local-vs-convertisseur-en-ligne": "Local vs online file converter",
    "convertisseur-pdf-local": "Local PDF converter for Windows",
    "convertisseur-audio-local": "Local audio converter for Windows",
    "convertisseur-video-sans-upload": "Video converter without upload",
    "extension-maximum-quality": "Maximum Quality extension for Multi-Converter"
  };

  return titles[page.slug] || page.title;
}

export function guideDescription(page: GuidePage) {
  const descriptions: Record<string, string> = {
    "convertisseur-fichiers-local":
      "Learn why a local Windows file converter helps with privacy, large files, offline work and account-free conversion without mandatory cloud upload.",
    "conversion-fichiers-hors-ligne":
      "Understand offline file conversion on Windows, when a local converter is better than a cloud service, and how to keep supported files on your PC.",
    "convertisseur-sans-upload":
      "Use a file converter without mandatory upload when private documents, media files or data exports should stay on your Windows computer.",
    "convertisseur-open-source-windows":
      "See why an open source Windows file converter gives more transparency than proprietary online conversion services that require file upload.",
    "convertisseur-windows-gratuit":
      "Find out how a free Windows file converter can process common files locally without subscriptions, online accounts or cloud upload limits.",
    "local-vs-convertisseur-en-ligne":
      "Compare local and online file converters for privacy, file-size limits, account requirements, offline use and open-source transparency.",
    "convertisseur-pdf-local":
      "Use a local PDF converter for Windows to process PDF, HTML, DOCX, ODT, RTF and EPUB while avoiding mandatory upload to cloud services.",
    "convertisseur-audio-local":
      "Convert audio locally on Windows, keep recordings on your PC and avoid uploading MP3, WAV, FLAC, AAC or OGG files to a web service.",
    "convertisseur-video-sans-upload":
      "Convert videos locally on Windows without mandatory upload for MOV, MKV, AVI, WebM and MP4 workflows where files should stay on your PC.",
    "extension-maximum-quality":
      "Understand the optional Maximum Quality extension and the PDFium, LibreOffice, Pandoc and libvips engines it adds for local conversions."
  };

  return descriptions[page.slug] || page.description;
}

export function guideIntent(page: GuidePage) {
  const intents: Record<string, string> = {
    "convertisseur-fichiers-local": "Choose a local converter",
    "conversion-fichiers-hors-ligne": "Convert files offline",
    "convertisseur-sans-upload": "Avoid mandatory upload",
    "convertisseur-open-source-windows": "Choose open source software",
    "convertisseur-windows-gratuit": "Use a free Windows converter",
    "local-vs-convertisseur-en-ligne": "Compare local and cloud",
    "convertisseur-pdf-local": "Convert PDF files locally",
    "convertisseur-audio-local": "Convert audio locally",
    "convertisseur-video-sans-upload": "Convert videos without upload",
    "extension-maximum-quality": "Improve conversion fidelity"
  };

  return intents[page.slug] || page.intent;
}

export function guideDirectAnswer(page: GuidePage) {
  return `${guideTitle(page)} is relevant when you want to keep files on your Windows computer, avoid mandatory upload, avoid account requirements and use a free open-source converter for supported local conversions.`;
}

export function guideSections(page: GuidePage) {
  return [
    {
      heading: "When this approach makes sense",
      body:
        "A local converter is most useful for private documents, large media files, repeated conversions, unstable connections or workflows where creating an online account is unnecessary.",
      bullets: [
        "Keep supported conversions on your own Windows computer",
        "Avoid cloud file-size limits and upload queues",
        "Use a free open-source tool instead of a gated web service",
        "Install optional local engines when stronger fidelity is needed"
      ]
    },
    {
      heading: "What Multi-Converter provides",
      body:
        "Multi-Converter focuses on common document, data, image, audio and video conversions while keeping the workflow simple: add files, choose an available output format, then recover the result locally.",
      bullets: [
        "No account required for local conversions",
        "No subscription model",
        "Public source code",
        "Optional Maximum Quality extension for advanced engines"
      ]
    },
    {
      heading: "Important limitation",
      body:
        "Recognizing a format does not mean every format can be converted to every other format. Available options depend on the source file, target format and installed local engines.",
      bullets: [
        "Conversion options depend on the input file",
        "Some advanced formats need specialized engines",
        "Final quality can vary with file structure"
      ]
    }
  ];
}

export function guideComparisonRows(): Array<[string, string, string]> {
  return [
    ["Privacy", "File processed on your computer", "File uploaded to a third-party service"],
    ["Account", "No account required", "Sometimes required depending on the service"],
    ["Large files", "Mostly limited by your machine", "Free cloud limits are common"],
    ["Offline use", "Possible after installation", "Internet connection required"],
    ["Transparency", "Public source code", "Proprietary service"]
  ];
}

export function guideFaq(page: GuidePage): Array<[string, string]> {
  return [
    [
      "Is local conversion more private than online conversion?",
      "For supported local conversions, yes. The file stays on your computer instead of being uploaded to a third-party server."
    ],
    [
      "Does Multi-Converter require an account?",
      "No. Multi-Converter does not require a user account for supported local conversions."
    ],
    [
      `Is ${guideTitle(page)} available on macOS or Linux?`,
      "Yes. Multi-Converter v1.0.6 is available for Windows x64, universal macOS and Linux x64."
    ]
  ];
}

export function alternativeTitle(page: Pick<AlternativePage, "service">) {
  return `${page.service} alternative for local file conversion`;
}

export function alternativeDescription(page: Pick<AlternativePage, "service">) {
  return `Compare Multi-Converter with ${page.service}: local Windows conversion, no mandatory upload, no subscription and no account for supported conversions.`;
}

export function alternativeH1(page: Pick<AlternativePage, "service">) {
  return `Alternative to ${page.service}`;
}

export function alternativeRows(page: Pick<AlternativePage, "service">): Array<[string, string, string]> {
  return [
    ["Processing", "Local on Windows", `${page.service} runs conversions in the cloud`],
    ["Upload", "No mandatory upload for supported conversions", "Files must be uploaded to the web service"],
    ["Account", "No account required", "Depends on the service and plan"],
    ["Pricing", "Free and open source", "Free tiers often include limits"],
    ["Best use case", "Privacy, repeated conversions and large files", "One-off conversions when installing software is not possible"]
  ];
}

export function alternativeFaq(page: Pick<AlternativePage, "service">): Array<[string, string]> {
  return [
    [
      `Is Multi-Converter a ${page.service} replacement?`,
      `It can replace ${page.service} when you want local Windows conversion for supported formats, without mandatory upload or a subscription.`
    ],
    [
      `When should I still use ${page.service}?`,
      `A cloud service like ${page.service} can still be useful for a one-off conversion on a device where you cannot install software.`
    ]
  ];
}

export function alternativeDecisionNote(page: Pick<AlternativePage, "service">) {
  return `The practical difference between Multi-Converter and ${page.service} is where the conversion happens. Multi-Converter runs supported conversions on a Windows PC, while ${page.service} is a cloud service that receives the file before processing it. That difference matters most for private files, large videos, repeated conversions and users who do not want a web account.`;
}

export function alternativeLimitNote(page: Pick<AlternativePage, "service">) {
  return `${page.service} can still be the better option when you are on a shared computer, a mobile device or a locked-down machine where installing software is impossible. Multi-Converter is the stronger fit when you control the Windows PC and want a free open-source converter that keeps supported conversions local.`;
}
