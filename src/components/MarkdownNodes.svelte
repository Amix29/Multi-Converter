<script lang="ts">
  import MarkdownNodes from "./MarkdownNodes.svelte";
  import type { MarkdownNode } from "../lib/releaseMarkdown";
  let { nodes }: { nodes: readonly MarkdownNode[] } = $props();
</script>

{#each nodes as node}
  {#if node.kind === "text"}{node.text}
  {:else if node.kind === "break"}<br />
  {:else if node.kind === "rule"}<hr />
  {:else if node.kind === "checkbox"}<input
      type="checkbox"
      checked={node.checked}
      disabled
      aria-hidden="true"
      tabindex="-1"
    />
  {:else if node.kind === "element"}
    <svelte:element
      this={node.tag}
      href={node.href}
      title={node.title}
      class={node.className}
      start={node.start}
      style:text-align={node.align}
      target={node.tag === "a" ? "_blank" : undefined}
      rel={node.tag === "a" ? "noreferrer" : undefined}
    >
      <MarkdownNodes nodes={node.children} />
    </svelte:element>
  {/if}
{/each}
