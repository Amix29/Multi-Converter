<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  
  
  import { t, type LanguageCode } from "../../i18n";
  import { compactFileMeta, hasAvailableTargets } from "../conversion/model";
  import type { FileItem } from "../types";

  function isOcrImage(file: FileItem) {
    const extension = file.extension.toLowerCase().replace(/^\./, "");
    return ["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"].includes(
      extension,
    );
  }
  let props: {
    file: FileItem;
    language: LanguageCode;
    onExtractText(file: FileItem): void;
    onRemove(fileId: string): void;
  } = $props();
  let { file } = $derived(props);
</script>

<article class="file-ticket">
  <header class="file-ticket-header">
    <div class="file-ticket-identity">
      <span class="file-ticket-type" aria-hidden="true">
        {file.extension.replace(/^\./, "").slice(0, 5).toUpperCase() || "FILE"}
      </span> <strong title={file.name}>{file.name}</strong>
    </div>
    <button
      class="remove-file-button"
      type="button"
      aria-label={`${t(props.language, "upload.removeFile")} ${file.name}`}
      onclick={() => props.onRemove(file.id)}
    >
      ×
    </button>
  </header>
  <div class="file-ticket-meta">
    <span>{compactFileMeta(file, props.language)}</span>
    {#if !hasAvailableTargets(file)}<span class="ticket-status is-error"
        >{t(props.language, "upload.unsupported")}</span
      >{/if}
  </div>
  {#if isOcrImage(file)}<footer class="file-ticket-actions">
      <Button
        variant="unstyled"
        size="inherit"
        class="ghost-button file-ticket-ocr"
        type="button"
        onclick={() => props.onExtractText(file)}
      >
        {t(props.language, "ocr.extract")}
      </Button>
    </footer>{/if}
</article>
