<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  
  
  import { t, type LanguageCode } from "../../i18n";

  let props: {
    language: LanguageCode;
    count: number;
    isBusy: boolean;
    onRestore(): void;
    onForget(): void;
  } = $props();
</script>

<section class="recovery-banner" aria-labelledby="recovery-title">
  <h3 id="recovery-title">
    {t(props.language, "recovery.title", { count: props.count })}
  </h3>
  <p>{t(props.language, "recovery.restoreDetail")}</p>
  <div class="screen-actions">
    <Button
      variant="unstyled"
      size="inherit"
      class="secondary-button"
      type="button"
      disabled={props.isBusy}
      onclick={props.onRestore}>{t(props.language, "recovery.restore")}</Button
    >
    <Button
      variant="unstyled"
      size="inherit"
      class="ghost-button"
      type="button"
      disabled={props.isBusy}
      onclick={props.onForget}>{t(props.language, "recovery.forget")}</Button
    >
  </div>
</section>
