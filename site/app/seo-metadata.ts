import type { Metadata } from "next";
import { getSiteUrl } from "./site-url";

type SeoMetadataInput = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
};

export function buildSeoMetadata({ title, description, path, type = "website" }: SeoMetadataInput): Metadata {
  const siteUrl = getSiteUrl();
  const absoluteUrl = `${siteUrl}${path}`;
  const image = `${siteUrl}/og-image.png`;
  const titleWithBrand = `${title} | Multi-Converter`;

  return {
    title,
    description,
    alternates: {
      canonical: path
    },
    openGraph: {
      title: titleWithBrand,
      description,
      type,
      url: absoluteUrl,
      siteName: "Multi-Converter",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Multi-Converter, local file converter for Windows"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: titleWithBrand,
      description,
      images: [image]
    }
  };
}
