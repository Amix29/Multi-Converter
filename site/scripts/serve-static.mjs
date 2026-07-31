import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] || "out");
const host = process.argv[3] || "127.0.0.1";
const port = Number(process.argv[4] || 4173);
const basePath = (process.argv[5] || "").replace(/\/$/, "");
const normalizedBasePath = normalizeBasePath(basePath);

const types = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"]
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return path.join(root, normalized);
}

function normalizeBasePath(value) {
  return value.toLowerCase().replaceAll("-", "");
}

function stripBasePath(requestPath) {
  if (!normalizedBasePath) {
    return requestPath;
  }

  const firstSegment = requestPath.match(/^\/[^/]*/)?.[0] || "";
  if (normalizeBasePath(firstSegment) !== normalizedBasePath) {
    return requestPath;
  }

  return requestPath.slice(firstSegment.length) || "/";
}

async function fileForRequest(requestUrl) {
  const requestPath = new URL(requestUrl, `http://${host}:${port}`).pathname;
  const pathWithoutBase = stripBasePath(requestPath);
  const requested = safePath(pathWithoutBase);
  const stat = await fs.stat(requested).catch(() => null);

  if (stat?.isDirectory()) {
    return path.join(requested, "index.html");
  }

  if (stat?.isFile()) {
    return requested;
  }

  if (!path.extname(requested)) {
    return path.join(requested, "index.html");
  }

  return requested;
}

const server = http.createServer(async (request, response) => {
  try {
    const filePath = await fileForRequest(request.url || "/");
    const relative = path.relative(root, filePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await fs.readFile(filePath);
    const contentType = types.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType
    });
    response.end(body);
  } catch {
    const fallback = path.join(root, "404.html");
    const body = await fs.readFile(fallback).catch(() => Buffer.from("Not found"));
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8"
    });
    response.end(body);
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}${basePath || ""}`);
});
