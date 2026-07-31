import type { Metadata } from "next";
import { guideDescription, guideIntent, guideTitle } from "../english-content";
import { guidePages } from "../guide-data";
import { buildSeoMetadata } from "../seo-metadata";
import { guidePath } from "../seo-routes";
import { getSiteUrl, localPath } from "../site-url";

export const metadata: Metadata = buildSeoMetadata({
  title: "Local file conversion guides",
  description:
    "Multi-Converter guides for understanding local, offline, no-upload and open-source file conversion on Windows before choosing a converter.",
  path: "/guides/"
});

export default function GuidesHubPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/guides/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Local file conversion guides",
      description: "Guides for choosing and using a local file converter on Windows.",
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
        itemListElement: guidePages.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: guideTitle(page),
          url: `${siteUrl}${guidePath(page)}`
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
          name: "Guides",
          item: pageUrl
        }
      ]
    }
  ];

  return (
    <main className="legal-page conversion-hub-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero">
        <span className="section-kicker">Guides</span>
        <h1>Local file conversion guides</h1>
        <p>
          Guides to understand when to use a local, offline, no-upload or open-source file converter on Windows.
        </p>
      </header>

      <section className="conversion-category" aria-labelledby="guides-title">
        <h2 id="guides-title">Choose the right conversion workflow</h2>
        <div className="conversion-card-grid">
          {guidePages.map((page) => (
            <a className="conversion-card" href={localPath(guidePath(page))} key={page.slug}>
              <span>{guideIntent(page)}</span>
              <strong>{guideTitle(page)}</strong>
              <p>{guideDescription(page)}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
