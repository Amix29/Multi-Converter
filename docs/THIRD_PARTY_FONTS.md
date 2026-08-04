# Embedded Editor Fonts

Multi-Converter embeds a deliberately small set of editor fonts so these
choices render without an Internet connection or a system-wide installation.
They are separate third-party font software and keep their own SIL Open Font
License 1.1 terms.

| Family | Upstream lock | Bundled browser files | License |
| --- | --- | --- | --- |
| Source Sans 3 `3.052` | `adobe-fonts/source-sans@ed1808970eb3c7301c9a523bee26473ba0bb62fa` | one upright variable WOFF2, weights 200–900 | OFL-1.1 |
| Atkinson Hyperlegible Next `2.001` | `googlefonts/atkinson-hyperlegible-next@7925f50f649b3813257faf2f4c0b381011f434f1` | one upright variable WOFF2, weights 200–800 | OFL-1.1 |
| JetBrains Mono `2.304` | `JetBrains/JetBrainsMono@cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9` | regular and bold WOFF2 | OFL-1.1 |

The WOFF2 sources live in `src/assets/fonts/`. Exact byte sizes and SHA-256
values are locked in `public/third-party/fonts/fonts-manifest.json`. That public
tree also contains the upstream OFL texts and notices copied byte for byte to
`dist/third-party/fonts/`, then included in the desktop packages.

## Runtime Contract

- `src/editor/editor-fonts.css` references only repository-local WOFF2 files.
- No font is fetched from Google Fonts, a CDN or another remote origin at
  runtime.
- The toolbar lists the three embedded families first, followed by optional
  system families.
- Only upright faces are bundled for the two proportional families, and only
  upright regular/bold faces for JetBrains Mono. The WebView may synthesize an
  italic face when the document requests italics; this avoids approximately
  390 KiB of extra font assets.
- Tiptap stores the chosen family name in `EditorDocumentV1`. Office and PDF
  export preserve that requested family name, but LibreOffice may substitute a
  font when the selected family is not installed on the export host. The WOFF2
  browser resources are not represented as an operating-system font install.

Run `npm run test:editor-fonts` to verify the upstream locks, license texts,
file sizes, WOFF2 signatures, SHA-256 values, toolbar declarations and absence
of remote CSS font sources. Frontend builds additionally run
`npm run test:editor-fonts:dist`, which proves that each WOFF2 is emitted once
and that the manifest, notices and OFL texts are present in `dist`.
