import { t, type LanguageCode } from "../../i18n";

export function RecoveryBanner(props: { language: LanguageCode; count: number; isBusy: boolean; onRestore(): void; onForget(): void }) {
  return (
    <section className="recovery-banner" aria-labelledby="recovery-title">
      <h3 id="recovery-title">{t(props.language, "recovery.title", { count: props.count })}</h3>
      <p>{t(props.language, "recovery.restoreDetail")}</p>
      <div className="screen-actions">
        <button className="secondary-button" type="button" disabled={props.isBusy} onClick={props.onRestore}>{t(props.language, "recovery.restore")}</button>
        <button className="ghost-button" type="button" disabled={props.isBusy} onClick={props.onForget}>{t(props.language, "recovery.forget")}</button>
      </div>
    </section>
  );
}
