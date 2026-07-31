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
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
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
        default: null,
        parseHTML: (element) => element.getAttribute("width") || element.style.width || null,
        renderHTML: (attributes) => (attributes.width ? { style: `width: ${String(attributes.width).replace(/[^0-9.%a-z-]/gi, "")}` } : {}),
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") || "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align || "center" }),
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
