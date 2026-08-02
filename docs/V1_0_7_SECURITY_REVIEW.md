# V1.0.7 Security Review

Date: 2026-08-02
Scope: Phase 6 review plus Phase 7 Windows PDFium closure at `0224d4d0`
Status: engineering review complete; release and redistribution remain blocked

This is a technical security and redistribution review, not legal advice.

## Executive Summary

No exploitable critical, high or medium finding was demonstrated in the
reviewed application or its locked JavaScript, Rust and Python dependencies.
The review added three CSP directives, a reproducible 71-distribution Python
lock, a complete OCR license inventory and the supplemental Apache-2.0 text
missing from the exact `bce-python-sdk` artifact.

The official CPU `PP-OCRv6_medium` runtime remains selected. A targeted
PyInstaller candidate was rejected: after restoring imports and metadata
required by PaddleX, it saved 9.17% installed and 6.28% compressed, below the
10% selection threshold.

The low PDFium release-engineering discrepancy is corrected. The replacement
archive is provenance-locked, reproducible on its declared Windows 2025 build
environment, publicly checksum-verified and validated through two isolated
NSIS installation cycles. This closes only packaged PDFium/OCR evidence; it
does not validate the 101 manual Phase 5 scenarios.

## Scope And Method

The review covered DOMPurify and `mc-asset://`; external URLs and CSP; browser
storage and Tauri capabilities; files, XML/ZIP, archives and atomic outputs;
processes, timeouts and temporary files; OCR models, supervision, limits and
network behavior; dependency advisories; and exact runtime licenses.

The `security-best-practices` guidance was applied to the React/browser
boundaries and adapted to the local Tauri threat model. Static inspection is
not treated as native host evidence.

## Findings

### MC-SEC-001 — Low — Missing explicit form and frame CSP directives

Evidence: the Phase 5 CSP restricted scripts, objects, base URLs, images and
connections, but did not state form or frame policies.

Impact: no related sink was demonstrated; this was defense in depth.

Correction: `form-action 'none'`, `frame-src 'none'` and
`frame-ancestors 'none'` are now required by configuration and contract test.

Status: corrected.

### MC-SEC-002 — Low — Inline document styles remain allowed

Evidence: `style-src 'unsafe-inline'` is required by Tiptap layout, page
geometry and supported imported styles.

Impact: inline styles increase the consequence of a sanitizer bypass, but do
not enable scripts by themselves.

Controls: DOMPurify 3.4.12 is pinned; tags and attributes use allowlists;
active CSS, handlers, embedded content, remote images and dangerous schemes
are removed; scripts stay restricted to self; frames, forms and objects are
blocked.

Status: accepted low risk. Removal requires a separate editor rendering design.

### MC-SEC-003 — Informational — OCR supply chain was not reproducible

Evidence: Phase 5 recorded 71 distributions without one hash-locked install
input. The exact `bce-python-sdk==0.9.76` artifacts declared Apache-2.0 without
embedding a license file.

Correction: Python 3.12.10, uv 0.11.21 and all 71 distributions are pinned with
artifact hashes. The official Apache-2.0 text is tied to the exact wheel and
source hashes. The inventory now reports 71/71 packages covered and 106
license files.

Status: corrected technically; maintainer legal approval remains a release gate.

### MC-SEC-004 — Low — RustSec maintenance and platform warnings

Evidence: `cargo audit` exits successfully with 20 allowed warnings, including
unmaintained GTK3 bindings and `glib` iterator unsoundness in the Tauri Linux
WebKit path.

Impact: no Windows exploit path was demonstrated. The GTK path requires review
on Linux before the V1.0.7 AppImage can ship.

Status: accepted for this Windows-only phase; re-evaluate during Phase 8. The
two project-authorized build-time `quick-xml` exceptions are not broadened.

### MC-SEC-005 — Informational — Network observation is process-sampled

Evidence: the corpus samples established remote TCP connections for the OCR
PID every second while the machine network remains active. Local model paths,
`HF_HUB_OFFLINE=1`, disabled model-source checking and `NO_PROXY=*` are used.
Observed runs recorded zero remote connections.

Limit: this is not packet capture and cannot disprove an extremely short
connection. Source inspection and local model resolution are additional
controls.

Status: accepted evidence limitation for Phase 6.

### MC-SEC-006 — Low — Historical PDFium artifact lacked hybrid inspection

Evidence: the historical engine archive wrapper had no `--inspect-text`; the
OCR domain calls that command before choosing native or OCR pages. Current
source and the replacement wrapper expose it and pass seven native tests.

Impact: no security boundary is weakened, but a package prepared from that
archive can fail PDF OCR.

Correction: PDFium `149.0.7825.0`, its official archive and DLL, Rust 1.96.0,
the `windows-2025` build environment, wrapper `0.3.0` and the engine ZIP are
locked independently. The public `engines-v0.1.1-alpha.0` prerelease contains
only the archive, checksum and one-engine manifest. Cache-empty download,
runtime health, seven wrapper tests and two installed NSIS cycles passed.

Status: corrected. V1.0.7 remains blocked by unrelated release gates.

## Dependency Audit Evidence

- `npm audit`: zero known vulnerabilities.
- `npm audit --omit=dev`: zero known vulnerabilities.
- `pip-audit 2.10.1` against the complete hash lock: zero known vulnerabilities.
- `cargo audit`: successful with 20 allowed warnings and no blocking advisory.
- OCR inventory: 71 distributions, 71 covered, 106 license files, zero
  unresolved metadata entries.

These results describe the reviewed locks on 2026-08-02, not future advisory
databases.

## Residual Limits

- macOS and Linux native packages were not validated here;
- the marketing site was outside Phase 6;
- process sampling is not full packet capture;
- public redistribution requires maintainer approval of the complete notices.
