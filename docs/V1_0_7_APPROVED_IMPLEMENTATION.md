# V1.0.7 — Approved audit implementation

## Maintainer decisions — 2026-10-30

The maintainer approved AUDIT_COMPLET_2026_10_29.md and retired Intel macOS.
Active targets: Windows x64, macOS Apple Silicon (aarch64-apple-darwin), Linux x64.
Historical V1.0.6 universal assets/evidence stay unchanged. Conversion and local
PP-OCRv6_medium OCR remain the product; document/PDF editors and cloud inference
remain excluded. Preserve Vellum Paper, source files and the three-step journey.
No release, publication or remote push is authorized by implementation approval.

## Work and integration

- Work branch: codex/converter-audit-apple-silicon.
- Integration target: local codex/test; base 24303e48 (audit docs after 98726742).
- Dedicated ordinary Git worktree under the task writable directory. The app's
  managed tool rejected the stale source path; the base checkout is untouched.
- Native assets were copied for tests; their presence does not establish host proof.
- Integration remains pending until current source/lockfile checks pass.

## Implementation progress

| Lot | Scope | State |
| --- | --- | --- |
| A | Dependency fixes, Apple Silicon build/OCR policy, hashed locks and provenance | Implemented locally; platform package/host evidence pending |
| B | Private document resources, warnings, CSV integrity, partial import | Implemented; remaining native privacy/fidelity fixtures pending |
| C | Layout/errors, update semantics, guarded session exit/reset, re-export | Implemented; partial browser proof, native close/installed acceptance pending |
| D | Image orientation/matte, bounded stderr, process supervision, OCR rebuild | Implemented; regression/performance validation in progress |
| E | Contextual quality profiles, actual result metrics, diagnostics | Implemented; measured engine/profile parity and wider optimization backlog open |
| F | Complete canonical gates, final native packages, licenses and release handoff | In progress; no release readiness claim |

The original audit is dated evidence. Recommendations for remux, wider track policy,
resource budgets, recovery/history, target-size estimates, manifests and optional
folder rules/watch mode remain approved follow-up scope; none is marked delivered
merely because a first implementation lot exists.

## Current implemented behavior

- Conversion start uses a synchronous guard before the first asynchronous action.
  Frontend time-based progress and FFmpeg/external-engine timer estimates removed.
- Errors and OCR/fallback warnings reach the output UI. Rich-document fallback is
  refused; integrated fallback is limited to TXT and explicitly warns of loss.
- CSV JSON export rejects duplicate normalized headers/irregular widths and keeps
  significant value whitespace. JSON CSV accepts flat objects/arrays, unions all
  columns and refuses nested data instead of flattening it silently. Import returns
  valid files plus per-file rejects.
- Format footer height corrected; notices occupy a row; errors persist; checkbox
  labeling and full filename labels corrected; feedback dismissal is immediate.
- Export retains managed results and keeps export controls after the first copy.
  Session guard prompts before discarding unexported results or cancelling active
  conversions/OCR; native closing waits for cancellation before destroying a window.
  Update installation also goes through this guard before restarting.
- Compact/Balanced/High is typed end to end, shown only for relevant targets.
  Applied to lossy media, JPEG and PDF raster DPI. Lossless targets keep their
  format behavior. Actual engine/bytes/duration are returned for result summaries.
- JPEG uses an explicit white alpha matte. Integrated images apply EXIF orientation
  with bounded allocations; libvips autorot precedes export. SVG colors are
  converted from premultiplied to straight alpha before image encoding, and the
  two simultaneously live SVG buffers have a 256 MiB combined allocation budget.
  Result validation uses the bounded decoder too.
- Pandoc uses sandbox/fail-on-warnings and staged local raster images as data URIs;
  remote or directory-escaping image references fail closed. Embedded image limits:
  32 MiB each, 64 MiB total. No filters or external PDF engines are enabled.
- A native HTML fixture showed LibreOffice still fetched two HTTP images despite
  link-update settings. HTML now becomes a self-contained, checked Pandoc ODT
  before Office import. DOCX external resources/templates/fields and ODT external
  resources/DDE are rejected before native import. Hyperlinks remain links.
  Legacy binary DOC/RTF and OS-level engine confinement still need wider proof.
- LibreOffice gets a private profile with macros disabled, maximum macro security,
  link updates disabled for Writer/WriterWeb/Calc and its updater disabled.
  This configuration alone is not an OS network-isolation guarantee.
- FFmpeg/ffprobe input protocols restricted to local file/pipe. Process guards
  terminate unfinished children; stderr capture is bounded and backpressured;
  media inactivity timeout and cancellation drain paths are bounded.
- Logs omit filenames/raw converter errors/OCR text, rotate at 1 MiB with one
  previous file, and expire owned logs after 14 days on use.
- Settings expose conversion-engine readiness and manual local diagnostics/OCR status.
- Video uses the first real video stream and first audio stream; audio extraction
  uses the first audio stream. Additional tracks/subtitles/attachments trigger a
  result warning. HDR reencoding is refused until color conversion is implemented;
  audio extraction remains available. The real two-language/subtitle fixture
  confirms explicit first-stream mapping and preserves the first language tag.
- Mac preparation, staging, DMG, updater and release validators target ARM only.
  Phase 8 Mac staging requires fresh successful same-commit ARM engines and never
  relabels V1.0.6 universal archives. Windows/Linux paths and Linux baseline remain.
  Intel-only scripts/locks were sent to the Recycle Bin after removing references.
- Ordinary Build quality jobs run on codex/test without the old hidden opt-in and
  pin Rust 1.96.0. All external workflow actions are fixed to official full commit
  SHAs recorded in tools/workflow-action-lock.json; contract checks reject drift.
  PDFium checks retain source/lock/native-library checks and now
  reuse Cargo dependency cache instead of deleting it after every invocation.
- Test/lint Cargo commands omit copying packaged resources into their target;
  conversion tests still execute the real staged source engines. Production Tauri
  builds keep the complete resources and separate packaging checks remain required.
- Settings and OCR dialogs load when opened. Production bundle measurement:
  534,762 raw frontend bytes; 400,652 bytes in the complete initial JS preload
  graph (entry 88,560 bytes). No current Windows executable size claim.
- The post-export summary no longer collapses under its text when a notice is
  visible. Its count has the intended compact typography; the list can shrink
  to one row and the panel scrolls when necessary. A rendered geometry regression
  checks that the count stays in the card and the filters start below it.

## Dependency and OCR evidence

- Desktop: Vite 8.3.5, Vitest 4.1.12, updater 2.14.1 and transitive fixes.
  Final complete npm audit: zero vulnerability entries.
- Site: Next 16.4.3, sharp 0.35.5 and transitive fixes. npm audit zero and full
  site:check passed outside sandbox creation/rename restrictions.
- Rust: ZIP 9.0.0, rustls 0.23.46, webpki 0.103.16, Tauri 2.12+ and updater 2.14.1.
  Tokio is now 1.53.3, correcting RUSTSEC-2026-0386 Unix I/O unsoundness.
  Root and separate PDFium-wrapper audits report zero vulnerability-category
  entries. Informational maintenance/yank warnings and inherited GTK glib 0.18.5
  RUSTSEC-2024-0429 remain visible and require Linux/framework triage. No ignore
  was added; a zero vulnerability counter is not a zero-warning security claim.
- Three Python locks regenerated reproducibly with reviewed security fixes;
  all three dependency audits reported zero. Paddle remains 3.3.1/3.7.0/3.7.0.
- New Windows worker built from those inputs; Paddle CPU run_check passed.
  Detection is explicitly bounded to a 1536-pixel longest side; recognition uses
  original-resolution crops. All five models and the reference CPU backend remain.
  Two packages matched exactly: 7,246 files, 660,643,156 content bytes,
  aggregate d386f7923fbea6fe6efa407b2f00d3e99e31ee9778027a67ca32e6b14adf759c.
  ZIP 236,811,152 bytes; SHA-256 77da8356877fc3efc2da162a683983c66adc4e1b361d1f0f20c7bdae1c79b2ac.
  Inventory: 71 distributions, 104 license files, complete supplemental coverage;
  supply-chain audit passed. Shared model artifact is unchanged and verified.
- Packaged OCR French smoke: 100% character accuracy, 114,719 ms under concurrent
  validation load. The first full corpus failed at the 180-second response limit
  after three cached French rows. Isolated English probe then passed at 100%,
  77,744 ms, 95 network samples and zero observed remote connections. This probe
  is not a full corpus pass. A later isolated full run reproduced the scanned-PDF
  timeout. A controlled source probe with bounded detection finished that exact
  image in 128,102 ms with all expected text. The rebuilt packaged corpus passed
  all 40 cases: clean 100%, difficult 99.76%, median 54,823 ms, peak 666.7 MiB,
  861 network samples and zero observed remote connections. The scanned PDF
  passed in 107,331 ms and mixed PDF in 121,580 ms, both at 100%.
  A separate one-shot French smoke passed at 100% in 54,155 ms.
  Global oneDNN failed an operator; per-module oneDNN and one-thread probes did not
  justify adoption. The 180-second deadline and accuracy criteria are unchanged.
- The inventory-based and platform lock generators now share the canonical header;
  both reproduce the same Windows hash and all three platform checks pass.
- Mac PDFium upstream archive and arm64 library verified from official release:
  archive 3,403,205 bytes, SHA-256 0e9692fa2063f5b5e6f6129680fe618f47efb9d728dd02e9db9b8999e386c84e;
  library 7,079,408 bytes, SHA-256 3aed5632c54a689ade84a811b93943ea8afa8c3ccae6b3e7e9e58de87bea42af.
  This is archive/source provenance, not native Mac execution/package evidence.

## Validation checkpoints and open gates

171 Rust tests, ten native conversion groups and the full prepared LibreOffice
archive extraction passed. The eleven ignored native cases were thus exercised.
A junction-fixture access denial in the sandbox passed outside it. Clippy found
nested-if/test-module ordering issues were fixed; all-target Clippy passed.
The Tokio 1.53.3 update also passed 171 Rust tests, ten conversion groups and
all-target Clippy; runtime corpus receipts stay tied to the unchanged OCR archive.
Earlier frontend unit suite: 47 passed; typecheck/import IPC checks passed.
Current static UI layout, Mac/Windows/Linux asset and workflow contracts pass.
The complete canonical check passed; a final staged-tree pass follows the last
security and layout changes.

Browser preview demonstrated reset confirmation with initial focus on Stay,
retaining results on Stay, and export controls still available after export.
The final rendered suite passed 12 tests with 10 project-declared exclusions,
including lazy dialogs, OCR cancellation and the new export geometry assertion.
Manual confirmation/re-export screenshots are browser simulations; native closing
and actual installed pickers/drop still remain unproven.
The native Pandoc pipeline fixture passed: remote HTML image rejected with zero
HTTP connections, local image embedded in DOCX and ODT, source bytes unchanged.
The native libvips fixture confirms white JPEG matte and EXIF orientation with
unchanged source bytes. FFmpeg/ffprobe HTTP-enabled control and restricted runs
confirm the shared production whitelist blocks the request; this is no claim that
the default HLS demuxer was vulnerable before the explicit restriction.
No current installed Windows candidate, Mac/Linux host receipt, final release
asset set or public publication has been established. A local source pass never
substitutes for those platform gates.

## Remaining approved work

- Finish current lint/unit/type/i18n/structure, full canonical check and production
  build; rerun conversions/PDFium/privacy fixtures and final browser regressions.
- Extend OCR beyond the passing fixed corpus (small print, wider layouts and
  representative real documents); benchmark cold/warm and Mac/Linux parity.
- Verify LibreOffice external-reference/macro policies and complete local image
  embedding/native protocol fixtures. Keep source hashes unchanged.
- Wider media track/remux support, ICC/metadata and image frame/page policy, global
  decoded-pixel memory and
  concurrency budgets, recovery/retention and practical batch/folder improvements.
- Review final license notices and package the exact Windows candidate; installed
  conversion/OCR/offline/cancel/restart/picker/drop acceptance remains mandatory.
- Build actual ARM Mac and Linux packages on their systems; native conversion/OCR,
  final downloaded package and clean-host acceptance remain mandatory.
- Keep signing, updater signatures, notarization and publication separate. No push
  or release is implied by implementation or by passing local checks.
- Triage the inherited GTK informational unsoundness and maintained replacements
  for transitive unmaintained/yanked dependencies; do not suppress audit output.
