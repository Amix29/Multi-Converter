<script lang="ts">
  import { Select } from "bits-ui";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Check from "@lucide/svelte/icons/check";
  interface ChoiceOption {
    value: string;
    label: string;
  }
  let props: {
    label: string;
    value: string;
    options: readonly ChoiceOption[];
    onChange(value: string): void;
  } = $props();
  const id = $props.id();
  let open = $state(false);
  let selectedLabel = $derived(
    props.options.find((option) => option.value === props.value)?.label ?? "",
  );
</script>

<div class="choice-select">
  <span id={`${id}-label`} class="choice-label">{props.label}</span>
  <Select.Root
    type="single"
    value={props.value}
    onValueChange={props.onChange}
    bind:open
    items={[...props.options]}
    loop
  >
    <Select.Trigger
      class="choice-trigger"
      aria-labelledby={`${id}-label ${id}-value`}
    >
      <span id={`${id}-value`}>{selectedLabel}</span><ChevronDown
        aria-hidden="true"
      />
    </Select.Trigger>
    <Select.Portal>
      <Select.Content
        class="choice-menu mc-select-menu"
        sideOffset={6}
        align="start"
        preventScroll={false}
      >
        <Select.Viewport>
          {#each props.options as option (option.value)}
            <Select.Item value={option.value} label={option.label}>
              <span>{option.label}</span><Check aria-hidden="true" />
            </Select.Item>
          {/each}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
</div>

<style>
  :global(.mc-select-menu) {
    position: relative;
    width: var(--bits-select-anchor-width);
    min-width: 0;
    max-width: calc(100vw - 24px);
    max-height: min(280px, var(--bits-select-content-available-height));
  }
  :global(.mc-select-menu [data-highlighted]) {
    background: var(--accent-soft);
    outline: none;
  }
</style>
