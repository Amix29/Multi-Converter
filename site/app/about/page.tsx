import type { Metadata } from "next";
import { buildSeoMetadata } from "../seo-metadata";
import { aboutPath } from "../seo-routes";
import { getSiteUrl } from "../site-url";

const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const issuesUrl = process.env.NEXT_PUBLIC_ISSUES_URL || `${sourceUrl}/issues`;

export const metadata: Metadata = buildSeoMetadata({
  title: "About Multi-Converter for Windows",
  description:
    "Learn why Multi-Converter was created as a free, open-source Windows file converter focused on local conversion, privacy and simple daily use.",
  path: aboutPath,
  type: "article"
});

export default function AboutPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${aboutPath}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About Multi-Converter",
      description: "Why Multi-Converter exists and how the project is maintained.",
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
        operatingSystem: "Windows",
        codeRepository: sourceUrl
      },
      mainEntity: [
        {
          "@type": "Question",
          name: "Why was Multi-Converter created?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Multi-Converter was created to make common file conversion available from a local Windows desktop app instead of relying on a different online converter for every file."
          }
        },
        {
          "@type": "Question",
          name: "How is Multi-Converter maintained transparently?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "The project keeps a public GitHub repository, public releases, visible documentation and an issue tracker for feedback and bug reports."
          }
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "About", item: pageUrl }
      ]
    }
  ];

  return (
    <main className="legal-page about-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero about-hero">
        <span className="section-kicker">About</span>
        <h1>Why Multi-Converter exists</h1>
        <p>A personal project built around a simple need: convert files without searching for a new website every time.</p>
      </header>

      <div className="legal-content about-content">
        <section>
          <h2>The starting point</h2>
          <p>
            I created <strong>Multi-Converter</strong> because I needed a file converter that was simple, local and
            predictable. I wanted to avoid jumping between free conversion websites or creating an account just to
            convert a few files.
          </p>
        </section>

        <section>
          <h2>The idea</h2>
          <p>
            The goal is a <strong>local</strong>, <strong>simple</strong> and <strong>fast</strong> desktop app that can
            convert common files directly on the computer. Multi-Converter is published with a public GitHub repository,
            clear documentation and a user interface designed for everyday use.
          </p>
        </section>

        <section>
          <h2>The principles</h2>
          <p>
            Multi-Converter is built around three practical principles: keep supported conversions local, avoid account
            or subscription requirements, and make the project easy to inspect. That is why the source code, releases,
            documentation and technical facts are linked publicly instead of hidden behind a marketing page.
          </p>
        </section>

        <section>
          <h2>The limits</h2>
          <p>
            Multi-Converter recognizes many formats, but it does not promise that every format can be converted to every
            other format. Conversion options depend on the source file, the requested target format and the local engines
            installed on the Windows computer.
          </p>
        </section>

        <section>
          <h2>The long-term goal</h2>
          <p>
            Multi-Converter v1.0.6 is available for <strong>Windows x64, universal macOS and Linux x64</strong>.
            The aim is to make common file conversion available without depending on web services, account walls or cloud
            upload limits.
          </p>
        </section>

        <section>
          <h2>The project</h2>
          <p>
            The project is available on{" "}
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
            , and feedback or issues can be shared in the official{" "}
            <a href={issuesUrl} target="_blank" rel="noreferrer">
              Issues
            </a>{" "}
            section.
          </p>
        </section>
      </div>
    </main>
  );
}
