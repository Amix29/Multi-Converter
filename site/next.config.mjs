import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.dirname(fileURLToPath(import.meta.url));
const [ownerName, repoName] = (process.env.GITHUB_REPOSITORY || "").split("/");
const isProjectPage =
  process.env.GITHUB_ACTIONS === "true" &&
  repoName &&
  repoName !== `${ownerName}.github.io`;
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

function normalizeBasePath(value) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

const basePath =
  configuredBasePath === undefined
    ? isProjectPage
      ? `/${repoName}`
      : "/Multi-Converter"
    : normalizeBasePath(configuredBasePath);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  turbopack: {
    root: siteRoot
  },
  images: {
    unoptimized: true
  }
};

export default nextConfig;
