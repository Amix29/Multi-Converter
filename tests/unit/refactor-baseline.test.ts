import { describe, expect, it } from "vitest";

import {
  SOURCE_SELECTION,
  classifySourcePath,
  countTextLines,
  normalizeRepositoryPath,
  summarizeDistEntries,
  summarizeGateStatus,
  summarizeSizedFiles,
  summarizeSourceEntries,
} from "../../scripts/lib/refactor-baseline.mjs";

describe("refactor baseline source selection", () => {
  it.each([
    ["src/main.tsx", "frontend"],
    ["src\\styles.css", "frontend"],
    ["src-tauri/src/lib.rs", "rust"],
    ["scripts/measure-refactor-baseline.mjs", "automation"],
    ["tests/unit/example.test.ts", "tests"],
    [".github/workflows/build.yml", "configuration"],
    ["src-tauri/tauri.conf.json", "configuration"],
    ["tsconfig.tests.json", "configuration"],
  ])("classifies %s as %s", (relativePath, expectedGroup) => {
    expect(classifySourcePath(relativePath)).toBe(expectedGroup);
  });

  it.each([
    "site/src/page.tsx",
    "node_modules/package/index.js",
    "src-tauri/target/release/build.rs",
    "src-tauri/bundled-engines/tool.js",
    "tools/pdfium-render-wrapper/src/main.rs",
    "docs/example.ts",
    "package-lock.json",
    "src-tauri/Cargo.lock",
    "../src/main.tsx",
    "C:\\repo\\src\\main.tsx",
  ])("rejects excluded or unsafe path %s", (relativePath) => {
    expect(classifySourcePath(relativePath)).toBeNull();
  });

  it("publishes the strict exclusion policy in the report metadata", () => {
    expect(SOURCE_SELECTION.excludedTrees).toEqual(
      expect.arrayContaining([".git/", "node_modules/", "site/", "src-tauri/target/", "target/"]),
    );
    expect(SOURCE_SELECTION.excludedGeneratedFiles).toEqual(
      expect.arrayContaining(["package-lock.json", "src-tauri/Cargo.lock"]),
    );
  });

  it("normalizes Windows separators and a leading current-directory segment", () => {
    expect(normalizeRepositoryPath(".\\src\\lib\\api.ts")).toBe("src/lib/api.ts");
  });
});

describe("refactor baseline aggregations", () => {
  it("counts LF, CRLF and non-blank lines without inventing a trailing line", () => {
    expect(countTextLines("first\r\n\r\nthird\r\n")).toEqual({ lines: 3, nonBlankLines: 2 });
    expect(countTextLines("")).toEqual({ lines: 0, nonBlankLines: 0 });
  });

  it("aggregates source totals and keeps the groups separate", () => {
    const summary = summarizeSourceEntries([
      { group: "frontend", bytes: 12, lines: 3, nonBlankLines: 2 },
      { group: "frontend", bytes: 8, lines: 2, nonBlankLines: 2 },
      { group: "rust", bytes: 30, lines: 5, nonBlankLines: 4 },
    ]);

    expect(summary.groups.frontend).toEqual({ fileCount: 2, bytes: 20, lines: 5, nonBlankLines: 4 });
    expect(summary.groups.rust).toEqual({ fileCount: 1, bytes: 30, lines: 5, nonBlankLines: 4 });
    expect(summary.totals).toEqual({ fileCount: 3, bytes: 50, lines: 10, nonBlankLines: 8 });
  });

  it("aggregates directory and compressed frontend sizes", () => {
    expect(summarizeSizedFiles([{ bytes: 10 }, { bytes: 15 }])).toEqual({
      exists: true,
      fileCount: 2,
      bytes: 25,
    });
    expect(
      summarizeDistEntries([
        { path: "assets\\main.js", rawBytes: 20, gzipBytes: 8 },
        { path: "index.html", rawBytes: 30, gzipBytes: 12 },
      ]),
    ).toEqual({
      exists: true,
      fileCount: 2,
      rawBytes: 50,
      gzipBytes: 20,
      files: [
        { path: "assets/main.js", rawBytes: 20, gzipBytes: 8 },
        { path: "index.html", rawBytes: 30, gzipBytes: 12 },
      ],
    });
  });

  it("normalizes a gate status and calculates its elapsed time", () => {
    expect(
      summarizeGateStatus({
        command: "test:windows:ci",
        state: "passed",
        startedAt: "2026-07-31T10:00:00.000Z",
        updatedAt: "2026-07-31T10:00:02.500Z",
        steps: [
          { index: 1, command: "npm audit", status: "passed", durationMs: 1000 },
          { index: 2, command: "npm run check", status: "passed", durationMs: 1500 },
        ],
      }),
    ).toMatchObject({
      command: "test:windows:ci",
      state: "passed",
      elapsedMs: 2500,
      stepSummary: { total: 2, byStatus: { passed: 2 }, totalDurationMs: 2500 },
    });
  });

  it("rejects a gate status that is not a JSON object", () => {
    expect(() => summarizeGateStatus([])).toThrow("Gate status must be a JSON object.");
  });
});
