import type { EditorDocumentV1 } from "../../lib/api";
import type { DocxGenerationWarning } from "./types";

export interface DocxWorkerAsset {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  buffer: ArrayBuffer;
}

export interface DocxWorkerRequest {
  type: "generate";
  document: EditorDocumentV1;
  assets: DocxWorkerAsset[];
  warnings: DocxGenerationWarning[];
}

export type DocxWorkerResponse =
  | { type: "progress"; progress: number }
  | { type: "success"; buffer: ArrayBuffer; warnings: DocxGenerationWarning[] }
  | { type: "failure"; name: string; message: string };
