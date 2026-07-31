import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // React is shared by the initial shell and the lazy editor; keep it
            // outside the editor group so opening the converter does not preload Tiptap.
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "sanitizer-vendor",
              test: /node_modules[\\/]dompurify[\\/]/,
              priority: 25,
            },
            // Tiptap and ProseMirror contain initialization cycles. Keep their
            // graph together instead of applying an arbitrary max-size split.
            {
              name: "editor-vendor",
              test: /node_modules[\\/](?:@tiptap|prosemirror-)/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_"],
});
