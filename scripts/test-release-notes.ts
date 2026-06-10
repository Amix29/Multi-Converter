import assert from "node:assert/strict";
import { releaseNotesForLanguage, translateReleaseNotesForLanguage } from "../src/lib/releaseNotes.ts";

type FetchCall = {
  url: string;
  init: RequestInit;
};

const originalFetch = globalThis.fetch;

function setMockFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init ?? {});
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function testLocalizedBlocksWinWithoutNetwork() {
  const body = `
<!-- mc-release-notes:en -->
# Multi-Converter v1.0.3
English notes.
<!-- /mc-release-notes -->

<!-- mc-release-notes:fr -->
# Multi-Converter v1.0.3
Notes françaises.
<!-- /mc-release-notes -->
`;
  setMockFetch(async () => {
    throw new Error("network should not be used when a localized block exists");
  });

  assert.equal(releaseNotesForLanguage(body, "fr"), "# Multi-Converter v1.0.3\nNotes françaises.");
  assert.equal(await translateReleaseNotesForLanguage(body, "fr"), "# Multi-Converter v1.0.3\nNotes françaises.");
}

async function testOnlineTranslationUsesPostEndpoint() {
  const calls: FetchCall[] = [];
  setMockFetch(async (url, init) => {
    calls.push({ url, init });
    assert.equal(url, "https://translate.googleapis.com/translate_a/single");
    assert.equal(init.method, "POST");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(init.body instanceof URLSearchParams);
    const body = init.body as URLSearchParams;
    assert.equal(body.get("client"), "gtx");
    assert.equal(body.get("sl"), "auto");
    assert.equal(body.get("tl"), "fr");
    assert.equal(body.get("dt"), "t");
    assert.equal(body.get("q"), "# Multi-Converter v1.0.3\n- Better conversions.");
    return jsonResponse([[[ "Multi-Converter v1.0.3\n- Conversions améliorées.", "source", null, null, 10 ]]]);
  });

  const translated = await translateReleaseNotesForLanguage("# Multi-Converter v1.0.3\n- Better conversions.", "fr");

  assert.equal(calls.length, 1);
  assert.equal(translated, "Multi-Converter v1.0.3\n- Conversions améliorées.");
}

async function testOfflineFallbackKeepsOriginalNotes() {
  setMockFetch(async () => {
    throw new TypeError("network unavailable");
  });

  const source = "# Multi-Converter v1.0.3\n- Original release notes.";
  assert.equal(await translateReleaseNotesForLanguage(source, "de"), source);
}

async function testEnglishBlockIsFallbackSourceForTranslation() {
  setMockFetch(async (_url, init) => {
    assert.ok(init.body instanceof URLSearchParams);
    assert.equal((init.body as URLSearchParams).get("q"), "English only.");
    return jsonResponse([[[ "Solo inglés.", "English only.", null, null, 10 ]]]);
  });

  const body = `
Visible wrapper text.
<!-- mc-release-notes:en -->
English only.
<!-- /mc-release-notes -->
`;

  assert.equal(await translateReleaseNotesForLanguage(body, "es"), "Solo inglés.");
}

async function testLongNotesAreChunkedDeterministically() {
  const chunks: string[] = [];
  setMockFetch(async (_url, init) => {
    assert.ok(init.body instanceof URLSearchParams);
    const source = (init.body as URLSearchParams).get("q") ?? "";
    assert.ok(source.length <= 1800 || !source.includes("\n"));
    chunks.push(source);
    return jsonResponse([[[ `translated-${chunks.length}`, source, null, null, 10 ]]]);
  });

  const longBody = Array.from({ length: 120 }, (_, index) => `- Release note line ${index.toString().padStart(3, "0")}`).join("\n");
  const translated = await translateReleaseNotesForLanguage(longBody, "it");

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join("\n"), longBody);
  assert.equal(translated, chunks.map((_chunk, index) => `translated-${index + 1}`).join("\n"));
}

try {
  await testLocalizedBlocksWinWithoutNetwork();
  await testOnlineTranslationUsesPostEndpoint();
  await testOfflineFallbackKeepsOriginalNotes();
  await testEnglishBlockIsFallbackSourceForTranslation();
  await testLongNotesAreChunkedDeterministically();
} finally {
  restoreFetch();
}

console.log("Release notes translation tests passed.");
