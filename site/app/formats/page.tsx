import type { Metadata } from "next";
import { formatPages } from "../format-data";
import { englishCategory, formatDescription, formatTitle } from "../english-content";
import { buildSeoMetadata } from "../seo-metadata";
import { getSiteUrl, localPath } from "../site-url";

export const metadata: Metadata = buildSeoMetadata({
  title: "Recognized file formats for conversion",
  description:
    "Explore document, image, audio and video formats recognized by Multi-Converter on Windows, including PDF, DOCX, DOC, GIF, MP4, M4A, WebM and OGV.",
  path: "/formats/"
});

const categories = ["Document", "Données", "Image", "Audio", "Vidéo"] as const;

export default function FormatsHubPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/formats/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Recognized file formats",
      description:
        "Format guides for files Multi-Converter can recognize or convert depending on available engines.",
      url: pageUrl,
      inLanguage: "en-US",
      datePublished: "2026-06-02",
      dateModified: "2026-06-06",
      isPartOf: {
        "@type": "WebSite",
        name: "Multi-Converter",
        url: siteUrl
      },
      about: {
        "@type": "SoftwareApplication",
        name: "Multi-Converter",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Windows"
      },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: formatPages.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: page.name,
          url: `${siteUrl}/formats/${page.slug}/`
        }))
      }
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
          name: "Formats",
          item: pageUrl
        }
      ]
    }
  ];

  return (
    <main className="legal-page conversion-hub-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero">
        <span className="section-kicker">Formats</span>
        <h1>Recognized file formats</h1>
        <p>
          Multi-Converter detects many formats and offers compatible conversions depending on the source file and the
          engines installed on your computer.
        </p>
      </header>

      <div className="conversion-category-list">
        {categories.map((category) => {
          const pages = formatPages.filter((page) => page.category === category);

          return (
            <section className="conversion-category" key={category} aria-labelledby={`format-category-${category}`}>
              <h2 id={`format-category-${category}`}>{englishCategory(category)}</h2>
              <div className="conversion-card-grid">
                {pages.map((page) => (
                  <a className="conversion-card" href={localPath(`/formats/${page.slug}/`)} key={page.slug}>
                    <span>{page.name}</span>
                    <strong>{formatTitle(page)}</strong>
                    <p>{formatDescription(page)}</p>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
