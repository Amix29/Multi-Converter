<script lang="ts">
  import type { Token } from "marked";
  import MarkdownNodes from "./MarkdownNodes.svelte";
  import { fallbackMarkdownTokens, markdownNodes } from "../lib/releaseMarkdown";
  let { body }: { body: string } = $props();
  let tokens = $state.raw<readonly Token[]>([]);
  $effect(() => {
    const source = body;
    let disposed = false;
    tokens = fallbackMarkdownTokens(source);
    void import("marked")
      .then(({ marked }) => {
        if (!disposed)
          tokens = marked.lexer(source, {
            async: false,
            gfm: true,
            breaks: false,
            pedantic: false,
            silent: true,
          });
      })
      .catch(() => {
        /* Keep escaped fallback text when a chunk is unavailable. */
      });
    return () => {
      disposed = true;
    };
  });
  let nodes = $derived(markdownNodes(tokens));
</script>

<div class="release-note-content"><MarkdownNodes {nodes} /></div>
