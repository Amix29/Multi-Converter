<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";

  
  
  import { t, type LanguageCode } from "../../i18n";
  import { api, type DependencyBootstrap, type OcrRuntimeInfoV1 } from "../../lib/api";

  let props: {
    language: LanguageCode;
    initial: DependencyBootstrap | null;
  } = $props();
  let data = $state.raw<DependencyBootstrap | null>(null);
  const setData: StateSetter<typeof data> = (value) => {
    data = resolveStateUpdate(value, data);
  };
  let ocr = $state.raw<OcrRuntimeInfoV1 | null>(null);
  const setOcr: StateSetter<typeof ocr> = (value) => {
    ocr = resolveStateUpdate(value, ocr);
  };
  let busy = $state.raw(false);
  const setBusy: StateSetter<boolean> = (value) => {
    busy = resolveStateUpdate(value, busy);
  };
  let failed = $state.raw(false);
  const setFailed: StateSetter<boolean> = (value) => {
    failed = resolveStateUpdate(value, failed);
  };
  let diagnostics = $derived(data ?? props.initial);
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const [engines, runtime] = await Promise.allSettled([
      api.refreshEngineDiagnostics(),
      api.getOcrRuntimeInfo(),
    ]);
    if (engines.status === "fulfilled") setData(engines.value);
    if (runtime.status === "fulfilled") setOcr(runtime.value);
    setFailed(engines.status === "rejected" || runtime.status === "rejected");
    setBusy(false);
  }
</script>

<section
  class="update-settings-card engine-diagnostics"
  aria-labelledby="engine-diagnostics-title"
  aria-busy={busy}
>
  <strong id="engine-diagnostics-title"
    >{t(props.language, "diagnostics.title")}</strong
  >
  <p>{t(props.language, "diagnostics.help")}</p>
  <dl>
    {#each diagnostics?.checks as check (check.id)}<div>
        <dt>{check.label}</dt>
        <dd>
          {t(
            props.language,
            check.available ? "diagnostics.ready" : "diagnostics.unavailable",
          )}
          {check.available && check.detectedVersion
            ? ` · ${check.detectedVersion}`
            : ""}
        </dd>
      </div>{/each}
    {#if ocr}<div>
        <dt>OCR · {ocr.model}</dt>
        <dd>
          {t(
            props.language,
            ocr.available ? "diagnostics.ready" : "diagnostics.unavailable",
          )}
        </dd>
      </div>{/if}
  </dl>
  {#if failed}<p role="alert">{t(props.language, "diagnostics.failed")}</p>{/if}
  <Button
    variant="unstyled"
    size="inherit"
    class="secondary-button"
    type="button"
    disabled={busy}
    onclick={() => void refresh()}
  >
    {t(props.language, busy ? "diagnostics.checking" : "diagnostics.refresh")}
  </Button>
</section>
