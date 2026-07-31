import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alternativePages, getAlternativePage } from "../../alternative-data";
import {
  alternativeDecisionNote,
  alternativeDescription,
  alternativeFaq,
  alternativeH1,
  alternativeLimitNote,
  alternativeRows,
  alternativeTitle
} from "../../english-content";
import { buildSeoMetadata } from "../../seo-metadata";
import { downloadPath } from "../../seo-routes";
import { getSiteUrl, localPath } from "../../site-url";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return alternativePages.map((page) => ({
    slug: page.slug
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getAlternativePage(slug);

  if (!page) {
    return {};
  }

  return buildSeoMetadata({
    title: alternativeTitle(page),
    description: alternativeDescription(page),
    path: `/alternatives/${page.slug}/`,
    type: "article"
  });
}

export default async function AlternativePage({ params }: PageProps) {
  const { slug } = await params;
  const page = getAlternativePage(slug);

  if (!page) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/alternatives/${page.slug}/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: alternativeTitle(page),
      description: alternativeDescription(page),
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
      about: [`Alternative to ${page.service}`, "Local file converter", "Online file converter"]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: alternativeFaq(page).map(([question, answer]) => ({
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
          name: "Alternatives",
          item: `${siteUrl}/alternatives/`
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `Alternative to ${page.service}`,
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
        <a href={localPath("/alternatives/")}>Alternatives</a>
        <span aria-hidden="true">/</span>
        <span>{page.service}</span>
      </nav>

      <header className="legal-hero conversion-hero">
        <span className="section-kicker">Comparison</span>
        <h1>{alternativeH1(page)}</h1>
        <p className="content-meta">Last updated: June 2, 2026</p>
        <p>{alternativeDescription(page)}</p>
      </header>

      <div className="conversion-layout">
        <article className="conversion-article">
          <section>
            <h2>When should you choose {page.service}?</h2>
            <p>
              Choose {page.service} when you need a one-off cloud conversion from a device where installing software is
              not possible.
            </p>
            <p>{alternativeLimitNote(page)}</p>
          </section>

          <section>
            <h2>When should you choose Multi-Converter?</h2>
            <p>
              Choose Multi-Converter when you want local Windows conversion, no mandatory upload, no account and no
              subscription for supported file conversions.
            </p>
            <p>{alternativeDecisionNote(page)}</p>
          </section>

          <section>
            <h2>Quick comparison</h2>
            <div className="table-scroll">
              <table className="data-table alternative-table">
                <thead>
                  <tr>
                    <th scope="col">Criterion</th>
                    <th scope="col">Multi-Converter</th>
                    <th scope="col">{page.service}</th>
                  </tr>
                </thead>
                <tbody>
                  {alternativeRows(page).map(([criterion, multiConverter, serviceValue]) => (
                    <tr key={criterion}>
                      <th scope="row">{criterion}</th>
                      <td>{multiConverter}</td>
                      <td>{serviceValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>Frequently asked questions</h2>
            {alternativeFaq(page).map(([question, answer]) => (
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

        <aside className="conversion-sidebar" aria-label="Comparison summary">
          <div>
            <span>Alternative</span>
            <strong>{page.service}</strong>
          </div>
          <div>
            <span>Positioning</span>
            <strong>Local, free, open source</strong>
          </div>
          <div>
            <span>Current platform</span>
            <strong>Windows x64</strong>
          </div>
          <a className="btn primary" href={localPath(downloadPath)}>Download Multi-Converter</a>
          <a className="text-link" href={localPath("/alternatives/")}>View all alternatives</a>
        </aside>
      </div>
    </main>
  );
}
