import { useEffect, useState, type ReactNode } from "react";
import type { Token, Tokens } from "marked";
import { safeMarkdownClassName, safeReleaseNoteHref } from "../lib/markdownSafety";

const markdownOptions = {
  async: false,
  breaks: false,
  gfm: true,
  pedantic: false,
  silent: true,
} as const;

export function ReleaseNotesMarkdown({ body }: { body: string }) {
  const [tokens, setTokens] = useState<readonly Token[]>(() => fallbackMarkdownTokens(body));

  useEffect(() => {
    let disposed = false;
    setTokens(fallbackMarkdownTokens(body));
    import("marked")
      .then(({ marked }) => {
        if (!disposed) setTokens(marked.lexer(body, markdownOptions));
      })
      .catch(() => {
        if (!disposed) setTokens(fallbackMarkdownTokens(body));
      });
    return () => {
      disposed = true;
    };
  }, [body]);

  return <div className="release-note-content">{renderBlockTokens(tokens, "release")}</div>;
}

function fallbackMarkdownTokens(body: string): Token[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map(
      (text) =>
        ({
          type: "paragraph",
          raw: text,
          text,
          tokens: [{ type: "text", raw: text, text }],
        }) satisfies Tokens.Paragraph,
    );
}

function renderBlockTokens(tokens: readonly Token[], keyPrefix: string): ReactNode[] {
  return tokens.flatMap((token, index) => renderBlockToken(token, `${keyPrefix}-${index}`));
}

function renderBlockToken(token: Token, key: string): ReactNode[] {
  switch (token.type) {
    case "space":
    case "def":
      return [];
    case "code":
      return [renderCodeBlock(token as Tokens.Code, key)];
    case "blockquote":
      return [<blockquote key={key}>{renderBlockTokens((token as Tokens.Blockquote).tokens, key)}</blockquote>];
    case "html":
      return renderHtmlToken(token as Tokens.HTML | Tokens.Tag, key);
    case "heading":
      return renderHeading(token as Tokens.Heading, key);
    case "hr":
      return [<hr key={key} />];
    case "list":
      return [renderList(token as Tokens.List, key)];
    case "paragraph":
      return [<p key={key}>{renderInlineTokens((token as Tokens.Paragraph).tokens, key)}</p>];
    case "table":
      return [renderTable(token as Tokens.Table, key)];
    case "text":
      return renderTextBlock(token as Tokens.Text, key);
    default:
      return renderUnknownToken(token, key);
  }
}

function renderHeading(token: Tokens.Heading, key: string) {
  if (token.depth === 1 && /^multi-converter\s+v?\d+\.\d+\.\d+/i.test(token.text)) return [];
  return token.depth <= 2 ? [<h3 key={key}>{renderInlineTokens(token.tokens, key)}</h3>] : [<h4 key={key}>{renderInlineTokens(token.tokens, key)}</h4>];
}

function renderTextBlock(token: Tokens.Text, key: string) {
  if (token.tokens) return [<p key={key}>{renderInlineTokens(token.tokens, key)}</p>];
  return [<p key={key}>{token.text}</p>];
}

function renderCodeBlock(token: Tokens.Code, key: string) {
  return (
    <pre key={key}>
      <code className={token.lang ? `language-${safeMarkdownClassName(token.lang)}` : undefined}>{token.text}</code>
    </pre>
  );
}

function renderHtmlToken(token: Tokens.HTML | Tokens.Tag, key: string) {
  const text = token.text.trim();
  if (!text || /^<!--[\s\S]*-->$/.test(text)) return [];
  return [<p key={key}>{text}</p>];
}

function renderList(token: Tokens.List, key: string) {
  const items = token.items.map((item, index) => (
    <li key={`${key}-${index}`}>
      {item.task && <input type="checkbox" checked={Boolean(item.checked)} readOnly aria-label="" />}
      {renderListItemContent(item, `${key}-${index}`)}
    </li>
  ));

  return token.ordered ? (
    <ol key={key} start={typeof token.start === "number" ? token.start : undefined}>
      {items}
    </ol>
  ) : (
    <ul key={key}>{items}</ul>
  );
}

function renderListItemContent(item: Tokens.ListItem, key: string) {
  const tokens = item.task ? item.tokens.filter((child) => child.type !== "checkbox") : item.tokens;
  if (!item.loose && tokens.length === 1 && tokens[0]?.type === "text") {
    const token = tokens[0];
    return token.tokens ? renderInlineTokens(token.tokens, key) : token.text;
  }
  return renderBlockTokens(tokens, key);
}

function renderTable(token: Tokens.Table, key: string) {
  return (
    <div key={key} className="release-note-table-wrap">
      <table>
        <thead>
          <tr>
            {token.header.map((cell, index) => (
              <th key={`${key}-head-${index}`} style={tableCellStyle(cell.align ?? token.align[index])}>
                {renderInlineTokens(cell.tokens, `${key}-head-${index}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {token.rows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${key}-row-${rowIndex}-${cellIndex}`} style={tableCellStyle(cell.align ?? token.align[cellIndex])}>
                  {renderInlineTokens(cell.tokens, `${key}-row-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tableCellStyle(align: "left" | "center" | "right" | null | undefined) {
  return align ? { textAlign: align } : undefined;
}

function renderInlineTokens(tokens: readonly Token[], keyPrefix: string): ReactNode[] {
  return tokens.flatMap((token, index) => renderInlineToken(token, `${keyPrefix}-inline-${index}`));
}

function renderInlineToken(token: Token, key: string): ReactNode[] {
  switch (token.type) {
    case "escape":
    case "text":
      return renderTextInline(token as Tokens.Text | Tokens.Escape, key);
    case "strong":
      return [<strong key={key}>{renderInlineTokens((token as Tokens.Strong).tokens, key)}</strong>];
    case "em":
      return [<em key={key}>{renderInlineTokens((token as Tokens.Em).tokens, key)}</em>];
    case "codespan":
      return [<code key={key}>{(token as Tokens.Codespan).text}</code>];
    case "br":
      return [<br key={key} />];
    case "del":
      return [<del key={key}>{renderInlineTokens((token as Tokens.Del).tokens, key)}</del>];
    case "link":
      return [renderLink(token as Tokens.Link, key)];
    case "image":
      return [renderImageLink(token as Tokens.Image, key)];
    case "checkbox":
      return [<input key={key} type="checkbox" checked={(token as Tokens.Checkbox).checked} readOnly aria-label="" />];
    case "html":
      return renderHtmlToken(token as Tokens.HTML | Tokens.Tag, key);
    default:
      return renderUnknownToken(token, key);
  }
}

function renderTextInline(token: Tokens.Text | Tokens.Escape, key: string): ReactNode[] {
  const maybeNested = token as Tokens.Text;
  return maybeNested.tokens ? renderInlineTokens(maybeNested.tokens, key) : [token.text];
}

function renderLink(token: Tokens.Link, key: string) {
  const safeHref = safeReleaseNoteHref(token.href);
  if (!safeHref) return token.text;
  return (
    <a key={key} href={safeHref} title={token.title ?? undefined} target="_blank" rel="noreferrer">
      {renderInlineTokens(token.tokens, key)}
    </a>
  );
}

function renderImageLink(token: Tokens.Image, key: string) {
  const safeHref = safeReleaseNoteHref(token.href);
  const label = token.text || token.href;
  if (!safeHref) return label;
  return (
    <a key={key} href={safeHref} title={token.title ?? undefined} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function renderUnknownToken(token: Token, key: string): ReactNode[] {
  if ("tokens" in token && Array.isArray(token.tokens)) return renderInlineTokens(token.tokens, key);
  if ("text" in token && typeof token.text === "string") return [token.text];
  return [];
}
