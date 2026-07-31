import type { MultiConverterApi } from "./api/contracts";
import { createPreviewApi } from "./api/previewAdapter";
import { createTauriApi } from "./api/tauriAdapter";

export * from "./api/contracts";

const isTauri = "__TAURI_INTERNALS__" in window;
const isPreview = import.meta.env.MODE === "preview" || (import.meta.env.DEV && !isTauri);

export const api: MultiConverterApi = isPreview ? createPreviewApi() : createTauriApi();
