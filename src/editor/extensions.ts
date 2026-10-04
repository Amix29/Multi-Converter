import { Extension, Node, mergeAttributes } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DocumentImageView } from "./DocumentImageView";

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-page-break]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, {
      "data-page-break": "true",
      class: "manual-page-break",
      role: "separator",
      "aria-label": "Saut de page",
    }),
  ],
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).createParagraphNear().run(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

interface DocumentImageOptions extends ImageOptions {
  documentId: string;
}

export const DocumentImage = Image.extend<DocumentImageOptions>({
  addOptions() {
    const parent = this.parent?.();
    return {
      inline: parent?.inline ?? false,
      allowBase64: false,
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      resize: parent?.resize ?? false,
      documentId: "",
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-asset-id"),
        renderHTML: (attributes) => (attributes.assetId ? { "data-asset-id": attributes.assetId } : {}),
      },
      width: {
        default: "15cm",
        parseHTML: (element) => element.getAttribute("width") || element.style.width || null,
        renderHTML: (attributes) => (attributes.width ? { style: `width: ${String(attributes.width).replace(/[^0-9.%a-z-]/gi, "")}` } : {}),
      },
      height: {
        default: "auto",
        parseHTML: (element) => element.getAttribute("height") || element.style.height || "auto",
        renderHTML: (attributes) => attributes.height && attributes.height !== "auto"
          ? { style: `height: ${String(attributes.height).replace(/[^0-9.%a-z-]/gi, "")}` }
          : {},
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") || "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align || "center" }),
      },
      layoutMode: {
        default: "flow",
        parseHTML: (element) => element.getAttribute("data-layout-mode") || "flow",
        renderHTML: (attributes) => ({ "data-layout-mode": attributes.layoutMode === "floating" ? "floating" : "flow" }),
      },
      offsetXmm: {
        default: 0,
        parseHTML: (element) => finiteNumber(element.getAttribute("data-offset-x-mm")),
        renderHTML: (attributes) => ({ "data-offset-x-mm": boundedNumber(attributes.offsetXmm, -100_000, 100_000) }),
      },
      offsetYmm: {
        default: 0,
        parseHTML: (element) => finiteNumber(element.getAttribute("data-offset-y-mm")),
        renderHTML: (attributes) => ({ "data-offset-y-mm": boundedNumber(attributes.offsetYmm, -100_000, 100_000) }),
      },
      zIndex: {
        default: 0,
        parseHTML: (element) => finiteNumber(element.getAttribute("data-z-index")),
        renderHTML: (attributes) => ({ "data-z-index": Math.round(boundedNumber(attributes.zIndex, -100_000, 100_000)) }),
      },
      wrapMode: {
        default: "none",
        parseHTML: (element) => element.getAttribute("data-wrap-mode") || "none",
        renderHTML: (attributes) => ({ "data-wrap-mode": attributes.wrapMode === "parallel" ? "parallel" : "none" }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocumentImageView);
  },
}).configure({
  allowBase64: false,
  inline: false,
});

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value)));
}

export const UnsupportedObject = Node.create({
  name: "unsupportedObject",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { label: { default: "Objet incorporé non éditable" } };
  },
  parseHTML: () => [{ tag: "aside[data-unsupported-object]" }],
  renderHTML: ({ node }) => [
    "aside",
    {
      "data-unsupported-object": "true",
      class: "unsupported-document-object",
      contenteditable: "false",
    },
    String(node.attrs.label || "Objet incorporé non éditable"),
  ],
});

export const DocumentLayout = Extension.create({
  name: "documentLayout",
  addStorage() {
    return {
      pageFormat: "a4",
      orientation: "portrait",
      zoom: 1,
    };
  },
});
