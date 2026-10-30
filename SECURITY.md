# Security Policy

## Supported Version

Multi-Converter currently supports the latest public V1.0.6 release on Windows x64, universal macOS and Linux x64.

Security fixes are prioritized for the latest tagged release and the default branch.

V1.0.7 is an unreleased conversion and local OCR development version. File editors
and editor drafts have been removed. Its supported build targets are Windows x64,
Linux x64 and macOS Apple Silicon; historical public macOS assets remain universal.
Development checks do not establish installed-package compatibility.

OCR resource verification recomputes the canonical path/size/SHA-256 list against
the lock embedded in the executable, then checks the actual files. A changed
payload and changed local manifest cannot authenticate themselves by retaining
the old claimed aggregate. Manifest input is limited to 16 MiB before parsing.
This is startup resource integrity checking, not isolation from an actor already
able to modify the running application or control the local user account.

## Reporting a Vulnerability

Do not post exploit details, crafted files, secrets, crash dumps with personal data, or private engine/archive URLs in a public GitHub issue.

Report vulnerabilities through GitHub's private vulnerability reporting flow if it is available on the repository's **Security** tab. If private reporting is not available, open a minimal public issue that says you need to report a security issue privately, but do not include reproduction details, payloads, logs or affected files until a private maintainer channel is available.

Useful details include:

- affected version or commit;
- operating system and architecture;
- file type or engine involved;
- reproduction steps;
- whether the issue needs a crafted file, network access, or a malicious engine archive.

## Scope

In scope:

- unsafe file handling, path traversal, archive extraction, or arbitrary file overwrite;
- command execution risks around conversion engines;
- malformed files causing excessive memory, CPU, disk, or process use;
- insecure engine download, verification, or installation behavior.
- document conversion that reads resources outside the allowed source directory or enables external XML entities;
- OCR behavior that uploads files or recognized text, downloads an unverified model, exposes temporary page images, or fails to enforce resource limits;
- marketing-site build inputs, public files, generated metadata and deployment workflow.

Out of scope:

- vulnerabilities in upstream third-party engines unless Multi-Converter packaging or invocation makes them worse;
- unsupported operating systems or unverified development builds;
- issues requiring local administrator compromise before launching the app.

## Local intermediates

Conversion, clipboard, Office/PDF/OCR and engine-extraction temporary directories
use one private directory builder. On Unix their permissions are explicitly 0700,
independent of the process umask. Source files remain outside these directories;
converted results awaiting export have a separate lifecycle. OCR and engine
resource names must be relative on every host, including rejecting Windows drive
prefixes when validation runs on Unix.

SVG rendering preflights UTF-8 XML with DTD disabled, a 16 MiB input limit and
100,000 XML nodes. Linked raster images must resolve inside the SVG source
directory, including after symlink resolution; network and nested SVG image
resources are refused. Embedded and sibling PNG/JPEG/GIF/WebP images share
compressed-byte and decoded-pixel budgets before the renderer receives them.

Batch recovery is off by default. Enabling it explicitly stores local original
paths, settings, import origins and size/mtime fingerprints in a bounded atomic
application-data file (0600 in a 0700 directory on Unix). It stores no document
body, recognized text or temporary result. Validity is 24 hours; expiry cleanup
runs on the next load/startup. Missing or changed originals are excluded. Disabling
the setting or forgetting the batch removes its saved paths; command serialization
prevents an already queued save from recreating a disabled plan.

## Marketing Site Dependency Status

The site pins its dependency versions in `site/package.json` and `site/package-lock.json`.
The npm override `sharp: "$sharp"` forces Next.js to reuse the
reviewed direct Sharp version instead of installing an older optional copy.

Dependency audit results are point-in-time evidence. Refresh them with:

```bash
npm run site:check
npm --prefix site audit --omit=dev
```

The published site remains a static export: it does not deploy a Next.js
server, Server Actions, middleware or the runtime image optimizer.
