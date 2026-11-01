import type { Token, Tokens } from "marked";
import { safeMarkdownClassName, safeReleaseNoteHref } from "./markdownSafety";

export type MarkdownTag =
  | "p"
  | "h3"
  | "h4"
  | "blockquote"
  | "pre"
  | "code"
  | "ol"
  | "ul"
  | "li"
  | "strong"
  | "em"
  | "del"
  | "a"
  | "div"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td";
export type MarkdownNode =
  | { kind: "text"; text: string }
  | { kind: "break" | "rule" }
  | { kind: "checkbox"; checked: boolean }
  | {
      kind: "element";
      tag: MarkdownTag;
      children: MarkdownNode[];
      href?: string;
      title?: string;
      className?: string;
      align?: "left" | "center" | "right";
      start?: number;
    };
const text = (value: string): MarkdownNode => ({ kind: "text", text: value });
const element = (
  tag: MarkdownTag,
  children: MarkdownNode[],
  extra: Partial<Extract<MarkdownNode, { kind: "element" }>> = {},
): MarkdownNode => ({ kind: "element", tag, children, ...extra });
export function fallbackMarkdownTokens(body: string): Token[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({
      type: "paragraph",
      raw: value,
      text: value,
      tokens: [{ type: "text", raw: value, text: value }],
    }));
}
export function markdownNodes(
  tokens: readonly Token[],
  inline = false,
): MarkdownNode[] {
  return tokens.flatMap((token) => nodeForToken(token, inline));
}
function linkNode(token: Tokens.Link | Tokens.Image): MarkdownNode {
  const href = safeReleaseNoteHref(token.href);
  const children =
    token.type === "link"
      ? markdownNodes((token as Tokens.Link).tokens, true)
      : [text(token.text || token.href)];
  return href
    ? element("a", children, { href, title: token.title ?? undefined })
    : text(token.text || token.href);
}
function listNode(token: Tokens.List): MarkdownNode {
  const items = token.items.map((item) => {
    const children: MarkdownNode[] = [];
    if (item.task)
      children.push({ kind: "checkbox", checked: Boolean(item.checked) });
    const parts = item.tokens.filter((part) => part.type !== "checkbox");
    children.push(...markdownNodes(parts, !item.loose));
    return element("li", children);
  });
  return element(token.ordered ? "ol" : "ul", items, {
    start: typeof token.start === "number" ? token.start : undefined,
  });
}
function tableNode(token: Tokens.Table): MarkdownNode {
  const cell = (value: Tokens.TableCell, index: number, header: boolean) =>
    element(header ? "th" : "td", markdownNodes(value.tokens, true), {
      align: value.align ?? token.align[index] ?? undefined,
    });
  return element(
    "div",
    [
      element("table", [
        element("thead", [
          element(
            "tr",
            token.header.map((value, index) => cell(value, index, true)),
          ),
        ]),
        element(
          "tbody",
          token.rows.map((row) =>
            element(
              "tr",
              row.map((value, index) => cell(value, index, false)),
            ),
          ),
        ),
      ]),
    ],
    { className: "release-note-table-wrap" },
  );
}
function nodeForToken(token: Token, inline: boolean): MarkdownNode[] {
  switch (token.type) {
    case "space":
    case "def":
      return [];
    case "br":
      return [{ kind: "break" }];
    case "hr":
      return [{ kind: "rule" }];
    case "code": {
      const value = token as Tokens.Code;
      return [
        element("pre", [
          element("code", [text(value.text)], {
            className: value.lang
              ? `language-${safeMarkdownClassName(value.lang)}`
              : undefined,
          }),
        ]),
      ];
    }
    case "codespan":
      return [element("code", [text((token as Tokens.Codespan).text)])];
    case "blockquote":
      return [
        element(
          "blockquote",
          markdownNodes((token as Tokens.Blockquote).tokens),
        ),
      ];
    case "heading": {
      const value = token as Tokens.Heading;
      if (
        value.depth === 1 &&
        /^multi-converter\s+v?\d+\.\d+\.\d+/i.test(value.text)
      )
        return [];
      return [
        element(
          value.depth <= 2 ? "h3" : "h4",
          markdownNodes(value.tokens, true),
        ),
      ];
    }
    case "paragraph":
      return [
        element("p", markdownNodes((token as Tokens.Paragraph).tokens, true)),
      ];
    case "list":
      return [listNode(token as Tokens.List)];
    case "table":
      return [tableNode(token as Tokens.Table)];
    case "strong":
      return [
        element("strong", markdownNodes((token as Tokens.Strong).tokens, true)),
      ];
    case "em":
      return [element("em", markdownNodes((token as Tokens.Em).tokens, true))];
    case "del":
      return [
        element("del", markdownNodes((token as Tokens.Del).tokens, true)),
      ];
    case "link":
    case "image":
      return [linkNode(token as Tokens.Link | Tokens.Image)];
    case "checkbox":
      return [
        { kind: "checkbox", checked: (token as Tokens.Checkbox).checked },
      ];
    case "html": {
      const value = (token as Tokens.HTML).text.trim();
      return !value || /^<!--[\s\S]*-->$/.test(value)
        ? []
        : [inline ? text(value) : element("p", [text(value)])];
    }
    case "escape":
      return [text((token as Tokens.Escape).text)];
    case "text": {
      const value = token as Tokens.Text;
      const children = value.tokens
        ? markdownNodes(value.tokens, true)
        : [text(value.text)];
      return inline ? children : [element("p", children)];
    }
    default: {
      if ("tokens" in token && Array.isArray(token.tokens))
        return markdownNodes(token.tokens as Token[], true);
      return "text" in token && typeof token.text === "string"
        ? [text(token.text)]
        : [];
    }
  }
}
