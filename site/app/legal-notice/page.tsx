import type { Metadata } from "next";
import { buildSeoMetadata } from "../seo-metadata";
import { legalPath } from "../seo-routes";
import { getSiteUrl } from "../site-url";

const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const issuesUrl = process.env.NEXT_PUBLIC_ISSUES_URL || `${sourceUrl}/issues`;

export const metadata: Metadata = buildSeoMetadata({
  title: "Legal notice for Multi-Converter",
  description:
    "Legal notice for Multi-Converter: project publisher, hosting, official GitHub repository, open-source license and liability.",
  path: legalPath,
  type: "article"
});

export default function LegalNoticePage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${legalPath}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Legal notice",
      description: "Legal information about the Multi-Converter website and project.",
      url: pageUrl,
      inLanguage: "en-US",
      datePublished: "2026-06-02",
      dateModified: "2026-06-02",
      isPartOf: { "@type": "WebSite", name: "Multi-Converter", url: siteUrl },
      about: { "@type": "SoftwareApplication", name: "Multi-Converter", codeRepository: sourceUrl }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Legal notice", item: pageUrl }
      ]
    }
  ];

  return (
    <main className="legal-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero">
        <span className="section-kicker">Legal notice</span>
        <h1>Legal notice</h1>
        <p>Information about the Multi-Converter website and project.</p>
      </header>

      <div className="legal-content">
        <section>
          <h2>Website publisher</h2>
          <p>The website presents Multi-Converter, a free open-source app maintained publicly on GitHub.</p>
          <p>
            Project publisher: <strong>Multi-Converter / Amix29</strong>.
          </p>
          <p>
            Contact: use the official GitHub repository{" "}
            <a href={issuesUrl} target="_blank" rel="noreferrer">
              Issues
            </a>{" "}
            section.
          </p>
        </section>

        <section>
          <h2>Hosting</h2>
          <p>The site can be hosted on GitHub Pages or another static hosting provider used to publish the project.</p>
        </section>

        <section>
          <h2>Intellectual property</h2>
          <p>
            The Multi-Converter name, website content, visuals and interface elements are linked to the Multi-Converter
            project. The app source code is publicly available on GitHub.
          </p>
          <p>
            Official repository:{" "}
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              {sourceUrl}
            </a>
            .
          </p>
        </section>

        <section>
          <h2>Liability</h2>
          <p>
            Information on this site is provided for informational purposes. Multi-Converter is distributed as free
            open-source software. Before installing, always verify that downloaded files come from the official
            repository or official releases.
          </p>
        </section>
      </div>
    </main>
  );
}
