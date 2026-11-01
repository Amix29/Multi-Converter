<script lang="ts">
  
  
  import type { MediaMode } from "../../lib/api";
  import { t, type LanguageCode } from "../../i18n";
  import ChoiceSelect from "../components/ChoiceSelect.svelte";

  let props: {
    language: LanguageCode;
    value: MediaMode;
    onChange(value: MediaMode): void;
  } = $props();
</script>

<div class="quality-options">
  <ChoiceSelect
    label={t(props.language, "media.mode")}
    value={props.value}
    options={(["convert", "copy"] as const).map((value) => ({
      value,
      label: t(props.language, `media.${value}`),
    }))}
    onChange={(value) => {
      if (value === "convert" || value === "copy") props.onChange(value);
    }}
  />
  <p>
    {t(
      props.language,
      props.value === "copy" ? "media.copyDetail" : "media.convertDetail",
    )}
  </p>
</div>
