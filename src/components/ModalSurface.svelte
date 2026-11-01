<script lang="ts">
  import { Dialog } from "bits-ui";
  import { onMount, type Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  let {
    open,
    ref = $bindable(null),
    overlayClass,
    class: className,
    initialFocus,
    onEscape,
    returnFocus,
    children,
    ...attributes
  }: Pick<HTMLAttributes<HTMLDivElement>, "onmousedown"> & {
    open: boolean;
    ref?: HTMLElement | null;
    overlayClass: string;
    class: string;
    initialFocus?: () => HTMLElement | null;
    onEscape?: (() => void) | undefined;
    returnFocus?: () => HTMLElement | null;
    children: Snippet;
    role?: "dialog" | "alertdialog";
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
  } = $props();
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  onMount(() => {
    window.dispatchEvent(new CustomEvent("multi-converter:modal-open"));
    document.body.classList.add("has-open-modal");
    return () => {
      if (document.querySelectorAll("[data-mc-modal]").length <= 1)
        document.body.classList.remove("has-open-modal");
    };
  });
</script>

<Dialog.Root
  {open}
  onOpenChange={(value) => {
    if (!value) onEscape?.();
  }}
>
  <Dialog.Portal>
    <div class={overlayClass} data-mc-modal>
      <Dialog.Content
        bind:ref
        class={className}
        {...attributes}
        onEscapeKeydown={(event) => {
          event.preventDefault();
          onEscape?.();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          const element = initialFocus?.();
          if (element) {
            event.preventDefault();
            element.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          const element = returnFocus?.() ?? previousFocus;
          if (element?.isConnected) {
            event.preventDefault();
            element.focus();
          }
        }}
      >
        {@render children()}
      </Dialog.Content>
    </div>
  </Dialog.Portal>
</Dialog.Root>
