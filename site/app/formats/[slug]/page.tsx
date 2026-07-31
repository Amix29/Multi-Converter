import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatPages, getFormatConversions, getFormatPage } from "../../format-data";
import {
  conversionDescription,
  conversionTitle,
  englishCategory,
  formatCommonUses,
  formatDescription,
  formatFaq,
  formatH1,
  formatIntro,
  formatLocalUse,
  formatQualityTips,
  formatSearchIntentAnswer,
  formatTitle,
  formatWorkflowNote
} from "../../english-content";
import { buildSeoMetadata } from "../../seo-metadata";
import { conversionPath, downloadPath } from "../../seo-routes";
import { getSiteUrl, localPath } from "../../site-url";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return formatPages.map((page) => ({
    slug: page.slug
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getFormatPage(slug);

  if (!page) {
    return {};
  }

  return buildSeoMetadata({
    title: formatTitle(page),
    description: formatDescription(page),
    path: `/formats/${page.slug}/`,
    type: "article"
  });
}

export default async function FormatPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getFormatPage(slug);

  if (!page) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/formats/${page.slug}/`;
  const relatedConversions = getFormatConversions(page.name);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: formatTitle(page),
      description: formatDescription(page),
      inLanguage: "en-US",
      datePublished: "2026-06-02",
      dateModified: "2026-06-06",
      mainEntityOfPage: pageUrl,
      author: {
        "@type": "Organization",
        name: "Multi-Converter"
      },
      publisher: {
        "@type": "Organization",
        name: "Multi-Converter"
      },
      about: [page.name, page.longName, "Local file conversion"]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      dateModified: "2026-06-06",
      mainEntity: formatFaq(page).map(([question, answer]) => ({
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
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Formats",
          item: `${siteUrl}/formats/`
        },
        {
          "@type": "ListItem",
          position: 3,
          name: page.name,
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
        <a href={localPath("/formats/")}>Formats</a>
        <span aria-hidden="true">/</span>
        <span>{page.name}</span>
      </nav>

      <header className="legal-hero conversion-hero">
        <span className="section-kicker">{englishCategory(page.category)}</span>
        <h1>{formatH1(page)}</h1>
        <p className="content-meta">Last updated: June 6, 2026</p>
        <p>{formatIntro(page)}</p>
      </header>

      <div className="conversion-layout">
        <article className="conversion-article">
          <section>
            <h2>Why convert {page.name} with a local tool?</h2>
            <p>{formatLocalUse(page)}</p>
            <p>{formatSearchIntentAnswer(page)}</p>
            <p>
              Multi-Converter is free and open source. Available conversions depend on the source file and installed
              engines, but the goal stays the same: process files on your PC instead of in the cloud.
            </p>
          </section>

          <section>
            <h2>Common uses</h2>
            <ul>
              {formatCommonUses(page).map((use) => (
                <li key={use}>{use}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Before converting</h2>
            <p>{formatWorkflowNote(page)}</p>
            <ul>
              {formatQualityTips(page).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Frequently asked questions</h2>
            {formatFaq(page).map(([question, answer]) => (
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

          {relatedConversions.length > 0 ? (
            <section>
              <h2>Conversions related to {page.name}</h2>
              <div className="conversion-card-grid compact-card-grid">
                {relatedConversions.map((conversion) => (
                  <a className="conversion-card" href={localPath(conversionPath(conversion))} key={conversion.slug}>
                    <span>{conversion.source} to {conversion.target}</span>
                    <strong>{conversionTitle(conversion)}</strong>
                    <p>{conversionDescription(conversion)}</p>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="conversion-sidebar" aria-label={`Information about ${page.name}`}>
          <div>
            <span>Format</span>
            <strong>{page.name}</strong>
          </div>
          <div>
            <span>Full name</span>
            <strong>{page.longName}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{englishCategory(page.category)}</strong>
          </div>
          <a className="btn primary" href={localPath(downloadPath)}>Download Multi-Converter</a>
          <a className="text-link" href={localPath("/formats/")}>View all formats</a>
        </aside>
      </div>
    </main>
  );
}
