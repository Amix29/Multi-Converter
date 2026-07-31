# Security Policy

## Supported Version

Multi-Converter currently supports the latest public V1.0.6 release on Windows x64, universal macOS and Linux x64.

Security fixes are prioritized for the latest tagged release and the default branch.

V1.0.7 is an unreleased development version. Its Tiptap editor and future `PP-OCRv6_medium` integration are not covered by a public compatibility claim until their platform gates pass.

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
- editor draft or asset access that escapes the local document directory;
- persisted editor images that bypass the validated `mc-asset://` storage contract;
- document imports that bypass the bounded ODT parser or enable external XML entities;
- future OCR behavior that uploads files or recognized text, downloads an unverified model, exposes temporary page images, or fails to enforce resource limits.
- marketing-site build inputs, public files, generated metadata and deployment workflow.

Out of scope:

- vulnerabilities in upstream third-party engines unless Multi-Converter packaging or invocation makes them worse;
- unsupported operating systems or unverified development builds;
- issues requiring local administrator compromise before launching the app.

## Marketing Site Dependency Status

As of 2026-07-30, the site pins Next.js `16.2.12`, PostCSS `8.5.25` and
Sharp `0.35.3`. The npm override `sharp: "$sharp"` forces Next.js to reuse the
reviewed direct Sharp version instead of installing an older optional copy.

The installed production dependency audit reports zero known vulnerabilities.
Keep that evidence current by running:

```bash
npm run site:check
npm --prefix site audit --omit=dev
```

The published site remains a static export: it does not deploy a Next.js
server, Server Actions, middleware or the runtime image optimizer.
