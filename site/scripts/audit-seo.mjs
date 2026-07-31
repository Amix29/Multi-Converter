import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/Multi-Converter";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://amix29.github.io/Multi-Converter";

const staticResources = [
  "llms.txt",
  "answers.txt",
  "trust.txt",
  "pricing.txt",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "og-image.png",
  "_headers",
  ".nojekyll"
];

const ignoredInternalExtensions = [".svg", ".png", ".webp", ".avif", ".js", ".css", ".ico", ".txt", ".xml", ".webmanifest"];
const forbiddenUiRoutes = [
  "/telecharger/",
  "/convertir/",
  "/a-propos/",
  "/confidentialite/",
  "/mentions-legales/",
  "/plan-du-site/",
  "/reponses-ia/",
  "/ai-answers/",
  "/sitemap/"
];
const expectedRoutes = [
  "/",
  "/download/",
  "/convert/",
  "/convert/mp4-to-mp3/",
  "/guides/local-file-converter/",
  "/documentation/",
  "/about/",
  "/privacy/",
  "/legal-notice/"
];
const aiFiles = ["llms.txt", "answers.txt", "trust.txt", "pricing.txt"];
const requiredAiUserAgents = [
  "OAI-SearchBot",
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "Google-Extended",
  "Bingbot",
  "Applebot"
];
const forbiddenExportStrings = ["0.1.0-preview"];
const exportTextExtensions = new Set([".html", ".txt", ".xml", ".json", ".webmanifest"]);
const requiredGlobalSoftwareFields = [
  "softwareVersion",
  "datePublished",
  "dateModified",
  "description",
  "featureList",
  "screenshot",
  "softwareRequirements",
  "codeRepository",
  "downloadUrl",
  "installUrl",
  "license",
  "offers"
];
const requiredWebsiteParts = [
  "/download/#webpage",
  "/documentation/#webpage",
  "/llms.txt#resource",
  "/answers.txt#resource",
  "/trust.txt#resource",
  "/pricing.txt#resource"
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message, details = []) {
  console.error(`SEO audit failed: ${message}`);
  for (const detail of details.slice(0, 20)) {
    console.error(`- ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  process.exitCode = 1;
}

function walk(dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function routeFromHtml(file) {
  const rel = path.relative(outDir, file).replaceAll("\\", "/");

  if (rel === "index.html") {
    return "/";
  }

  if (rel.endsWith("/index.html")) {
    return `/${rel.slice(0, -"index.html".length)}`;
  }

  return `/${rel}`;
}

function normalizeInternalHref(href, currentRoute) {
  if (
    !href ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:") ||
    href.startsWith("//")
  ) {
    return null;
  }

  if (href.startsWith("#")) {
    return { hash: href.slice(1), path: currentRoute, unprefixed: false };
  }

  let parsed;
  try {
    parsed = new URL(href, siteUrl);
  } catch {
    return null;
  }

  if (parsed.origin !== new URL(siteUrl).origin) {
    return null;
  }

  const fullPath = parsed.pathname;
  let localPath = null;
  let unprefixed = false;

  if (basePath && (fullPath === basePath || fullPath.startsWith(`${basePath}/`))) {
    localPath = fullPath.replace(new RegExp(`^${escapeRegExp(basePath)}`), "") || "/";
  } else if (fullPath.startsWith("/")) {
    localPath = fullPath;
    unprefixed = Boolean(basePath);
  }

  if (!localPath) {
    return null;
  }

  return {
    hash: parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : "",
    path: localPath || "/",
    unprefixed
  };
}

function idsInHtml(html) {
  return new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((match) => match[1]));
}

function metaContent(html, name) {
  return (html.match(new RegExp(`<meta name="${escapeRegExp(name)}" content="([^"]*)"`, "i")) || [])[1] || "";
}

function titleContent(html) {
  return (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
}

function canonicalHref(html) {
  return (html.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1] || "";
}

function stripHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function schemaNodes(value) {
  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => (Array.isArray(item?.["@graph"]) ? item["@graph"] : [item]));
}

function schemaTypesFromNodes(nodes) {
  const types = new Set();

  function visit(value) {
    if (!value || typeof value !== "object") {
      return;
    }

    const type = value["@type"];
    if (Array.isArray(type)) {
      for (const item of type) {
        types.add(item);
      }
    } else if (type) {
      types.add(type);
    }

    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else {
        visit(child);
      }
    }
  }

  nodes.forEach(visit);
  return types;
}

if (!fs.existsSync(outDir)) {
  fail("missing out directory; run npm run build first");
  process.exit();
}

const allFiles = walk(outDir);
const htmlFiles = allFiles.filter((file) => file.endsWith(".html"));
const seoHtmlFiles = htmlFiles.filter((file) => !/^google[a-z0-9]+\.html$/i.test(path.basename(file)));
const routes = new Set(seoHtmlFiles.map(routeFromHtml));
const routeFiles = new Map(seoHtmlFiles.map((file) => [routeFromHtml(file), file]));
const inboundLinks = new Map(seoHtmlFiles.map((file) => [routeFromHtml(file), new Set()]));

const staleExportStrings = allFiles.flatMap((file) => {
  const ext = path.extname(file);

  if (!exportTextExtensions.has(ext) && path.basename(file) !== "robots.txt") {
    return [];
  }

  const content = fs.readFileSync(file, "utf8");
  return forbiddenExportStrings
    .filter((value) => content.includes(value))
    .map((value) => ({
      file: path.relative(outDir, file).replaceAll("\\", "/"),
      value
    }));
});

if (staleExportStrings.length > 0) {
  fail("stale placeholder strings found in export", staleExportStrings);
}

for (const resource of staticResources) {
  if (fs.existsSync(path.join(outDir, resource))) {
    routes.add(`/${resource}`);
  }
}

const missingExpectedRoutes = expectedRoutes.filter((route) => !routes.has(route));
if (missingExpectedRoutes.length > 0) {
  fail("expected SEO routes are missing", missingExpectedRoutes);
}

const missingAiFiles = aiFiles.filter((file) => !fs.existsSync(path.join(outDir, file)));
if (missingAiFiles.length > 0) {
  fail("AI text files are missing", missingAiFiles);
}

if (!fs.existsSync(path.join(outDir, ".nojekyll"))) {
  fail(".nojekyll is missing from the static export");
}

if (!fs.existsSync(path.join(outDir, "og-image.png"))) {
  fail("Open Graph PNG image is missing from the static export");
}

if (!fs.existsSync(path.join(outDir, "_headers"))) {
  fail("_headers cache policy file is missing from the static export");
}

const robotsPath = path.join(outDir, "robots.txt");
if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, "utf8");
  const missingAiUserAgents = requiredAiUserAgents.filter(
    (userAgent) => !new RegExp(`User-Agent:\\s*${escapeRegExp(userAgent)}\\b`, "i").test(robots)
  );

  if (missingAiUserAgents.length > 0) {
    fail("robots.txt is missing AI/search crawler allowlist user agents", missingAiUserAgents);
  }
}

const llmsPath = path.join(outDir, "llms.txt");
if (fs.existsSync(llmsPath)) {
  const llms = fs.readFileSync(llmsPath, "utf8");
  const missingLlmsReferences = ["/answers.txt", "/trust.txt", "/pricing.txt", "/sitemap.xml"].filter(
    (reference) => !llms.includes(reference)
  );

  if (missingLlmsReferences.length > 0) {
    fail("llms.txt is missing required machine-readable resource references", missingLlmsReferences);
  }

  const forbiddenLlmsReferences = ["/ai-answers/", "/reponses-ia/", "/plan-du-site/", "/sitemap/"].filter(
    (reference) => llms.includes(reference)
  );

  if (forbiddenLlmsReferences.length > 0) {
    fail("llms.txt references removed UI pages", forbiddenLlmsReferences);
  }
}

const forbiddenRouteDirs = forbiddenUiRoutes
  .map((route) => route.split("/").filter(Boolean)[0])
  .filter((name, index, names) => name && names.indexOf(name) === index)
  .filter((name) => fs.existsSync(path.join(outDir, name)));
if (forbiddenRouteDirs.length > 0) {
  fail("legacy or machine-only UI route directories were exported", forbiddenRouteDirs);
}

const brokenLinks = [];
const metadataIssues = [];
const forbiddenUiLinks = [];
const legacyUrlHits = [];
const txtLinksFromUi = [];
const jsonLdIssues = [];
const anchorIssues = [];
const basePathIssues = [];
const duplicateTitles = new Map();
const duplicateDescriptions = new Map();
const orphanHtmlRoutes = [];

function registerDuplicate(map, value, route) {
  if (!value) {
    return;
  }

  const list = map.get(value) || [];
  list.push(route);
  map.set(value, list);
}

for (const file of seoHtmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const route = routeFromHtml(file);
  const is404Route = route === "/404.html";
  const visibleWordCount = stripHtml(html).split(/\s+/).filter(Boolean).length;
  const isProgrammaticDetailRoute =
    (route.startsWith("/formats/") && route !== "/formats/") ||
    (route.startsWith("/convert/") && route !== "/convert/") ||
    (route.startsWith("/guides/") && route !== "/guides/") ||
    (route.startsWith("/alternatives/") && route !== "/alternatives/");
  const title = titleContent(html);
  const description = metaContent(html, "description");
  const canonical = canonicalHref(html);
  const ogImage = (html.match(/<meta property="og:image" content="([^"]+)"/i) || [])[1] || "";
  const twitterImage = (html.match(/<meta name="twitter:image" content="([^"]+)"/i) || [])[1] || "";
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const headings = Array.from(html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)).map((match) => ({
    level: Number(match[1]),
    text: stripHtml(match[2])
  }));
  const structuredDataNodes = [];
  const imagesWithoutUsefulAlt = Array.from(html.matchAll(/<img\b[^>]*>/gi))
    .map((match) => match[0])
    .filter((image) => {
      const altMatch = image.match(/\salt=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const altText = altMatch ? altMatch[1] ?? altMatch[2] ?? altMatch[3] ?? "" : "";

      return altText.trim().length === 0;
    });
  const robotsMetaValues = Array.from(html.matchAll(/<meta name="robots" content="([^"]*)"/gi)).map(
    (match) => match[1]
  );
  const hasNoindex = robotsMetaValues.some((value) => /\bnoindex\b/i.test(value));
  const hasIndexRobots = robotsMetaValues.some(
    (value) => /\bindex\b/i.test(value) && !/\bnoindex\b/i.test(value)
  );

  if (!/<html[^>]+lang="en"/.test(html)) {
    metadataIssues.push({ route, issue: "missing html lang=en" });
  }

  if (!/<title>[^<]{20,}[^<]*<\/title>/.test(html)) {
    metadataIssues.push({ route, issue: "weak or missing title" });
  }

  if (!is404Route && (title.length < 45 || title.length > 70)) {
    metadataIssues.push({ route, issue: "title is outside recommended SEO length", length: title.length });
  }

  if (!is404Route && !/<meta name="description" content="[^"]{50,}"/.test(html)) {
    metadataIssues.push({ route, issue: "weak or missing meta description" });
  }

  if (!is404Route && (ogImage !== `${siteUrl}/og-image.png` || twitterImage !== `${siteUrl}/og-image.png`)) {
    metadataIssues.push({
      route,
      issue: "social image metadata must use the PNG Open Graph asset",
      ogImage,
      twitterImage
    });
  }

  if (!is404Route && (description.length < 120 || description.length > 170)) {
    metadataIssues.push({
      route,
      issue: "meta description is outside recommended snippet length",
      length: description.length
    });
  }

  if (!is404Route && !new RegExp(`<link rel="canonical" href="${escapeRegExp(siteUrl)}/`).test(html)) {
    metadataIssues.push({ route, issue: "missing expected canonical" });
  }

  if (!is404Route && canonical && canonical !== `${siteUrl}${route}`) {
    metadataIssues.push({ route, issue: "canonical does not match route", canonical, expected: `${siteUrl}${route}` });
  }

  if (!is404Route && h1Count !== 1) {
    metadataIssues.push({ route, issue: "indexable route must have exactly one H1", h1Count });
  }

  let previousHeadingLevel = 0;
  for (const heading of headings) {
    if (previousHeadingLevel !== 0 && heading.level > previousHeadingLevel + 1) {
      metadataIssues.push({
        route,
        issue: "heading hierarchy skips a level",
        previousHeadingLevel,
        currentHeadingLevel: heading.level,
        heading: heading.text
      });
      break;
    }
    previousHeadingLevel = heading.level;
  }

  if (!is404Route && imagesWithoutUsefulAlt.length > 0) {
    metadataIssues.push({
      route,
      issue: "image elements must declare useful non-empty alt text",
      count: imagesWithoutUsefulAlt.length
    });
  }

  if (!is404Route && isProgrammaticDetailRoute && visibleWordCount < 300) {
    metadataIssues.push({
      route,
      issue: "programmatic SEO detail page is too thin",
      visibleWordCount,
      minimum: 300
    });
  }

  if (!is404Route && hasNoindex) {
    metadataIssues.push({ route, issue: "indexable route has noindex robots meta" });
  }

  if (is404Route && !hasNoindex) {
    metadataIssues.push({ route, issue: "404 route must be noindex" });
  }

  if (is404Route && hasIndexRobots) {
    metadataIssues.push({ route, issue: "404 route has indexable robots meta" });
  }

  if (is404Route && /<link rel="canonical"/.test(html)) {
    metadataIssues.push({ route, issue: "404 route should not declare a canonical URL" });
  }

  if (!is404Route && !/<script type="application\/ld\+json"/.test(html)) {
    metadataIssues.push({ route, issue: "missing JSON-LD" });
  }

  if (!is404Route) {
    registerDuplicate(duplicateTitles, title, route);
    registerDuplicate(duplicateDescriptions, description, route);
  }

  if (/<nav class="main-nav"|data-section-nav/.test(html) && !/<script\b(?=[^>]*\bsrc="[^"]*site-interactions\.js")/.test(html)) {
    metadataIssues.push({ route, issue: "section navigation is missing site-interactions.js" });
  }

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      structuredDataNodes.push(...schemaNodes(JSON.parse(match[1])));
    } catch (error) {
      jsonLdIssues.push({ route, issue: error instanceof Error ? error.message : "invalid JSON-LD" });
    }
  }

  const schemaTypes = schemaTypesFromNodes(structuredDataNodes);
  const hasSchemaType = (type) => schemaTypes.has(type);

  if (!is404Route) {
    if (!hasSchemaType("BreadcrumbList")) {
      metadataIssues.push({ route, issue: "missing BreadcrumbList structured data" });
    }

    if (!structuredDataNodes.some((node) => node?.dateModified)) {
      metadataIssues.push({ route, issue: "missing dateModified structured data freshness signal" });
    }

    const globalSoftware = structuredDataNodes.find((node) => node?.["@id"] === `${siteUrl}/#software`);
    if (!globalSoftware) {
      metadataIssues.push({ route, issue: "missing global SoftwareApplication entity" });
    } else {
      const missingSoftwareFields = requiredGlobalSoftwareFields.filter((field) => !globalSoftware[field]);
      if (missingSoftwareFields.length > 0) {
        metadataIssues.push({
          route,
          issue: "global SoftwareApplication entity is missing SEO fields",
          missingSoftwareFields
        });
      }

      if (!Array.isArray(globalSoftware.featureList) || globalSoftware.featureList.length < 5) {
        metadataIssues.push({ route, issue: "global SoftwareApplication featureList is too thin" });
      }

      if (!Array.isArray(globalSoftware.screenshot) || globalSoftware.screenshot.length < 3) {
        metadataIssues.push({ route, issue: "global SoftwareApplication screenshots are missing or too sparse" });
      }
    }

    const globalWebsite = structuredDataNodes.find((node) => node?.["@id"] === `${siteUrl}/#website`);
    const websitePartIds = Array.isArray(globalWebsite?.hasPart)
      ? globalWebsite.hasPart.map((part) => part?.["@id"]).filter(Boolean)
      : [];
    const missingWebsiteParts = requiredWebsiteParts
      .map((part) => `${siteUrl}${part}`)
      .filter((part) => !websitePartIds.includes(part));
    if (missingWebsiteParts.length > 0) {
      metadataIssues.push({ route, issue: "global WebSite entity is missing important hasPart links", missingWebsiteParts });
    }

    if (route === "/" && (!hasSchemaType("SoftwareApplication") || !hasSchemaType("FAQPage"))) {
      metadataIssues.push({ route, issue: "home page must expose SoftwareApplication and FAQPage structured data" });
    }

    if (route === "/download/" && (!hasSchemaType("SoftwareApplication") || !hasSchemaType("FAQPage"))) {
      metadataIssues.push({ route, issue: "download page must expose SoftwareApplication and FAQPage structured data" });
    }

    if (["/alternatives/", "/convert/", "/formats/", "/guides/"].includes(route)) {
      if (!hasSchemaType("CollectionPage") || !hasSchemaType("ItemList")) {
        metadataIssues.push({ route, issue: "hub pages must expose CollectionPage and ItemList structured data" });
      }
    }

    if (route.startsWith("/convert/") && route !== "/convert/") {
      if (!hasSchemaType("Article") || !hasSchemaType("HowTo") || !hasSchemaType("FAQPage")) {
        metadataIssues.push({ route, issue: "conversion pages must expose Article, HowTo and FAQPage structured data" });
      }
    }

    if (route.startsWith("/guides/") && route !== "/guides/") {
      if (!hasSchemaType("Article") || !hasSchemaType("FAQPage") || !hasSchemaType("ItemList")) {
        metadataIssues.push({ route, issue: "guide pages must expose Article, FAQPage and ItemList structured data" });
      }
    }

    if (route.startsWith("/alternatives/") && route !== "/alternatives/") {
      if (!hasSchemaType("Article") || !hasSchemaType("FAQPage")) {
        metadataIssues.push({ route, issue: "alternative pages must expose Article and FAQPage structured data" });
      }
    }

    if (route.startsWith("/formats/") && route !== "/formats/") {
      if (!hasSchemaType("Article")) {
        metadataIssues.push({ route, issue: "format pages must expose Article structured data" });
      }
    }
  }

  for (const forbiddenRoute of forbiddenUiRoutes) {
    if (html.includes(forbiddenRoute) || route.startsWith(forbiddenRoute)) {
      legacyUrlHits.push({ route, forbiddenRoute });
    }
  }

  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];

    if (/\/(?:llms|answers|trust|pricing)\.txt$/.test(href)) {
      txtLinksFromUi.push({ route, href });
    }

    if (forbiddenUiRoutes.some((forbiddenRoute) => href.includes(forbiddenRoute))) {
      forbiddenUiLinks.push({ route, href });
    }

    const localHref = normalizeInternalHref(href, route);
    if (!localHref) {
      continue;
    }

    const clean = localHref.path.split("?")[0] || "/";
    const extension = path.extname(clean);
    if (clean.startsWith("/_next/") || clean.startsWith("/screenshots/") || ignoredInternalExtensions.includes(extension)) {
      continue;
    }

    if (localHref.unprefixed) {
      basePathIssues.push({ route, href, target: clean });
    }

    if (!routes.has(clean)) {
      brokenLinks.push({ route, href, target: clean });
      continue;
    }

    if (routeFiles.has(clean) && clean !== route) {
      inboundLinks.get(clean)?.add(route);
    }

    if (localHref.hash) {
      const targetHtml = fs.readFileSync(routeFiles.get(clean), "utf8");
      if (!idsInHtml(targetHtml).has(localHref.hash)) {
        anchorIssues.push({ route, href, target: clean, missingId: localHref.hash });
      }
    }
  }
}

for (const [route, sources] of inboundLinks) {
  if (route !== "/" && route !== "/404.html" && sources.size === 0) {
    orphanHtmlRoutes.push(route);
  }
}

const duplicateTitleIssues = Array.from(duplicateTitles.entries())
  .filter(([, routeList]) => routeList.length > 1)
  .map(([title, routeList]) => ({ title, routes: routeList }));
const duplicateDescriptionIssues = Array.from(duplicateDescriptions.entries())
  .filter(([, routeList]) => routeList.length > 1)
  .map(([description, routeList]) => ({ description, routes: routeList }));

if (metadataIssues.length > 0) {
  fail("metadata issues found", metadataIssues);
}

if (jsonLdIssues.length > 0) {
  fail("invalid JSON-LD found", jsonLdIssues);
}

if (duplicateTitleIssues.length > 0) {
  fail("duplicate title tags found", duplicateTitleIssues);
}

if (duplicateDescriptionIssues.length > 0) {
  fail("duplicate meta descriptions found", duplicateDescriptionIssues);
}

if (legacyUrlHits.length > 0) {
  fail("legacy or machine-only URL references found in UI HTML", legacyUrlHits);
}

if (forbiddenUiLinks.length > 0) {
  fail("links to forbidden UI routes found", forbiddenUiLinks);
}

if (txtLinksFromUi.length > 0) {
  fail("visible UI links to AI text files found", txtLinksFromUi);
}

if (basePathIssues.length > 0) {
  fail("root-relative internal links missing the configured basePath", basePathIssues);
}

if (brokenLinks.length > 0) {
  fail("broken internal links found", brokenLinks);
}

if (anchorIssues.length > 0) {
  fail("broken same-site hash anchors found", anchorIssues);
}

if (orphanHtmlRoutes.length > 0) {
  fail("indexable HTML routes have no internal inbound links", orphanHtmlRoutes);
}

const sitemapPath = path.join(outDir, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const forbiddenSitemapUrls = forbiddenUiRoutes.filter((route) => route !== "/sitemap/" && sitemap.includes(route));
  if (forbiddenSitemapUrls.length > 0) {
    fail("legacy or machine-only UI URLs found in sitemap.xml", forbiddenSitemapUrls);
  }

  const expectedSitemapUrls = [...expectedRoutes, ...aiFiles.map((file) => `/${file}`)].map((route) => `${siteUrl}${route}`);
  const missingSitemapUrls = expectedSitemapUrls.filter((url) => !sitemap.includes(url));
  if (missingSitemapUrls.length > 0) {
    fail("sitemap.xml is missing expected canonical URLs", missingSitemapUrls);
  }

  const indexableHtmlRoutes = htmlFiles
    .filter((file) => !/^google[a-z0-9]+\.html$/i.test(path.basename(file)))
    .map(routeFromHtml)
    .filter((route) => route !== "/404.html")
    .sort();
  const missingIndexableUrls = indexableHtmlRoutes
    .map((route) => `${siteUrl}${route}`)
    .filter((url) => !sitemap.includes(url));
  if (missingIndexableUrls.length > 0) {
    fail("sitemap.xml is missing indexable HTML URLs", missingIndexableUrls);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      htmlPages: htmlFiles.length,
      seoHtmlPages: seoHtmlFiles.length,
      checkedRoutes: routes.size,
      aiFiles,
      checks: [
        "metadata",
        "canonicals",
        "self canonical route matching",
        "single H1 per indexable page",
        "json-ld",
        "json-ld parse",
        "schema freshness dateModified",
        "schema BreadcrumbList coverage",
        "global SoftwareApplication completeness",
        "global WebSite hasPart coverage",
        "schema type coverage by page family",
        "unique titles",
        "unique descriptions",
        "recommended title lengths",
        "recommended meta description lengths",
        "Open Graph and Twitter PNG image metadata",
        "programmatic page content depth",
        "useful non-empty image alt text",
        "heading hierarchy",
        "orphan HTML routes",
        "broken internal links",
        "broken hash anchors",
        "basePath-prefixed internal links",
        "404 noindex hygiene",
        "section navigation script injection",
        "legacy routes",
        "machine-only files hidden from UI",
        "AI and search crawler robots allowlist",
        "stale placeholder string guard",
        "llms.txt resource references",
        "Open Graph PNG asset",
        "sitemap expected URLs",
        "sitemap coverage for every indexable HTML page",
        ".nojekyll"
      ]
    },
    null,
    2
  )
);
