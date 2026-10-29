# Product Constraints

Preserve Multi-Converter's local, private and open-source conversion contract.

- User files, images and recognized OCR text stay on the device.
- Never add cloud conversion, cloud OCR, silent uploads or runtime model downloads.
- The public baseline is V1.0.6. Development metadata stays synchronized at `1.0.7`;
  this is not release authorization.
- Document and PDF editors were cancelled by the maintainer on 2026-10-29.
  Do not reintroduce editor workspaces, draft management or editing commands.
- Keep document/PDF conversion and packaged local `PP-OCRv6_medium` OCR.
  Do not substitute another model tier or a remote API silently.
- Failed conversion or OCR jobs must report errors and preserve source files.
- Existing local drafts and assets from earlier development builds are user data;
  removing editor support does not authorize deleting them.
- Read `docs/V1_0_7_PLAN.md`, `docs/V1_0_7_OCR.md` and
  `docs/V1_0_7_VALIDATION.md` for current scope, contracts and release evidence.
