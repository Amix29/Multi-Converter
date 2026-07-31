import type { Metadata } from "next";
import { buildSeoMetadata } from "../seo-metadata";
import { privacyPath } from "../seo-routes";
import { getSiteUrl } from "../site-url";

export const metadata: Metadata = buildSeoMetadata({
  title: "Privacy policy for local file conversion",
  description:
    "Multi-Converter privacy policy for local Windows file conversion: no account, no advertising tracking and files not sent to the website.",
  path: privacyPath,
  type: "article"
});

export default function PrivacyPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${privacyPath}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "PrivacyPolicy",
      name: "Multi-Converter Privacy Policy",
      description: "Privacy policy for the Multi-Converter website and local file processing model.",
      url: pageUrl,
      inLanguage: "en-US",
      datePublished: "2026-06-02",
      dateModified: "2026-06-02",
      isPartOf: { "@type": "WebSite", name: "Multi-Converter", url: siteUrl },
      about: {
        "@type": "SoftwareApplication",
        name: "Multi-Converter",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Windows"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Privacy", item: pageUrl }
      ]
    }
  ];

  return (
    <main className="legal-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="legal-hero">
        <span className="section-kicker">Privacy</span>
        <h1>No personal data collected</h1>
        <p>Multi-Converter is designed to stay local, simple and respectful of your files.</p>
      </header>

      <div className="legal-content">
        <section>
          <h2>Personal data</h2>
          <p>
            The Multi-Converter website does not collect personal data. No account, sign-up or email address is required.
          </p>
        </section>

        <section>
          <h2>Cookies and analytics</h2>
          <p>The website does not use tracking cookies, analytics tools or advertising systems.</p>
        </section>

        <section>
          <h2>Converted files</h2>
          <p>
            Multi-Converter converts supported files directly on your computer. Files opened in the application are not
            sent to the Multi-Converter website.
          </p>
        </section>

        <section>
          <h2>Downloads and updates</h2>
          <p>
            An internet connection can be used to download the application, access the GitHub repository or check
            available releases. The website does not create user profiles or track app usage.
          </p>
        </section>
      </div>
    </main>
  );
}
