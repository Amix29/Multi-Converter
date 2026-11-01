import { describe, expect, test } from "vitest";
import { marked } from "marked";
import {
  markdownNodes,
  fallbackMarkdownTokens,
  type MarkdownNode,
} from "../../src/lib/releaseMarkdown";
import { resolveStateUpdate } from "../../src/lib/stateUpdate";
function flatten(nodes: MarkdownNode[]): MarkdownNode[] {
  return nodes.flatMap((node) =>
    node.kind === "element" ? [node, ...flatten(node.children)] : [node],
  );
}
function renderTree(source: string) {
  return flatten(markdownNodes(marked.lexer(source)));
}
describe("safe release-note tree", () => {
  test("escapes HTML and rejects executable URLs without adding remote images", () => {
    const nodes = renderTree(
      "<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![remote](https://example.com/a.png) [safe](https://github.com/Amix29/Multi-Converter)",
    );
    const elements = nodes.filter((node) => node.kind === "element");
    expect(
      elements.some(
        (node) => String(node.tag) === "script" || String(node.tag) === "img",
      ),
    ).toBe(false);
    expect(
      elements.filter((node) => node.tag === "a").map((node) => node.href),
    ).toEqual([
      "https://example.com/a.png",
      "https://github.com/Amix29/Multi-Converter",
    ]);
    expect(nodes).toContainEqual({
      kind: "text",
      text: "<script>alert(1)</script>",
    });
  });
  test("retains tables, task lists, code, accents and safe relative links", () => {
    const nodes = renderTree(
      "## Améliorations\n\n- [x] Éléments\n\n| A | B |\n| - | - |\n| é | è |\n\n```js\n<é>\n```\n\n[issue](issues/42)",
    );
    expect(nodes).toContainEqual({ kind: "checkbox", checked: true });
    expect(
      nodes.filter((node) => node.kind === "element").map((node) => node.tag),
    ).toEqual(
      expect.arrayContaining(["h3", "ul", "table", "pre", "code", "a"]),
    );
    expect(nodes).toContainEqual({ kind: "text", text: "<é>" });
    expect(
      nodes.some(
        (node) =>
          node.kind === "element" &&
          node.href === "https://github.com/Amix29/Multi-Converter/issues/42",
      ),
    ).toBe(true);
  });
  test("hides the duplicate product title and keeps a safe fallback", () => {
    expect(
      renderTree(
        "# Multi-Converter v1.0.7\n\n<!-- mc-release-notes:en -->\n\n## Highlights",
      )
        .filter((node) => node.kind === "element")
        .map((node) => node.tag),
    ).toEqual(["h3"]);
    expect(
      flatten(
        markdownNodes(fallbackMarkdownTokens("<img src=x onerror=alert(1)>")),
      ),
    ).toContainEqual({ kind: "text", text: "<img src=x onerror=alert(1)>" });
  });
});
test("functional state updates evaluate against the latest immutable state", () => {
  const original = new Set(["first"]);
  const next = resolveStateUpdate(
    (current) => new Set([...current, "second"]),
    original,
  );
  expect([...original]).toEqual(["first"]);
  expect([...next]).toEqual(["first", "second"]);
  expect(resolveStateUpdate(true, false)).toBe(true);
});
