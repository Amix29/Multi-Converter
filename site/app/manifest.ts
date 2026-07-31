import type { MetadataRoute } from "next";
import { getBasePath } from "./site-url";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = getBasePath();

  return {
    name: "Multi-Converter",
    short_name: "Multi-Converter",
    description:
      "Free, local and open-source file converter for Windows.",
    start_url: `${basePath}/`,
    scope: `${basePath || "/"}`,
    display: "standalone",
    background_color: "#f5f3ec",
    theme_color: "#c46f3a",
    categories: ["utilities", "productivity"],
    lang: "en-US",
    icons: [
      {
        src: `${basePath}/favicon.svg`,
        sizes: "64x64",
        type: "image/svg+xml"
      },
      {
        src: `${basePath}/apple-icon.svg`,
        sizes: "180x180",
        type: "image/svg+xml"
      }
    ]
  };
}
