import type { MetadataRoute } from "next";
import { alternativePages } from "./alternative-data";
import { conversionPages } from "./conversion-data";
import { formatPages } from "./format-data";
import { guidePages } from "./guide-data";
import {
  aboutPath,
  conversionPath,
  convertHubPath,
  documentationPath,
  downloadPath,
  guidePath,
  legalPath,
  privacyPath
} from "./seo-routes";
import { getSiteUrl } from "./site-url";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    return [];
  }

  const staticPages = [
    { path: "/", priority: 1 },
    { path: downloadPath, priority: 0.93 },
    { path: "/formats/", priority: 0.94 },
    { path: convertHubPath, priority: 0.92 },
    { path: "/guides/", priority: 0.91 },
    { path: documentationPath, priority: 0.89 },
    { path: "/alternatives/", priority: 0.9 },
    { path: aboutPath, priority: 0.82 },
    { path: legalPath, priority: 0.7 },
    { path: privacyPath, priority: 0.7 },
    { path: "/llms.txt", priority: 0.64 },
    { path: "/answers.txt", priority: 0.62 },
    { path: "/trust.txt", priority: 0.61 },
    { path: "/pricing.txt", priority: 0.6 }
  ];

  const conversionEntries = conversionPages.map((page) => ({
    url: `${siteUrl}${conversionPath(page)}`,
    lastModified: new Date("2026-06-06"),
    changeFrequency: "monthly" as const,
    priority: 0.86
  }));

  const alternativeEntries = alternativePages.map((page) => ({
    url: `${siteUrl}/alternatives/${page.slug}/`,
    lastModified: new Date("2026-06-06"),
    changeFrequency: "monthly" as const,
    priority: 0.84
  }));

  const formatEntries = formatPages.map((page) => ({
    url: `${siteUrl}/formats/${page.slug}/`,
    lastModified: new Date("2026-06-06"),
    changeFrequency: "monthly" as const,
    priority: 0.83
  }));

  const guideEntries = guidePages.map((page) => ({
    url: `${siteUrl}${guidePath(page)}`,
    lastModified: new Date("2026-06-06"),
    changeFrequency: "monthly" as const,
    priority: 0.85
  }));

  return [
    ...staticPages.map(({ path, priority }) => ({
      url: `${siteUrl}${path}`,
      lastModified: new Date("2026-06-06"),
      changeFrequency: "monthly" as const,
      priority
    })),
    ...formatEntries,
    ...conversionEntries,
    ...guideEntries,
    ...alternativeEntries
  ];
}
