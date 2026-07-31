function normalizeSiteUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  }

  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  if (process.env.GITHUB_ACTIONS === "true" && owner && repo) {
    const isUserPage = repo === `${owner}.github.io`;
    return normalizeSiteUrl(`https://${owner}.github.io${isUserPage ? "" : `/${repo}`}`);
  }

  return "https://amix29.github.io/Multi-Converter";
}

export function getBasePath() {
  if (process.env.NEXT_PUBLIC_BASE_PATH !== undefined) {
    return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
  }

  const [ownerName, repoName] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const isProjectPage =
    process.env.GITHUB_ACTIONS === "true" &&
    repoName &&
    repoName !== `${ownerName}.github.io`;

  return isProjectPage ? `/${repoName}` : "/Multi-Converter";
}

export function localPath(path: string) {
  const basePath = getBasePath();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${basePath}${normalizedPath}`;
}
