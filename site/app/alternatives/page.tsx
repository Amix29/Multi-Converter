import type { Metadata } from "next";
import { alternativePages } from "../alternative-data";
import { alternativeDescription, alternativeTitle } from "../english-content";
import { buildSeoMetadata } from "../seo-metadata";
import { getSiteUrl, localPath } from "../site-url";

export const metadata: Metadata = buildSeoMetadata({
  title: "Alternatives to online file converters",
  description:
    "Compare Multi-Converter with CloudConvert, Convertio, FreeConvert, Online-Convert and Zamzar for local Windows file conversion without upload.",
  path: "/alternatives/"
});

export default function AlternativesHubPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/alternatives/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Alternatives to online file converters",
      description:
        "Comparisons between Multi-Converter and major online file conversion services.",
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
        itemListElement: alternativePages.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `Alternative to ${page.service}`,
          url: `${siteUrl}/alternatives/${page.slug}/`
        }))
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      dateModified: "2026-06-02",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is the best alternative to online file converters for private files?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "A local Windows converter such as Multi-Converter is often the better option for private files because supported conversions run on the user's computer without mandatory upload."
          }
        },
        {
          "@type": "Question",
          name: "When should users still choose a cloud converter?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "A cloud converter can still be useful for a one-off conversion on a device where installing software is not possible."
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
          name: "Alternatives",
          item: pageUrl
        }
      ]
    }
  ];

  return (
    <main className="legal-page conversion-hub-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero">
        <span className="section-kicker">Alternatives</span>
        <h1>Alternatives to online file converters</h1>
        <p>
          Multi-Converter is not another cloud conversion service. Its value is local Windows conversion, without an
          account and without mandatory upload.
        </p>
      </header>

      <section className="conversion-category" aria-labelledby="alternatives-title">
        <h2 id="alternatives-title">Compare Multi-Converter with cloud services</h2>
        <p>
          Online converters are convenient because they work from a browser, but they usually require sending the file to
          a remote service. That tradeoff is acceptable for some one-off conversions. It is less ideal for private
          documents, large videos, internal datasets, repeated workflows or users who do not want to create an account.
        </p>
        <p>
          Multi-Converter focuses on the opposite model: install the Windows app, keep supported conversions on the
          computer and avoid cloud upload limits for local workflows. The detailed comparison pages below explain when a
          cloud service still makes sense and when a local converter is the better fit.
        </p>
        <div className="conversion-card-grid">
          {alternativePages.map((page) => (
            <a className="conversion-card" href={localPath(`/alternatives/${page.slug}/`)} key={page.slug}>
              <span>Alternative to {page.service}</span>
              <strong>{alternativeTitle(page)}</strong>
              <p>{alternativeDescription(page)}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="conversion-category" aria-labelledby="alternative-criteria-title">
        <h2 id="alternative-criteria-title">How to choose an online converter alternative</h2>
        <div className="table-scroll">
          <table className="data-table alternative-table">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Prefer Multi-Converter</th>
                <th scope="col">Prefer a cloud converter</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Privacy</th>
                <td>Use local conversion when files should stay on the PC.</td>
                <td>Use cloud conversion only when uploading the file is acceptable.</td>
              </tr>
              <tr>
                <th scope="row">File size</th>
                <td>Use local conversion for large files limited mainly by your machine.</td>
                <td>Use a web service for quick small files when free-tier limits are enough.</td>
              </tr>
              <tr>
                <th scope="row">Account</th>
                <td>Use Multi-Converter when you want no sign-up for supported local conversions.</td>
                <td>Use a web service if account-based storage or device-to-device access matters.</td>
              </tr>
              <tr>
                <th scope="row">Install rights</th>
                <td>Use Multi-Converter on a Windows computer you control.</td>
                <td>Use a browser converter on locked-down, shared or temporary devices.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
