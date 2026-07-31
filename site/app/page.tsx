import fs from "node:fs";
import path from "node:path";
import type { CSSProperties } from "react";
import { alternativePages } from "./alternative-data";
import { conversionPages } from "./conversion-data";
import {
  alternativeDescription,
  alternativeTitle,
  conversionDescription,
  conversionTitle,
  formatDescription,
  formatTitle,
  guideDescription,
  guideIntent,
  guideTitle
} from "./english-content";
import { formatPages } from "./format-data";
import { guidePages } from "./guide-data";
import { FormatSearchTable, type FormatRow } from "./format-search-table";
import { ImagePreview } from "./image-preview";
import { InteractiveBackground } from "./interactive-background";
import { LatestRelease, VersionBadge, WindowsDownloadButton } from "./latest-release";
import { aboutPath, conversionPath, convertHubPath, documentationPath, downloadPath, guidePath } from "./seo-routes";
import { getSiteUrl, localPath } from "./site-url";

const productVersion = process.env.NEXT_PUBLIC_PRODUCT_VERSION || "v1.0.0";
const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const releasesUrl = process.env.NEXT_PUBLIC_RELEASES_URL || `${sourceUrl}/releases/latest`;
const latestReleaseApiUrl =
  process.env.NEXT_PUBLIC_LATEST_RELEASE_API_URL || "https://api.github.com/repos/Amix29/Multi-Converter/releases/latest";
const siteUrl = getSiteUrl();

function screenshotExists(fileName: string) {
  return fs.existsSync(path.join(process.cwd(), "public", "screenshots", fileName));
}

const optimizedScreenshotWidths = [640, 960, 1280, 1920, 2560];
const screenshotSizes = "(max-width: 820px) calc(100vw - 28px), (max-width: 1120px) calc(100vw - 40px), min(68vw, 700px)";
const settingsScreenshotSizes =
  "(max-width: 820px) calc(100vw - 28px), (max-width: 1120px) calc(100vw - 40px), min(62vw, 730px)";

function optimizedScreenshotSources(fileName: string) {
  const parsed = path.parse(fileName);

  return ["avif", "webp"].flatMap((format) => {
    const srcSet = optimizedScreenshotWidths
      .map((width) => {
        const optimizedFile = `${parsed.name}-${width}.${format}`;
        const optimizedPath = path.join(process.cwd(), "public", "screenshots", "optimized", optimizedFile);

        return fs.existsSync(optimizedPath) ? `${localPath(`/screenshots/optimized/${optimizedFile}`)} ${width}w` : "";
      })
      .filter(Boolean)
      .join(", ");

    return srcSet ? [{ srcSet, type: `image/${format}` }] : [];
  });
}

const screenshots = [
  {
    title: "Conversion interface",
    text: "Add your files, review the queue and start conversions from a clear interface.",
    fileName: "conversion-interface.png"
  },
  {
    title: "Format selection",
    text: "Choose the output format offered for your file.",
    fileName: "format-selection.png"
  },
  {
    title: "Ready to download",
    text: "Once finished, recover the converted files directly on your computer.",
    fileName: "ready-download.png"
  }
];

const heroFormats = ["PDF", "MP4", "PNG", "DOCX", "MP3"];
const featuredConversionPages = conversionPages.slice(0, 8);
const featuredAlternativePages = alternativePages.slice(0, 5);
const featuredFormatPages = formatPages.filter((page) => ["pdf", "docx", "csv", "png", "mp4", "mp3"].includes(page.slug));
const featuredGuidePages = guidePages.slice(0, 3);

const screenshotImageWidth = 2561;
const screenshotImageHeight = 1601;
const screenshotTopCrop = 40;
const screenshotSideCrop = 4;
const screenshotBottomCrop = 12;
const settingsFileName = "settings.png";
const reportFileName = "report.png";

const formatRows: FormatRow[] = [
  {
    category: "Documents and text",
    formats: "PDF, DOCX, DOC, TXT, LOG, HTML, HTM, CSV, JSON, ODT, RTF, Markdown, MD, EPUB, XML"
  },
  {
    category: "Images",
    formats: "PNG, JPEG, JPG, GIF, SVG, WebP, TIFF, TIF, BMP, ICO"
  },
  {
    category: "Audio",
    formats: "MP3, AAC, M4A, FLAC, WAV, OGG, OGA, WMA, OPUS, AIFF, AIF, ALAC, AC3, MP2, AMR, AU, SND, CAF"
  },
  {
    category: "Video",
    formats: "MP4, M4V, MKV, WebM, MOV, AVI, WMV, 3GP, 3G2, MTS, M2TS, MPEG-2, MPG, MPEG, OGV"
  }
];

const reasons = [
  ["Keep files private", "Conversions run on your computer, without mandatory upload."],
  ["Cover common formats", "PDF, images, audio, video and documents are recognized without switching tools."],
  ["Use a free tool", "Multi-Converter is free and open source."],
  ["Go further when needed", "The Maximum Quality extension adds specialized engines for complex conversions."],
  ["Keep it simple", "Add your files, choose a format, recover the result."]
];

const comparisonServices = ["Multi-Converter", "FreeConvert", "CloudConvert", "Convertio", "Online-Convert", "Zamzar"];

const comparisonRows = [
  {
    feature: "Cloud",
    values: [
      ["No", "Your files stay on your PC.", "positive"],
      ["Yes", "Server-side conversion.", "negative"],
      ["Yes", "Server-side conversion.", "negative"],
      ["Yes", "Server-side conversion.", "negative"],
      ["Yes", "Server-side conversion.", "negative"],
      ["Yes", "Server-side conversion.", "negative"]
    ]
  },
  {
    feature: "Offline",
    values: [
      ["Yes", "After installation.", "positive"],
      ["No", "Web service.", "negative"],
      ["No", "Web service.", "negative"],
      ["No", "Web service.", "negative"],
      ["No", "Web service.", "negative"],
      ["No", "Web service.", "negative"]
    ]
  },
  {
    feature: "Open source",
    values: [
      ["Yes", "Public code on GitHub.", "positive"],
      ["No", "Proprietary service.", "negative"],
      ["No", "Proprietary service.", "negative"],
      ["No", "Proprietary service.", "negative"],
      ["No", "Proprietary service.", "negative"],
      ["No", "Proprietary service.", "negative"]
    ]
  },
  {
    feature: "Free without cloud limits",
    values: [
      ["Yes", "No subscription or cloud quota.", "positive"],
      ["No", "Daily/file limits.", "negative"],
      ["No", "Daily credits.", "negative"],
      ["No", "Free tier limits.", "negative"],
      ["No", "Free tier limits.", "negative"],
      ["No", "Free tier limits.", "negative"]
    ]
  },
  {
    feature: "Account required",
    values: [
      ["No", "No sign-up.", "positive"],
      ["No", "For free web use.", "positive"],
      ["Yes", "Free account for the free plan.", "negative"],
      ["No", "For free web use.", "positive"],
      ["No", "For free web use.", "positive"],
      ["No", "For free web use.", "positive"]
    ]
  },
  {
    feature: "File size limit",
    values: [
      ["No", "Mostly limited by your machine.", "positive"],
      ["Yes", "Free tier limit.", "negative"],
      ["Yes", "Free tier limit.", "negative"],
      ["Yes", "Free tier limit.", "negative"],
      ["Yes", "Free tier limit.", "negative"],
      ["Yes", "Free tier limit.", "negative"]
    ]
  },
  {
    feature: "Documents, images, audio and video",
    values: [
      ["Yes", "Main formats covered.", "positive"],
      ["Yes", "Main formats covered.", "positive"],
      ["Yes", "Main formats covered.", "positive"],
      ["Yes", "Main formats covered.", "positive"],
      ["Yes", "Main formats covered.", "positive"],
      ["Yes", "Main formats covered.", "positive"]
    ]
  }
] satisfies {
  feature: string;
  values: [label: string, detail: string, tone: "positive" | "negative"][];
}[];

const faqs = [
  [
    "Is it really free?",
    "Yes. Multi-Converter is free and open source. There is no subscription, no paid plan and no features hidden behind a payment. The source code is public on GitHub."
  ],
  [
    "Are my files uploaded online?",
    "No. Supported conversions run directly on your computer. Your files do not need to leave your machine. Internet is only needed to download the app or updates."
  ],
  [
    "Do I need an account?",
    "No. Download and install the app. No account, sign-up or email address is required for supported local conversions."
  ],
  [
    "What is the Maximum Quality extension?",
    "It is an optional module that installs specialized engines for more accurate conversions, especially Office files, PDF, Markdown and some images. Most common conversions can start without it."
  ],
  [
    "Is Multi-Converter available on Mac or Linux?",
    "Yes. Multi-Converter v1.0.6 is available for Windows x64, macOS as one universal build for Apple Silicon and Intel, and Linux x64."
  ],
  [
    "Why are some conversions not offered for my file?",
    "Available options depend on the source format and engines installed on your machine. Some advanced conversions require the Maximum Quality extension."
  ]
];

const faqColumns = [
  faqs.filter((_, index) => index % 2 === 0),
  faqs.filter((_, index) => index % 2 === 1)
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Multi-Converter",
    url: siteUrl,
    sameAs: [sourceUrl],
    downloadUrl: releasesUrl,
    installUrl: releasesUrl,
    codeRepository: sourceUrl,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    datePublished: "2026-06-02",
    dateModified: "2026-06-02",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Windows",
    softwareVersion: productVersion,
    description:
      "Multi-Converter is a free open-source file converter for Windows. It converts documents, images, audio and video locally, without an account and without mandatory upload.",
    featureList: [
      "Local file conversion on Windows",
      "Document, data, image, audio and video conversion",
      "No account required",
      "No subscription required",
      "Open source code",
      "Optional Maximum Quality extension with PDFium, LibreOffice, Pandoc and libvips"
    ],
    screenshot: screenshots.map((shot) => `${siteUrl}/screenshots/${shot.fileName}`),
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      url: siteUrl
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    dateModified: "2026-06-02",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer
      }
    }))
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/`
      }
    ]
  }
];

function ScreenshotCard({
  title,
  text,
  fileName,
  featured = false
}: {
  title: string;
  text: string;
  fileName: string;
  featured?: boolean;
}) {
  const imageAvailable = screenshotExists(fileName);
  const src = localPath(`/screenshots/${fileName}`);

  return (
    <article
      className={featured ? "screenshot-card featured-shot reveal-window" : "screenshot-card reveal-window"}
      data-reveal-item
    >
      <div className="screenshot-media">
        {imageAvailable ? (
          <ImagePreview
            src={src}
            alt={`${title} in Multi-Converter`}
            cropTop={screenshotTopCrop}
            cropRight={screenshotSideCrop}
            cropBottom={screenshotBottomCrop}
            cropLeft={screenshotSideCrop}
            width={screenshotImageWidth}
            height={screenshotImageHeight}
            sizes={screenshotSizes}
            sources={optimizedScreenshotSources(fileName)}
          />
        ) : (
          <div className="screenshot-fallback">
            <span>Screenshot to add</span>
            <strong>{fileName}</strong>
          </div>
        )}
      </div>
      <div className="screenshot-copy">
        <p>{text}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const settingsAvailable = screenshotExists(settingsFileName);
  const reportAvailable = screenshotExists(reportFileName);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main id="top" className="home-page">
        <InteractiveBackground />
        <section className="home-hero shell" aria-labelledby="hero-title">
          <div className="home-hero-copy">
            <span className="section-kicker">Local file converter</span>
            <div className="hero-title-stage">
              <div className="hero-format-stream" aria-hidden="true">
                {heroFormats.map((format) => (
                  <span className="format-token" key={format}>
                    {format}
                  </span>
                ))}
              </div>
              <h1 id="hero-title">Multi-Converter</h1>
            </div>
            <div className="hero-version-row">
              <VersionBadge apiUrl={latestReleaseApiUrl} releasesUrl={releasesUrl} />
            </div>
            <p className="lead">
              Convert documents, images, audio and video directly on your computer. Free, open source, no account and
              no mandatory cloud upload.
            </p>
            <div className="actions">
              <a className="btn primary" href={localPath(downloadPath)}>
                Download
              </a>
              <a className="btn ghost" href={sourceUrl} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
            <dl className="quick-facts" aria-label="Quick facts">
              <div>
                <dt>Platform</dt>
                <dd>Windows · macOS · Linux</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>Free & Open Source</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="demo" className="shell screenshots-section reveal-section" aria-labelledby="demo-title" data-reveal-section>
          <div className="section-heading">
            <span className="section-kicker">Demo</span>
            <h2 id="demo-title">Your conversions in 3 steps.</h2>
            <p>Multi-Converter keeps the workflow clear without burying you in complicated settings.</p>
          </div>
          <div className="screenshot-grid">
            {screenshots.map((shot) => (
              <ScreenshotCard key={shot.fileName} {...shot} />
            ))}
          </div>
        </section>

        <section id="parametres" className="settings-section shell reveal-section" aria-labelledby="settings-title" data-reveal-section>
          <div className="settings-media">
            {settingsAvailable ? (
              <ImagePreview
                src={localPath(`/screenshots/${settingsFileName}`)}
                alt="Multi-Converter settings"
                cropTop={screenshotTopCrop}
                cropRight={screenshotSideCrop}
                cropBottom={screenshotBottomCrop}
                cropLeft={screenshotSideCrop}
                width={screenshotImageWidth}
                height={screenshotImageHeight}
                sizes={settingsScreenshotSizes}
                sources={optimizedScreenshotSources(settingsFileName)}
              />
            ) : (
              <div className="screenshot-fallback settings-fallback">
                <span>Screenshot to add</span>
                <strong>{settingsFileName}</strong>
              </div>
            )}
          </div>
          <div className="settings-copy">
            <span className="section-kicker">Useful settings</span>
            <h2 id="settings-title" className="settings-title">
              <span>Tune</span>
              <span>Multi&#8209;Converter</span>
              <span>to your workflow.</span>
            </h2>
            <p>Change the language and enable an extension when needed.</p>
          </div>
          <article className="settings-report-card screenshot-card reveal-window" data-reveal-item>
            <div className="screenshot-media">
              {reportAvailable ? (
                <ImagePreview
                  src={localPath(`/screenshots/${reportFileName}`)}
                  alt="Multi-Converter report or suggest dialog"
                  cropTop={screenshotTopCrop}
                  cropRight={screenshotSideCrop}
                  cropBottom={screenshotBottomCrop}
                  cropLeft={screenshotSideCrop}
                  width={screenshotImageWidth}
                  height={screenshotImageHeight}
                  sizes={screenshotSizes}
                  sources={optimizedScreenshotSources(reportFileName)}
                />
              ) : (
                <div className="screenshot-fallback settings-fallback">
                  <span>Screenshot to add</span>
                  <strong>{reportFileName}</strong>
                </div>
              )}
            </div>
            <div className="screenshot-copy settings-report-copy">
              <p>Report a bug, request a feature or send another suggestion directly from Multi-Converter.</p>
            </div>
          </article>
        </section>

        <section id="formats" className="formats-section shell reveal-section" aria-labelledby="formats-title" data-reveal-section>
          <div className="section-heading">
            <span className="section-kicker">Available formats</span>
            <h2 id="formats-title">The main formats are covered.</h2>
            <p>Search for a format like PDF, MP4, WebP or DOCX to see its category.</p>
          </div>
          <FormatSearchTable rows={formatRows} />
          <div className="section-link-row">
            <a className="text-link" href={localPath("/formats/")}>View format guides</a>
          </div>
          <div className="conversion-card-grid compact-card-grid home-format-links">
            {featuredFormatPages.map((page) => (
              <a className="conversion-card" href={localPath(`/formats/${page.slug}/`)} key={page.slug}>
                <span>{page.name}</span>
                <strong>{formatTitle(page)}</strong>
                <p>{formatDescription(page)}</p>
              </a>
            ))}
          </div>
        </section>

        <section
          id="convertir"
          className="popular-conversions-section shell reveal-section"
          aria-labelledby="convert-title"
          data-nav-section="formats"
          data-reveal-section
        >
          <div className="section-heading">
            <span className="section-kicker">Popular conversions</span>
            <h2 id="convert-title">Guides for the most useful conversions.</h2>
            <p>
              Each page explains when to use the conversion, how to run it locally and what to check for a clean result.
            </p>
          </div>
          <div className="conversion-card-grid">
            {featuredConversionPages.map((page) => (
              <a className="conversion-card" href={localPath(conversionPath(page))} key={page.slug}>
                <span>{page.source} to {page.target}</span>
                <strong>{conversionTitle(page)}</strong>
                <p>{conversionDescription(page)}</p>
              </a>
            ))}
          </div>
          <div className="section-link-row">
            <a className="text-link" href={localPath(convertHubPath)}>View all popular conversions</a>
          </div>
        </section>

        <section id="comparaison" className="comparison-section shell reveal-section" aria-labelledby="comparison-title" data-reveal-section>
          <div className="section-heading">
            <span className="section-kicker">Comparison</span>
            <h2 id="comparison-title">Local or cloud: the difference is clear.</h2>
            <p>
              Multi-Converter favors privacy and local use without cloud service limits. Online services remain useful,
              but they require file uploads and often apply free-tier limits.
            </p>
          </div>
          <div className="table-scroll comparison-scroll">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  {comparisonServices.map((service, index) => (
                    <th
                      className="comparison-column-cell"
                      scope="col"
                      key={service}
                      style={{ "--comparison-column": index } as CSSProperties}
                    >
                      {service}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row">{row.feature}</th>
                    {row.values.map(([label, detail, tone], index) => (
                      <td
                        className="comparison-column-cell"
                        key={`${row.feature}-${comparisonServices[index]}`}
                        style={{ "--comparison-column": index } as CSSProperties}
                      >
                        <span className={`comparison-status ${tone}`}>{label}</span>
                        <span className="comparison-detail">{detail}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="comparison-note">
            The limits shown reflect public free tiers checked in June 2026 and may change depending on each service.
          </p>
          <div className="section-link-row">
            <a className="text-link" href={localPath("/alternatives/")}>View detailed alternatives to cloud converters</a>
          </div>
        </section>

        <section
          id="alternatives"
          className="popular-conversions-section shell reveal-section"
          aria-labelledby="alternatives-title"
          data-nav-section="comparaison"
          data-reveal-section
        >
          <div className="section-heading">
            <span className="section-kicker">Cloud service alternatives</span>
            <h2 id="alternatives-title">Compare Multi-Converter with online converters.</h2>
            <p>
              Dedicated pages explain when to choose a web service and when to prefer local conversion on Windows.
            </p>
          </div>
          <div className="conversion-card-grid">
            {featuredAlternativePages.map((page) => (
              <a className="conversion-card" href={localPath(`/alternatives/${page.slug}/`)} key={page.slug}>
                <span>Alternative to {page.service}</span>
                <strong>{alternativeTitle(page)}</strong>
                <p>{alternativeDescription(page)}</p>
              </a>
            ))}
          </div>
        </section>

        <section
          id="guides"
          className="popular-conversions-section shell reveal-section"
          aria-labelledby="guides-title"
          data-nav-section="pourquoi"
          data-reveal-section
        >
          <div className="section-heading">
            <span className="section-kicker">Guides</span>
            <h2 id="guides-title">Understand local conversion before choosing.</h2>
            <p>
              Guides explain when to prefer a local, offline, no-upload or open-source converter on Windows.
            </p>
          </div>
          <div className="conversion-card-grid centered-card-grid">
            {featuredGuidePages.map((page) => (
              <a className="conversion-card" href={localPath(guidePath(page))} key={page.slug}>
                <span>{guideIntent(page)}</span>
                <strong>{guideTitle(page)}</strong>
                <p>{guideDescription(page)}</p>
              </a>
            ))}
          </div>
          <div className="section-link-row">
            <a className="text-link" href={localPath("/guides/")}>View all local conversion guides</a>
            {" "}
            <a className="text-link" href={localPath(documentationPath)}>Open the documentation</a>
          </div>
        </section>

        <section id="pourquoi" className="reasons-section shell reveal-section" aria-labelledby="reasons-title" data-reveal-section>
          <div className="section-heading">
            <span className="section-kicker">Why Multi-Converter?</span>
            <h2 id="reasons-title">A simple tool for direct conversion.</h2>
          </div>
          <div className="table-scroll">
            <table className="data-table reason-table">
              <thead>
                <tr>
                  <th scope="col">Need</th>
                  <th scope="col">What Multi-Converter provides</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map(([need, value]) => (
                  <tr key={need}>
                    <th scope="row">{need}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="faq-section shell reveal-section" aria-labelledby="faq-title" data-reveal-section>
          <div className="section-heading">
            <span className="section-kicker">FAQ</span>
            <h2 id="faq-title">Questions before installing.</h2>
            <p>Useful answers about privacy, formats and the Windows download.</p>
          </div>
          <div className="faq-list">
            {faqColumns.map((column, columnIndex) => (
              <div className="faq-column" key={`faq-column-${columnIndex}`}>
                {column.map(([question, answer]) => (
                  <details className="faq-item" key={question}>
                    <summary>{question}</summary>
                    <div className="faq-answer">
                      <div>
                        <p>{answer}</p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section id="download" className="final-cta shell reveal-section" aria-labelledby="download-title" data-reveal-section>
          <div className="download-copy">
            <span className="section-kicker">Download</span>
            <h2 id="download-title">Download Multi-Converter</h2>
            <p>Install a free, local and open-source file converter for Windows, macOS or Linux.</p>
            <LatestRelease apiUrl={latestReleaseApiUrl} releasesUrl={releasesUrl} />
          </div>
          <div className="download-actions-panel">
            <div className="actions final-actions">
              <WindowsDownloadButton apiUrl={latestReleaseApiUrl} releasesUrl={releasesUrl} />
              <a className="btn ghost" href={localPath(downloadPath)}>
                Download page
              </a>
              <a className="btn ghost" href={sourceUrl} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
              <a className="btn ghost" href={localPath(documentationPath)}>
                Documentation
              </a>
            </div>
            <a className="story-teaser download-story-teaser" href={localPath(aboutPath)}>
              <p>
                I created <strong>Multi-Converter</strong> because it is the tool I needed.
              </p>
              <span>Read the story</span>
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
