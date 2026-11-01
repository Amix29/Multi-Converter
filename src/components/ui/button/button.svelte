<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";
  import { cn, type WithElementRef } from "@/lib/utils.js";
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

  export const buttonVariants = tv({
    base: "inline-flex items-center justify-center gap-2 disabled:pointer-events-none",
    variants: {
      variant: {
        default: "primary-button",
        secondary: "secondary-button",
        ghost: "ghost-button",
        unstyled: "",
      },
      size: { default: "min-h-11", compact: "min-h-8", inherit: "" },
    },
    defaultVariants: { variant: "default", size: "default" },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
      variant?: ButtonVariant;
      size?: ButtonSize;
    };
</script>

<script lang="ts">
  let {
    class: className,
    variant = "default",
    size = "default",
    ref = $bindable(null),
    href = undefined,
    type = "button",
    disabled,
    children,
    ...restProps
  }: ButtonProps = $props();
</script>

{#if href}
  <a
    bind:this={ref}
    data-slot="button"
    class={cn(buttonVariants({ variant, size }), className)}
    href={disabled ? undefined : href}
    aria-disabled={disabled}
    role={disabled ? "link" : undefined}
    tabindex={disabled ? -1 : undefined}
    {...restProps}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    class={cn(buttonVariants({ variant, size }), className)}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
