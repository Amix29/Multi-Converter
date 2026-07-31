import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a",
  "aside",
  "blockquote",
  "br",
  "code",
  "col",
  "colgroup",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strike",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTRIBUTES = [
  "alt",
  "colspan",
  "colwidth",
  "data-align",
  "data-asset-id",
  "data-page-break",
  "data-unsupported-object",
  "height",
  "href",
  "rel",
  "rowspan",
  "src",
  "start",
  "style",
  "target",
  "title",
  "width",
];

// DOMPurify applies ALLOWED_URI_REGEXP to attributes outside its internal
// URI-safe set. These attributes never carry a URL in the editor contract and
// are validated or normalized again below; href, src and style stay excluded.
const NON_URI_ATTRIBUTES = ALLOWED_ATTRIBUTES.filter(
  (attribute) => !["href", "src", "style"].includes(attribute),
);

const SAFE_LINK = /^(?:https?:|mailto:|#)/i;
const SAFE_URI = /^(?:(?:https?|mailto):|#|data:image\/(?:png|jpeg|webp|gif);base64,|mc-asset:\/\/)/i;
const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i;
const ASSET_SOURCE = /^mc-asset:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const SAFE_STYLE_PROPERTIES = new Set([
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-align",
  "text-decoration",
  "width",
]);
const SAFE_STYLE_VALUE = /^[#(),.%\-\w\s"']{1,160}$/;
const ACTIVE_CSS = /(?:expression|url|var|behavior|-moz-binding|@import)/i;
const MAX_TABLE_SPAN = 100;
const MAX_TABLE_COLUMN_WIDTH = 4096;

interface HtmlSanitizationOptions {
  allowedAssetIds?: ReadonlySet<string>;
  allowDataImages?: boolean;
}

export function sanitizeImportedHtml(html: string, options: HtmlSanitizationOptions = {}): string {
  const sanitized = String(DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    ADD_URI_SAFE_ATTR: NON_URI_ATTRIBUTES,
    ALLOWED_URI_REGEXP: SAFE_URI,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_CONTENTS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "svg", "math"],
    RETURN_TRUSTED_TYPE: false,
  }));
  const parsed = new DOMParser().parseFromString(sanitized, "text/html");

  parsed.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "formaction" || name === "xlink:href") {
        element.removeAttribute(attribute.name);
      }
    }
    sanitizeInlineStyle(element);
  });

  parsed.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href")?.trim() ?? "";
    if (!SAFE_LINK.test(href)) {
      link.removeAttribute("href");
      link.removeAttribute("rel");
      link.removeAttribute("target");
      return;
    }
    const target = link.getAttribute("target");
    if (target !== "_blank" && target !== "_self") link.removeAttribute("target");
    if (target === "_blank") link.setAttribute("rel", "noopener noreferrer");
    else link.removeAttribute("rel");
  });

  parsed.querySelectorAll("div").forEach((element) => {
    if (element.getAttribute("data-page-break") === "true") {
      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
      element.setAttribute("data-page-break", "true");
    } else {
      element.replaceWith(...Array.from(element.childNodes));
    }
  });

  parsed.querySelectorAll("aside").forEach((element) => {
    if (element.getAttribute("data-unsupported-object") === "true") {
      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
      element.setAttribute("data-unsupported-object", "true");
    } else {
      element.replaceWith(...Array.from(element.childNodes));
    }
  });

  sanitizeTableAttributes(parsed);

  parsed.querySelectorAll("img").forEach((image) => {
    const source = image.getAttribute("src")?.trim() ?? "";
    const asset = ASSET_SOURCE.exec(source);
    const assetId = image.getAttribute("data-asset-id")?.trim() ?? "";
    const assetIsKnown = !options.allowedAssetIds || options.allowedAssetIds.has(assetId);
    if (asset && asset[1] === assetId && assetIsKnown) {
      normalizeImageAttributes(image);
      return;
    }
    if (options.allowDataImages && isBoundedDataImage(source)) {
      image.removeAttribute("data-asset-id");
      normalizeImageAttributes(image);
      return;
    }
    image.replaceWith(parsed.createTextNode("[Image distante ou inaccessible supprimée]"));
  });

  return parsed.body.innerHTML;
}

function sanitizeTableAttributes(parsed: Document) {
  parsed.querySelectorAll("td, th").forEach((cell) => {
    const colspan = normalizeBoundedIntegerAttribute(cell, "colspan", MAX_TABLE_SPAN) ?? 1;
    normalizeBoundedIntegerAttribute(cell, "rowspan", MAX_TABLE_SPAN);

    const rawWidths = cell.getAttribute("colwidth");
    if (!rawWidths) return;
    const widths = rawWidths.split(",").map((value) => boundedPositiveInteger(value, MAX_TABLE_COLUMN_WIDTH));
    if (widths.length !== colspan || widths.some((value) => value === null)) {
      cell.removeAttribute("colwidth");
      return;
    }
    cell.setAttribute("colwidth", widths.join(","));
  });

  parsed.querySelectorAll("col[width]").forEach((column) => {
    normalizeBoundedIntegerAttribute(column, "width", MAX_TABLE_COLUMN_WIDTH);
  });
}

function normalizeBoundedIntegerAttribute(element: Element, attribute: string, maximum: number): number | null {
  const source = element.getAttribute(attribute);
  if (source === null) return null;
  const normalized = boundedPositiveInteger(source, maximum);
  if (normalized === null) element.removeAttribute(attribute);
  else element.setAttribute(attribute, String(normalized));
  return normalized;
}

function boundedPositiveInteger(source: string, maximum: number): number | null {
  const trimmed = source.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value <= maximum ? value : null;
}

function isBoundedDataImage(source: string): boolean {
  const match = DATA_IMAGE.exec(source);
  if (!match) return false;
  const encoded = match[2].replace(/\s/g, "");
  return encoded.length <= 32 * 1024 * 1024 && encoded.length % 4 === 0;
}

function normalizeImageAttributes(image: HTMLImageElement) {
  const align = image.getAttribute("data-align");
  if (align && !["left", "center", "right"].includes(align)) image.removeAttribute("data-align");
  for (const attribute of ["width", "height"] as const) {
    const value = image.getAttribute(attribute);
    if (value && !/^(?:auto|\d{1,4}(?:\.\d+)?(?:px|pt|cm|mm|in|%|em|rem)?)$/i.test(value.trim())) {
      image.removeAttribute(attribute);
    }
  }
}

function sanitizeInlineStyle(element: Element) {
  const source = element.getAttribute("style");
  if (!source) return;
  const declarations: string[] = [];
  for (const declaration of source.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!SAFE_STYLE_PROPERTIES.has(property) || !SAFE_STYLE_VALUE.test(value) || ACTIVE_CSS.test(value)) continue;
    if (property === "width" && element.tagName !== "IMG") continue;
    declarations.push(`${property}: ${value}`);
  }
  if (declarations.length) element.setAttribute("style", declarations.join("; "));
  else element.removeAttribute("style");
}
