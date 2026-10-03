import type { CSSProperties } from "react";
import type { PdfObjectV1 } from "../lib/api";
import { normalizePdfHex } from "./pdfEditorModel";

export type PdfInlineEditAction = "commit" | "cancel" | null;

export function pdfInlineEditAction(
  key: string,
  ctrlKey = false,
  metaKey = false,
): PdfInlineEditAction {
  if (key === "Escape") return "cancel";
  if (key === "Enter" && (ctrlKey || metaKey)) return "commit";
  return null;
}

export function pdfInlineTextStyle(
  object: PdfObjectV1,
  zoom: number,
): CSSProperties {
  const fallbackSize = Math.max(6, object.bounds.height * 0.82);
  const fontSize = Math.max(6, object.fontSizePoints ?? fallbackSize) * zoom;
  return {
    color: normalizePdfHex(object.fillColor),
    fontFamily: object.fontFamily ?? "system-ui, sans-serif",
    fontSize: `${fontSize}px`,
    lineHeight: 1.12,
  };
}
