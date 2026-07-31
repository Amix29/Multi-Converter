import type { Metadata } from "next";
import { buildSeoMetadata } from "../seo-metadata";
import { downloadPath } from "../seo-routes";
import { getSiteUrl, localPath } from "../site-url";

const updatedDate = "2026-06-06";
const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const releasesUrl = process.env.NEXT_PUBLIC_RELEASES_URL || `${sourceUrl}/releases/latest`;

const projectLinks = [
  { label: "GitHub", href: "https://github.com", description: "Open-source hosting platform used by the project." },
  { label: "Multi-Converter repository", href: sourceUrl, description: "Public source code, issues and project files." },
  { label: "Multi-Converter releases", href: releasesUrl, description: "Latest Windows release and release history." },
  { label: "Amix Digital on YouTube", href: "https://www.youtube.com/@amixdigital", description: "Creator channel for product updates and related content." }
];

const stackLinks = [
  { label: "Tauri", href: "https://tauri.app", description: "Desktop app framework used for the Windows application shell." },
  { label: "React", href: "https://fr.react.dev", description: "UI library used to build the application interface." },
  { label: "TypeScript", href: "https://www.typescriptlang.org", description: "Typed JavaScript used across the frontend code." },
  { label: "Rust", href: "https://rust-lang.org", description: "Systems language used by the Tauri backend." },
  { label: "Cargo", href: "https://doc.rust-lang.org/cargo/", description: "Rust package manager and build tool." },
  { label: "Vite", href: "https://vite.dev", description: "Frontend build tool used during development." },
  { label: "Node.js", href: "https://nodejs.org", description: "Runtime used for npm scripts and project tooling." }
];

const formatRows = [
  ["Documents and text", "PDF, DOCX, DOC, TXT, LOG, HTML, HTM, CSV, JSON, ODT, RTF, Markdown, MD, EPUB and XML"],
  ["Images", "PNG, JPEG, JPG, GIF, SVG, WebP, TIFF, TIF, BMP and ICO"],
  ["Audio", "MP3, AAC, M4A, FLAC, WAV, OGG, OGA, WMA, OPUS, AIFF, AIF, ALAC, AC3, MP2, AMR, AU, SND and CAF"],
  ["Video", "MP4, M4V, MKV, WebM, MOV, AVI, WMV, 3GP, 3G2, MTS, M2TS, MPEG-2, MPG, MPEG and OGV"]
];

const engineRows = [
  ["Base engines", "Common conversions available with the app through integrated engines or bundled sidecars."],
  ["FFmpeg and ffprobe", "Bundled on Windows x64 for audio and video conversion support."],
  ["Maximum Quality extension", "Optional engine package for more accurate Office, PDF, Markdown, HTML, EPUB and advanced image conversions."],
  ["PDFium", "Optional PDF rendering engine used for PDF-to-image workflows."],
  ["LibreOffice headless", "Optional engine for more accurate Office document and PDF conversions."],
  ["Pandoc", "Optional engine for Markdown, HTML, EPUB and DOCX workflows."],
  ["libvips", "Optional engine for advanced image processing."]
];

const commandRows = [
  ["Install dependencies", "npm install"],
  ["Run the real desktop app", "npm start"],
  ["Equivalent Tauri dev command", "npm run tauri:dev"],
  ["Run the full project check", "npm run check"],
  ["Typecheck the frontend", "npm run typecheck"],
  ["Validate bundled base engines", "npm run validate:bundled-base-engines"],
  ["Build the frontend", "npm run build"],
  ["Build the Tauri app", "npm run tauri:build"]
];

export const metadata: Metadata = buildSeoMetadata({
  title: "Multi-Converter documentation",
  description:
    "Multi-Converter documentation: supported formats, local conversion model, optional engines, open-source repository, releases and development stack.",
  path: "/documentation/",
  type: "article"
});

function ExternalCard({ label, href, description }: { label: string; href: string; description: string }) {
  return (
    <a className="conversion-card" href={href} target="_blank" rel="noopener noreferrer">
      <span>External reference</span>
      <strong>{label}</strong>
      <p>{description}</p>
    </a>
  );
}

export default function DocumentationPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/documentation/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: "Multi-Converter documentation",
      description:
        "Technical and product documentation for Multi-Converter, a free local open-source Windows file converter.",
      inLanguage: "en-US",
      datePublished: updatedDate,
      dateModified: updatedDate,
      mainEntityOfPage: pageUrl,
      author: { "@type": "Organization", name: "Multi-Converter" },
      publisher: { "@type": "Organization", name: "Multi-Converter" },
      about: ["Multi-Converter", "local file conversion", "Tauri", "React", "Rust", "TypeScript"],
      sameAs: [sourceUrl, releasesUrl, "https://www.youtube.com/@amixdigital"]
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "Multi-Converter source code",
      codeRepository: sourceUrl,
      programmingLanguage: ["TypeScript", "Rust"],
      runtimePlatform: "Windows x64",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      targetProduct: {
        "@type": "SoftwareApplication",
        name: "Multi-Converter",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Windows",
        downloadUrl: releasesUrl,
        isAccessibleForFree: true
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Where is the Multi-Converter source code?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `The Multi-Converter source code is published on GitHub at ${sourceUrl}.`
          }
        },
        {
          "@type": "Question",
          name: "Which stack does Multi-Converter use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Multi-Converter uses Tauri 2, React, TypeScript, Rust, Cargo, Vite and Node.js."
          }
        },
        {
          "@type": "Question",
          name: "Which conversion engines are documented?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The documentation covers bundled FFmpeg and ffprobe plus optional Maximum Quality engines: PDFium, LibreOffice headless, Pandoc and libvips."
          }
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Documentation", item: pageUrl }
      ]
    }
  ];

  return (
    <main className="legal-page conversion-page shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href={localPath("/")}>Home</a>
        <span aria-hidden="true">/</span>
        <span>Documentation</span>
      </nav>

      <header className="legal-hero conversion-hero">
        <span className="section-kicker">Documentation</span>
        <h1>Multi-Converter documentation</h1>
        <p className="content-meta">Last updated: June 6, 2026</p>
        <p>
          Product and technical documentation for Multi-Converter: supported formats, local conversion behavior,
          optional engines, releases, source code and development stack.
        </p>
      </header>

      <div className="conversion-layout">
        <article className="conversion-article">
          <section id="overview">
            <h2>Overview</h2>
            <p>
              Multi-Converter is a free and open-source Windows file converter. It converts documents, data files,
              images, audio and video directly on the user's computer, without requiring an account, a subscription or
              mandatory upload to a cloud conversion service.
            </p>
            <div className="actions">
              <a className="btn primary" href={localPath(downloadPath)}>Download Multi-Converter</a>
              <a className="btn ghost" href={sourceUrl} target="_blank" rel="noopener noreferrer">View source code</a>
            </div>
          </section>

          <section id="official-links">
            <h2>Official project links</h2>
            <div className="conversion-card-grid compact-card-grid">
              {projectLinks.map((link) => <ExternalCard key={link.href} {...link} />)}
            </div>
          </section>

          <section id="formats">
            <h2>Recognized formats</h2>
            <p>
              Recognized formats do not mean every source format can be converted to every target format. The app shows
              available conversions based on the source file, the target format and the engines installed locally.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Recognized formats</th>
                  </tr>
                </thead>
                <tbody>
                  {formatRows.map(([category, formats]) => (
                    <tr key={category}>
                      <th scope="row">{category}</th>
                      <td>{formats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="privacy">
            <h2>Local conversion and privacy</h2>
            <p>
              Supported conversions run on the user's machine. Internet access can be used to download the app, retrieve
              updates, open the GitHub repository or install the optional Maximum Quality extension, but local
              conversions do not require mandatory file upload.
            </p>
          </section>

          <section id="engines">
            <h2>Conversion engines</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Engine tier</th>
                    <th scope="col">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {engineRows.map(([engine, role]) => (
                    <tr key={engine}>
                      <th scope="row">{engine}</th>
                      <td>{role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="stack">
            <h2>Development stack</h2>
            <p>
              The desktop app is built with a Tauri 2 shell, a React and TypeScript interface, a Rust backend, Cargo
              tooling, Vite for frontend builds and Node.js for scripts.
            </p>
            <div className="conversion-card-grid compact-card-grid">
              {stackLinks.map((link) => <ExternalCard key={link.href} {...link} />)}
            </div>
          </section>

          <section id="commands">
            <h2>Useful developer commands</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Task</th>
                    <th scope="col">Command</th>
                  </tr>
                </thead>
                <tbody>
                  {commandRows.map(([task, command]) => (
                    <tr key={task}>
                      <th scope="row">{task}</th>
                      <td><code>{command}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="licenses">
            <h2>Licenses and third-party engines</h2>
            <p>
              Multi-Converter's own code is published under AGPL-3.0-or-later. Third-party conversion engines keep
              their own licenses, notices and redistribution conditions. Users and contributors should verify release
              files, engine archives and license notices from the official repository before redistribution.
            </p>
          </section>
        </article>

        <aside className="conversion-sidebar" aria-label="Documentation summary">
          <div>
            <span>Product</span>
            <strong>Multi-Converter</strong>
          </div>
          <div>
            <span>Repository</span>
            <strong>GitHub</strong>
          </div>
          <div>
            <span>Stack</span>
            <strong>Tauri, React, TypeScript, Rust</strong>
          </div>
          <a className="btn primary" href={releasesUrl} target="_blank" rel="noopener noreferrer">Open releases</a>
          <a className="text-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Repository</a>
        </aside>
      </div>
    </main>
  );
}
