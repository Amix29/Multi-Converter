# Security Policy

## Supported Version

Multi-Converter currently supports the latest Windows x64 public release. macOS support is in development for V1.0.5 and should not be described as publicly supported until the universal DMG has been built and verified on macOS.

Security fixes are prioritized for the latest tagged release and the default branch.

## Reporting a Vulnerability

Please report security issues by opening a GitHub issue.

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
