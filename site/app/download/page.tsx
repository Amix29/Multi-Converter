import type { Metadata } from "next";
import { conversionPages } from "../conversion-data";
import { conversionDescription, conversionTitle, formatDescription, formatTitle } from "../english-content";
import { formatPages } from "../format-data";
import { LatestRelease, WindowsDownloadButton } from "../latest-release";
import { buildSeoMetadata } from "../seo-metadata";
import { conversionPath, documentationPath, downloadPath } from "../seo-routes";
import { getSiteUrl, localPath } from "../site-url";

const productVersion = process.env.NEXT_PUBLIC_PRODUCT_VERSION || "v1.0.0";
const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const releasesUrl = process.env.NEXT_PUBLIC_RELEASES_URL || `${sourceUrl}/releases/latest`;
const latestReleaseApiUrl =
  process.env.NEXT_PUBLIC_LATEST_RELEASE_API_URL || "https://api.github.com/repos/Amix29/Multi-Converter/releases/latest";

const featuredConversions = conversionPages.filter((page) =>
  ["docx-en-pdf", "png-en-webp", "mp4-en-mp3", "mov-en-mp4"].includes(page.slug)
);
const featuredFormats = formatPages.filter((page) => ["pdf", "docx", "png", "mp4"].includes(page.slug));

export const metadata: Metadata = buildSeoMetadata({
  title: "Download Multi-Converter: Windows, Mac & Linux",
  description:
    "Download Multi-Converter for Windows x64, universal macOS and Linux x64. Convert documents and media locally with no account or mandatory cloud upload.",
  path: downloadPath
});

export default function DownloadPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${downloadPath}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Multi-Converter",
      url: siteUrl,
      downloadUrl: releasesUrl,
      installUrl: releasesUrl,
      codeRepository: sourceUrl,
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Windows, macOS, Linux",
      softwareVersion: productVersion,
      datePublished: "2026-06-02",
      dateModified: "2026-07-31",
      isAccessibleForFree: true,
      description:
        "Multi-Converter is a free open-source desktop file converter. It converts documents, images, audio and video locally, without an account and without mandatory upload.",
      featureList: [
        "Local conversion on Windows x64, universal macOS and Linux x64",
        "No account required",
        "No subscription required",
        "Documents, data, images, audio and video",
        "Optional Maximum Quality extension"
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: pageUrl
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      dateModified: "2026-07-31",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is Multi-Converter free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Multi-Converter is free, open source and usable without a subscription."
          }
        },
        {
          "@type": "Question",
          name: "Which platform is available?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Multi-Converter v1.0.6 is available for Windows x64, universal macOS and Linux x64."
          }
        },
        {
          "@type": "Question",
          name: "Do I need an account?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Multi-Converter does not require an account for supported local conversions."
          }
        }
      ]
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
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Download",
          item: pageUrl
        }
      ]
    }
  ];

  return (
    <main className="legal-page conversion-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href={localPath("/")}>Home</a>
        <span aria-hidden="true">/</span>
        <span>Download</span>
      </nav>

      <header className="legal-hero conversion-hero">
        <span className="section-kicker">Desktop downloads</span>
        <h1>Download Multi-Converter</h1>
        <p className="content-meta">Last updated: July 31, 2026</p>
        <p>
          Install a free, local and open-source file converter for Windows x64, universal macOS or Linux x64.
          Multi-Converter does not require an account, a subscription or mandatory upload for supported local
          conversions.
        </p>
      </header>

      <div className="conversion-layout">
        <article className="conversion-article">
          <section id="download">
            <h2>Latest desktop version</h2>
            <p>
              Choose the installer for your operating system. The Windows button follows the latest verified
              <code>.exe</code> asset automatically.
            </p>
            <LatestRelease apiUrl={latestReleaseApiUrl} releasesUrl={releasesUrl} />
            <div className="actions download-page-actions">
              <WindowsDownloadButton apiUrl={latestReleaseApiUrl} releasesUrl={releasesUrl} />
              <a
                className="btn ghost"
                href={`${sourceUrl}/releases/latest/download/Multi-Converter_macos-universal.dmg`}
              >
                Download for macOS
              </a>
              <a
                className="btn ghost"
                href={`${sourceUrl}/releases/latest/download/Multi-Converter_linux-x64.AppImage`}
              >
                Download for Linux
              </a>
              <a className="btn ghost" href={sourceUrl} target="_blank" rel="noreferrer">
                View source code
              </a>
              <a className="btn ghost" href={localPath(documentationPath)}>
                Documentation
              </a>
            </div>
          </section>

          <section>
            <h2>Before installing</h2>
            <ul>
              <li>Windows: x64 setup executable.</li>
              <li>macOS: one universal DMG for Apple Silicon and Intel Macs.</li>
              <li>Linux: x64 AppImage.</li>
              <li>Price: 0 EUR, no subscription.</li>
              <li>User account: not required.</li>
              <li>Processing: local for supported conversions.</li>
              <li>
                The macOS build is not Apple-signed or notarized. After the first warning, use System Settings &gt;
                Privacy &amp; Security &gt; Open Anyway, then confirm Open.
              </li>
            </ul>
          </section>

          <section>
            <h2>Why download a local converter?</h2>
            <p>
              Online services remain practical, but they require file upload. Multi-Converter is useful when you want
              to keep documents, images, audio or videos on your own computer.
            </p>
            <ul>
              <li>Avoid uploading private or large files.</li>
              <li>Convert without sign-up.</li>
              <li>Use an open-source and transparent tool.</li>
              <li>Work offline after installation for compatible conversions.</li>
            </ul>
          </section>

          <section>
            <h2>Useful conversions after installation</h2>
            <div className="conversion-card-grid compact-card-grid">
              {featuredConversions.map((page) => (
                <a className="conversion-card" href={localPath(conversionPath(page))} key={page.slug}>
                  <span>{page.source} to {page.target}</span>
                  <strong>{conversionTitle(page)}</strong>
                  <p>{conversionDescription(page)}</p>
                </a>
              ))}
            </div>
          </section>
        </article>

        <aside className="conversion-sidebar" aria-label="Download summary">
          <div>
            <span>Product</span>
            <strong>Multi-Converter</strong>
          </div>
          <div>
            <span>Platform</span>
            <strong>Windows x64, universal macOS, Linux x64</strong>
          </div>
          <div>
            <span>Price</span>
            <strong>Free</strong>
          </div>
          <div>
            <span>Account</span>
            <strong>Not required</strong>
          </div>
          <a className="btn primary" href={releasesUrl} target="_blank" rel="noreferrer">
            Open releases
          </a>
          <a className="text-link" href={localPath("/guides/free-windows-file-converter/")}>
            Read the free Windows guide
          </a>
          <a className="text-link" href={localPath(documentationPath)}>
            Read the documentation
          </a>
        </aside>
      </div>

      <section className="related-conversions" aria-labelledby="download-related-title">
        <h2 id="download-related-title">Formats to explore</h2>
        <div className="conversion-card-grid compact-card-grid">
          {featuredFormats.map((format) => (
            <a className="conversion-card" href={localPath(`/formats/${format.slug}/`)} key={format.slug}>
              <span>{format.name}</span>
              <strong>{formatTitle(format)}</strong>
              <p>{formatDescription(format)}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
