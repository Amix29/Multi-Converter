import type { EditorSystemFontCatalogV1 } from "./contracts";

const PREVIEW_SYSTEM_FAMILIES = [
  "Arial", "Calibri", "Cambria", "Consolas", "Courier New", "Georgia",
  "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
];

export function previewSystemFontCatalog(): EditorSystemFontCatalogV1 {
  return {
    schemaVersion: 1,
    defaultFamily: "Arial",
    families: [...PREVIEW_SYSTEM_FAMILIES],
  };
}
