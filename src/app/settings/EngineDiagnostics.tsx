import { useState } from "react";
import { t, type LanguageCode } from "../../i18n";
import { api, type DependencyBootstrap, type OcrRuntimeInfoV1 } from "../../lib/api";

export function EngineDiagnostics(props: { language: LanguageCode; initial: DependencyBootstrap | null }) {
  const [data, setData] = useState<DependencyBootstrap | null>(null);
  const [ocr, setOcr] = useState<OcrRuntimeInfoV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const diagnostics = data ?? props.initial;
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const [engines, runtime] = await Promise.allSettled([
      api.refreshEngineDiagnostics(), api.getOcrRuntimeInfo(),
    ]);
    if (engines.status === "fulfilled") setData(engines.value);
    if (runtime.status === "fulfilled") setOcr(runtime.value);
    setFailed(engines.status === "rejected" || runtime.status === "rejected");
    setBusy(false);
  }
  return (
    <section className="update-settings-card engine-diagnostics" aria-labelledby="engine-diagnostics-title" aria-busy={busy}>
      <strong id="engine-diagnostics-title">{t(props.language, "diagnostics.title")}</strong>
      <p>{t(props.language, "diagnostics.help")}</p>
      <dl>
        {diagnostics?.checks.map((check) => (
          <div key={check.id}>
            <dt>{check.label}</dt>
            <dd>{t(props.language, check.available ? "diagnostics.ready" : "diagnostics.unavailable")}
              {check.available && check.detectedVersion ? ` · ${check.detectedVersion}` : ""}
            </dd>
          </div>
        ))}
        {ocr && <div><dt>OCR · {ocr.model}</dt><dd>{t(props.language, ocr.available ? "diagnostics.ready" : "diagnostics.unavailable")}</dd></div>}
      </dl>
      {failed && <p role="alert">{t(props.language, "diagnostics.failed")}</p>}
      <button className="secondary-button" type="button" disabled={busy} onClick={() => void refresh()}>
        {t(props.language, busy ? "diagnostics.checking" : "diagnostics.refresh")}
      </button>
    </section>
  );
}
