import type { MetadataRoute } from "next";
import { getSiteUrl } from "./site-url";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/"
      },
      {
        userAgent: [
          "OAI-SearchBot",
          "GPTBot",
          "ChatGPT-User",
          "Perplexity-User",
          "PerplexityBot",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "anthropic-ai",
          "Google-Extended",
          "Bingbot",
          "Applebot"
        ],
        allow: "/"
      }
    ],
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined
  };
}
