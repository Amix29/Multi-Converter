import type { ReactNode } from "react";
import { aboutPath, convertHubPath, downloadPath, legalPath, privacyPath } from "./seo-routes";
import { localPath } from "./site-url";

const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const releasesUrl = process.env.NEXT_PUBLIC_RELEASES_URL || `${sourceUrl}/releases/latest`;
const issuesUrl = process.env.NEXT_PUBLIC_ISSUES_URL || `${sourceUrl}/issues`;

const sectionNavItems = [
  { id: "demo", label: "Demo", href: localPath("/#demo") },
  { id: "parametres", label: "Settings", href: localPath("/#parametres") },
  { id: "formats", label: "Formats", href: localPath("/#formats") },
  { id: "comparaison", label: "Comparison", href: localPath("/#comparaison") },
  { id: "pourquoi", label: "Why", href: localPath("/#pourquoi") },
  { id: "faq", label: "FAQ", href: localPath("/#faq") },
  { id: "download", label: "Download", href: localPath("/#download") }
];

function SiteHeader() {
  return (
    <header className="site-header shell">
      <a className="brand" href={localPath("/#top")} aria-label="Back to the top of the Multi-Converter page">
        <img
          className="brand-logo-full"
          src={localPath("/multi-converter-lockup-horizontal.svg")}
          alt="Multi-Converter"
          width={208}
          height={42}
          decoding="async"
        />
        <img
          className="brand-logo-icon"
          src={localPath("/multi-converter-icon-interface-green.svg")}
          alt="Multi-Converter local file converter app icon"
          width={42}
          height={42}
          decoding="async"
        />
        <span className="brand-name">Multi-Converter</span>
      </a>
      <nav className="main-nav" aria-label="Landing page sections" data-section-nav="true">
        <span className="main-nav-indicator" aria-hidden="true" />
        {sectionNavItems.map((item) => (
          <a data-section-id={item.id} href={item.href} key={item.id}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="github-link" href={sourceUrl} target="_blank" rel="noreferrer" aria-label="View the Multi-Converter GitHub repository">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.99c.85 0 1.7.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.2 10.2 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z" />
        </svg>
      </a>
      <a className="header-cta" href={localPath(downloadPath)} aria-label="Download Multi-Converter">
        <span className="desktop-label">Download</span>
        <span className="mobile-label" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1Zm-7 13a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
          </svg>
        </span>
      </a>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell">
        <div>
          <strong>Multi-Converter</strong>
          <span>Free, local and open-source file converter for Windows.</span>
        </div>
        <nav aria-label="Secondary links">
          <a href={localPath(aboutPath)}>About</a>
          <a href={localPath("/formats/")}>Formats</a>
          <a href={localPath(convertHubPath)}>Conversions</a>
          <a href={localPath("/guides/")}>Guides</a>
          <a href={localPath("/documentation/")}>Documentation</a>
          <a href={localPath("/alternatives/")}>Alternatives</a>
          <a href={localPath("/#faq")}>FAQ</a>
          <a href={localPath(downloadPath)}>Download</a>
          <a href={localPath(legalPath)}>Legal notice</a>
          <a href={localPath(privacyPath)}>Privacy</a>
          <a href={releasesUrl} target="_blank" rel="noreferrer">Releases</a>
          <a href={issuesUrl} target="_blank" rel="noreferrer">Support</a>
        </nav>
      </div>
    </footer>
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
