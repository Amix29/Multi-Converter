import type { Metadata } from "next";
import { conversionPages } from "../conversion-data";
import { conversionDescription, conversionTitle, englishCategory } from "../english-content";
import { buildSeoMetadata } from "../seo-metadata";
import { conversionPath, convertHubPath } from "../seo-routes";
import { getSiteUrl, localPath } from "../site-url";

export const metadata: Metadata = buildSeoMetadata({
  title: "Popular local file conversions",
  description:
    "Browse Multi-Converter guides for converting PDF, DOCX, CSV, JSON, images, audio and video files locally on Windows without mandatory upload.",
  path: convertHubPath
});

const categories = ["Document", "Données", "Image", "Audio", "Vidéo"] as const;

export default function ConvertHubPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${convertHubPath}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Popular file conversions",
      description: "Guides for converting files locally with Multi-Converter on Windows.",
      url: pageUrl,
      inLanguage: "en-US",
      datePublished: "2026-06-02",
      dateModified: "2026-06-02",
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
        itemListElement: conversionPages.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `${page.source} to ${page.target}`,
          url: `${siteUrl}${conversionPath(page)}`
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
          name: "Convert",
          item: pageUrl
        }
      ]
    }
  ];

  return (
    <main className="legal-page conversion-hub-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero">
        <span className="section-kicker">Popular conversions</span>
        <h1>Convert files locally</h1>
        <p>
          Explore useful guides for converting documents, data files, images, audio and videos with Multi-Converter,
          without an account and without mandatory upload to a cloud service.
        </p>
      </header>

      <div className="conversion-category-list">
        {categories.map((category) => {
          const pages = conversionPages.filter((page) => page.category === category);

          return (
            <section className="conversion-category" key={category} aria-labelledby={`category-${category}`}>
              <h2 id={`category-${category}`}>{englishCategory(category)}</h2>
              <div className="conversion-card-grid">
                {pages.map((page) => (
                  <a className="conversion-card" href={localPath(conversionPath(page))} key={page.slug}>
                    <span>{page.source} to {page.target}</span>
                    <strong>{conversionTitle(page)}</strong>
                    <p>{conversionDescription(page)}</p>
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
