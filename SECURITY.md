# Security Policy

## Supported Version

Multi-Converter currently supports the latest Windows x64 public release. macOS support is in development for V1.0.5 and should not be described as publicly supported until the universal DMG has been built and verified on macOS.

Security fixes are prioritized for the latest tagged release and the default branch.

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

Out of scope:

- vulnerabilities in upstream third-party engines unless Multi-Converter packaging or invocation makes them worse;
- unsupported operating systems or unverified development builds;
- issues requiring local administrator compromise before launching the app.
