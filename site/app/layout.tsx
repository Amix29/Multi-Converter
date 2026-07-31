import type { Metadata } from "next";
import Script from "next/script";
import { SiteChrome } from "./site-chrome";
import { getBasePath, getSiteUrl } from "./site-url";
import "./globals.css";

const siteUrl = getSiteUrl();
const ogImage = siteUrl ? `${siteUrl}/og-image.png` : undefined;
const basePath = getBasePath();
const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/Amix29/Multi-Converter";
const releasesUrl = process.env.NEXT_PUBLIC_RELEASES_URL || `${sourceUrl}/releases/latest`;
const youtubeUrl = "https://www.youtube.com/@amixdigital";
const productVersion = process.env.NEXT_PUBLIC_PRODUCT_VERSION || "v1.0.0";
const contentDate = "2026-06-02";

const globalJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": `${siteUrl}/#organization`,
      "@type": "Organization",
      name: "Multi-Converter",
      url: siteUrl,
      logo: siteUrl ? `${siteUrl}/multi-converter-icon-interface-green.svg` : undefined,
      sameAs: [sourceUrl, releasesUrl, youtubeUrl],
      foundingDate: "2026",
      knowsAbout: [
        "local file conversion",
        "offline file conversion",
        "Windows file converter",
        "open source file converter",
        "PDF conversion",
        "image conversion",
        "audio conversion",
        "video conversion"
      ]
    },
    {
      "@id": `${siteUrl}/#software`,
      "@type": "SoftwareApplication",
      name: "Multi-Converter",
      url: siteUrl,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Windows",
      softwareVersion: productVersion,
      datePublished: contentDate,
      dateModified: contentDate,
      isAccessibleForFree: true,
      codeRepository: sourceUrl,
      downloadUrl: releasesUrl,
      installUrl: releasesUrl,
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      description:
        "Multi-Converter is a free, local and open-source file converter for Windows. It converts documents, data files, images, audio and video without an account, subscription or mandatory cloud upload.",
      featureList: [
        "Local file conversion on Windows x64",
        "Document, data, image, audio and video conversion",
        "No account required",
        "No subscription required",
        "Open-source code on GitHub",
        "Optional Maximum Quality extension with PDFium, LibreOffice, Pandoc and libvips"
      ],
      screenshot: [
        `${siteUrl}/screenshots/conversion-interface.png`,
        `${siteUrl}/screenshots/format-selection.png`,
        `${siteUrl}/screenshots/ready-download.png`
      ],
      softwareRequirements: "Windows x64",
      publisher: { "@id": `${siteUrl}/#organization` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: `${siteUrl}/download/`
      }
    },
    {
      "@id": `${siteUrl}/#website`,
      "@type": "WebSite",
      name: "Multi-Converter",
      url: siteUrl,
      inLanguage: "en-US",
      dateModified: contentDate,
      publisher: { "@id": `${siteUrl}/#organization` },
      about: { "@id": `${siteUrl}/#software` },
      hasPart: [
        { "@id": `${siteUrl}/download/#webpage` },
        { "@id": `${siteUrl}/documentation/#webpage` },
        { "@id": `${siteUrl}/formats/#webpage` },
        { "@id": `${siteUrl}/convert/#webpage` },
        { "@id": `${siteUrl}/guides/#webpage` },
        { "@id": `${siteUrl}/alternatives/#webpage` },
        { "@id": `${siteUrl}/llms.txt#resource` },
        { "@id": `${siteUrl}/answers.txt#resource` },
        { "@id": `${siteUrl}/trust.txt#resource` },
        { "@id": `${siteUrl}/pricing.txt#resource` }
      ]
    },
    {
      "@id": `${siteUrl}/download/#webpage`,
      "@type": "WebPage",
      name: "Download Multi-Converter for Windows",
      url: `${siteUrl}/download/`,
      inLanguage: "en-US",
      dateModified: contentDate,
      about: { "@id": `${siteUrl}/#software` }
    },
    {
      "@id": `${siteUrl}/documentation/#webpage`,
      "@type": "TechArticle",
      name: "Multi-Converter documentation",
      url: `${siteUrl}/documentation/`,
      inLanguage: "en-US",
      dateModified: contentDate,
      about: { "@id": `${siteUrl}/#software` },
      dependencies: ["Tauri", "React", "TypeScript", "Rust", "Cargo", "Vite", "Node.js"]
    },
    {
      "@id": `${siteUrl}/llms.txt#resource`,
      "@type": "DigitalDocument",
      name: "Multi-Converter LLM context",
      url: `${siteUrl}/llms.txt`,
      encodingFormat: "text/plain",
      inLanguage: "en-US",
      dateModified: contentDate,
      about: { "@id": `${siteUrl}/#software` }
    },
    {
      "@id": `${siteUrl}/answers.txt#resource`,
      "@type": "DigitalDocument",
      name: "Multi-Converter AI answer file",
      url: `${siteUrl}/answers.txt`,
      encodingFormat: "text/plain",
      inLanguage: "en-US",
      dateModified: contentDate,
      about: { "@id": `${siteUrl}/#software` }
    },
    {
      "@id": `${siteUrl}/trust.txt#resource`,
      "@type": "DigitalDocument",
      name: "Multi-Converter trust and technical facts",
      url: `${siteUrl}/trust.txt`,
      encodingFormat: "text/plain",
      inLanguage: "en-US",
      dateModified: contentDate,
      about: { "@id": `${siteUrl}/#software` }
    },
    {
      "@id": `${siteUrl}/pricing.txt#resource`,
      "@type": "DigitalDocument",
      name: "Multi-Converter pricing facts",
      url: `${siteUrl}/pricing.txt`,
      encodingFormat: "text/plain",
      inLanguage: "en-US",
      dateModified: contentDate,
      about: { "@id": `${siteUrl}/#software` }
    }
  ]
};

function assetPath(path: string) {
  return `${basePath}${path}`;
}

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  applicationName: "Multi-Converter",
  title: {
    default: "Multi-Converter - Free Offline File Converter for Windows",
    template: "%s | Multi-Converter"
  },
  description:
    "Convert PDF, images, audio, video and documents locally on Windows with Multi-Converter, a free open-source file converter with no mandatory upload.",
  keywords: [
    "file converter",
    "local file converter",
    "Windows file converter",
    "file conversion",
    "convert PDF to HTML",
    "convert CSV JSON XML",
    "offline file conversion",
    "Windows video converter",
    "local audio converter",
    "convert MP4 to MP3",
    "convert MOV to MP4",
    "convert PNG to WebP",
    "convert DOCX to PDF",
    "free file converter",
    "open source file converter",
    "file conversion software",
    "Multi-Converter"
  ],
  authors: [{ name: "Multi-Converter" }],
  creator: "Multi-Converter",
  publisher: "Multi-Converter",
  category: "software",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || undefined,
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? {
          other: {
            "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
          }
        }
      : {})
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  alternates: {
    canonical: siteUrl ? "/" : undefined
  },
  icons: {
    icon: assetPath("/favicon.svg"),
    apple: assetPath("/apple-icon.svg")
  },
  manifest: assetPath("/manifest.webmanifest"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Multi-Converter",
    title: "Multi-Converter - Free Offline File Converter for Windows",
    description:
      "Convert PDF, images, audio, video and documents locally on Windows with a free open-source file converter.",
    images: ogImage
      ? [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: "Multi-Converter, local file converter for Windows"
          }
        ]
      : undefined
  },
  twitter: {
    card: "summary_large_image",
    title: "Multi-Converter - Free Offline File Converter for Windows",
    description:
      "Convert PDF, images, audio, video and documents locally on Windows. Free, open source and no mandatory upload.",
    images: ogImage ? [ogImage] : undefined
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(globalJsonLd) }} />
        <SiteChrome>{children}</SiteChrome>
        <Script id="site-interactions-loader" src={assetPath("/site-interactions.js")} strategy="afterInteractive" />
      </body>
    </html>
  );
}
