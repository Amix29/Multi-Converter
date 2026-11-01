<script lang="ts">
  
  
  import type { QualityProfile } from "../../lib/api";
  import { t, type LanguageCode } from "../../i18n";
  import ChoiceSelect from "../components/ChoiceSelect.svelte";

  let props: {
    language: LanguageCode;
    value: QualityProfile;
    onChange(value: QualityProfile): void;
  } = $props();
</script>

<div class="quality-options">
  <ChoiceSelect
    label={t(props.language, "quality.title")}
    value={props.value}
    options={(["compact", "balanced", "high"] as const).map((value) => ({
      value,
      label: t(props.language, `quality.${value}`),
    }))}
    onChange={(value) => {
      if (value === "compact" || value === "balanced" || value === "high")
        props.onChange(value);
    }}
  />
  <p>{t(props.language, "quality.detail")}</p>
</div>
