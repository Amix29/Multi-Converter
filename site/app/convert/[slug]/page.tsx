import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { conversionPages, getRelatedConversions } from "../../conversion-data";
import {
  conversionBenefit,
  conversionDescription,
  conversionFaq,
  conversionH1,
  conversionIntro,
  conversionQualityNote,
  conversionSteps,
  conversionTips,
  conversionTitle,
  englishCategory
} from "../../english-content";
import { buildSeoMetadata } from "../../seo-metadata";
import { conversionPath, conversionSlug, convertHubPath, downloadPath } from "../../seo-routes";
import { getSiteUrl, localPath } from "../../site-url";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function getConversionFromEnglishSlug(slug: string) {
  return conversionPages.find((page) => conversionSlug(page) === slug);
}

export function generateStaticParams() {
  return conversionPages.map((page) => ({
    slug: conversionSlug(page)
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getConversionFromEnglishSlug(slug);

  if (!page) {
    return {};
  }

  return buildSeoMetadata({
    title: conversionTitle(page),
    description: conversionDescription(page),
    path: conversionPath(page),
    type: "article"
  });
}

export default async function ConversionPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getConversionFromEnglishSlug(slug);

  if (!page) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${conversionPath(page)}`;
  const relatedPages = getRelatedConversions(page.slug);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: conversionTitle(page),
      description: conversionDescription(page),
      inLanguage: "en-US",
      dateModified: "2026-06-02",
      datePublished: "2026-06-02",
      mainEntityOfPage: pageUrl,
      author: {
        "@type": "Organization",
        name: "Multi-Converter"
      },
      publisher: {
        "@type": "Organization",
        name: "Multi-Converter"
      },
      about: [`${page.source} to ${page.target} conversion`, "Local file conversion", "Multi-Converter"]
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: conversionH1(page),
      description: conversionDescription(page),
      step: conversionSteps(page).map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        text: step
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: conversionFaq(page).map(([question, answer]) => ({
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
          name: "Convert",
          item: `${siteUrl}${convertHubPath}`
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `${page.source} to ${page.target}`,
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
        <a href={localPath(convertHubPath)}>Convert</a>
        <span aria-hidden="true">/</span>
        <span>{page.source} to {page.target}</span>
      </nav>

      <header className="legal-hero conversion-hero">
        <span className="section-kicker">{englishCategory(page.category)}</span>
        <h1>{conversionH1(page)}</h1>
        <p className="content-meta">Last updated: June 2, 2026</p>
        <p>{conversionIntro(page)}</p>
      </header>

      <div className="conversion-layout">
        <article className="conversion-article">
          <section>
            <h2>Why convert {page.source} to {page.target} with a local tool?</h2>
            <p>{conversionBenefit(page)}</p>
            <p>
              Multi-Converter is a free, open-source Windows app. Its goal is to convert supported files directly on
              your computer, without an account, without a subscription and without mandatory upload.
            </p>
          </section>

          <section>
            <h2>How to convert {page.source} to {page.target}</h2>
            <ol>
              {conversionSteps(page).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2>Quality tips</h2>
            <p>{conversionQualityNote(page)}</p>
            <ul>
              {conversionTips(page).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Frequently asked questions</h2>
            {conversionFaq(page).map(([question, answer]) => (
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

        <aside className="conversion-sidebar" aria-label="Conversion information">
          <div>
            <span>Conversion</span>
            <strong>{page.source} to {page.target}</strong>
          </div>
          <div>
            <span>Processing</span>
            <strong>Local on Windows</strong>
          </div>
          <div>
            <span>Price</span>
            <strong>Free</strong>
          </div>
          <a className="btn primary" href={localPath(downloadPath)}>Download Multi-Converter</a>
          <a className="text-link" href={localPath("/#formats")}>View recognized formats</a>
        </aside>
      </div>

      <section className="related-conversions" aria-labelledby="related-title">
        <h2 id="related-title">Related conversions</h2>
        <div className="conversion-card-grid">
          {relatedPages.map((related) => (
            <a className="conversion-card" href={localPath(conversionPath(related))} key={related.slug}>
              <span>{related.source} to {related.target}</span>
              <strong>{conversionTitle(related)}</strong>
              <p>{conversionDescription(related)}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
