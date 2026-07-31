import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { conversionPages } from "../../conversion-data";
import {
  conversionDescription,
  conversionTitle,
  formatDescription,
  formatTitle,
  guideComparisonRows,
  guideDescription,
  guideDirectAnswer,
  guideFaq,
  guideIntent,
  guideSections,
  guideTitle
} from "../../english-content";
import { formatPages } from "../../format-data";
import { getRelatedGuides, guidePages } from "../../guide-data";
import { buildSeoMetadata } from "../../seo-metadata";
import { conversionPath, convertHubPath, downloadPath, guidePath } from "../../seo-routes";
import { getSiteUrl, localPath } from "../../site-url";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return guidePages.map((page) => ({
    slug: guidePath(page).split("/").filter(Boolean).pop() as string
  }));
}

function getGuidePageByAnySlug(slug: string) {
  return guidePages.find((page) => page.slug === slug || guidePath(page).split("/").filter(Boolean).pop() === slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getGuidePageByAnySlug(slug);

  if (!page) {
    return {};
  }

  return buildSeoMetadata({
    title: guideTitle(page),
    description: guideDescription(page),
    path: guidePath(page),
    type: "article"
  });
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const page = getGuidePageByAnySlug(slug);

  if (!page) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${guidePath(page)}`;
  const relatedGuides = getRelatedGuides(page.slug);
  const relatedConversions = conversionPages.filter((conversion) => page.relatedConversions.includes(conversion.slug));
  const relatedFormats = formatPages.filter((format) => page.relatedFormats.includes(format.slug));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guideTitle(page),
      description: guideDescription(page),
      inLanguage: "en-US",
      datePublished: "2026-06-02",
      dateModified: "2026-06-02",
      mainEntityOfPage: pageUrl,
      author: {
        "@type": "Organization",
        name: "Multi-Converter"
      },
      publisher: {
        "@type": "Organization",
        name: "Multi-Converter"
      },
      about: [guideIntent(page), "Local file conversion", "Multi-Converter"]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guideFaq(page).map(([question, answer]) => ({
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
      "@type": "ItemList",
      name: `${guideIntent(page)} comparison`,
      itemListElement: guideComparisonRows().map(([criterion, local, online], index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: criterion,
        description: `Local: ${local}. Online: ${online}.`
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
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Guides",
          item: `${siteUrl}/guides/`
        },
        {
          "@type": "ListItem",
          position: 3,
          name: guideTitle(page),
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
        <a href={localPath("/guides/")}>Guides</a>
        <span aria-hidden="true">/</span>
        <span>{guideIntent(page)}</span>
      </nav>

      <header className="legal-hero conversion-hero">
        <span className="section-kicker">{guideIntent(page)}</span>
        <h1>{guideTitle(page)}</h1>
        <p className="content-meta">Last updated: June 2, 2026</p>
        <p>{guideDirectAnswer(page)}</p>
      </header>

      <div className="conversion-layout">
        <article className="conversion-article">
          <section>
            <h2>Short answer</h2>
            <p>{guideDirectAnswer(page)}</p>
          </section>

          {guideSections(page).map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h2>Quick comparison</h2>
            <div className="table-scroll">
              <table className="data-table alternative-table">
                <thead>
                  <tr>
                    <th scope="col">Criterion</th>
                    <th scope="col">Local conversion</th>
                    <th scope="col">Online conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {guideComparisonRows().map(([criterion, local, online]) => (
                    <tr key={criterion}>
                      <th scope="row">{criterion}</th>
                      <td>{local}</td>
                      <td>{online}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>Frequently asked questions</h2>
            {guideFaq(page).map(([question, answer]) => (
              <details className="faq-item inline-faq-item" key={question}>
                <summary>{question}</summary>
                <div className="faq-answer">
                  <div>
                    <p>{answer}</p>
                  </div>
                </div>
              </details>
            ))}
          </section>
        </article>

        <aside className="conversion-sidebar" aria-label="Guide summary">
          <div>
            <span>Guide</span>
            <strong>{guideIntent(page)}</strong>
          </div>
          <div>
            <span>Product</span>
            <strong>Multi-Converter</strong>
          </div>
          <div>
            <span>Use case</span>
            <strong>Local on Windows</strong>
          </div>
          <a className="btn primary" href={localPath(downloadPath)}>Download Multi-Converter</a>
          <a className="text-link" href={localPath(convertHubPath)}>View conversions</a>
        </aside>
      </div>

      <section className="related-conversions" aria-labelledby="guide-related-title">
        <h2 id="guide-related-title">Related pages</h2>
        <div className="conversion-card-grid compact-card-grid">
          {relatedConversions.map((conversion) => (
            <a className="conversion-card" href={localPath(conversionPath(conversion))} key={conversion.slug}>
              <span>{conversion.source} to {conversion.target}</span>
              <strong>{conversionTitle(conversion)}</strong>
              <p>{conversionDescription(conversion)}</p>
            </a>
          ))}
          {relatedFormats.map((format) => (
            <a className="conversion-card" href={localPath(`/formats/${format.slug}/`)} key={format.slug}>
              <span>{format.name}</span>
              <strong>{formatTitle(format)}</strong>
              <p>{formatDescription(format)}</p>
            </a>
          ))}
          {relatedGuides.map((guide) => (
            <a className="conversion-card" href={localPath(guidePath(guide))} key={guide.slug}>
              <span>{guideIntent(guide)}</span>
              <strong>{guideTitle(guide)}</strong>
              <p>{guideDescription(guide)}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
