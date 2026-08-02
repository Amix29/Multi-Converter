import assert from "node:assert/strict";

export function assertWindowsPdfiumWorkflowContracts({ workflow, job }) {
  assert.match(workflow, /name:\s+Windows PDFium Engine Staging/, "PDFium staging workflow must be clearly named");
  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- codex\/test/, "PDFium staging must run from the persistent test branch");
  assert.doesNotMatch(workflow, /lfs:\s*true/, "PDFium staging must not use Git LFS checkout");
  assert.match(job, /runs-on:\s+windows-2025/, "PDFium staging must run on Windows x64");
  assert.match(job, /dtolnay\/rust-toolchain@1\.96\.0/, "PDFium staging must use the exact locked build toolchain");
  assert.match(job, /npm run prepare:pdfium-engine/, "PDFium staging must prepare the locked upstream archive");
  assert.equal((job.match(/npm run package:pdfium-engine/g) ?? []).length, 2, "PDFium staging must package twice");
  assert.match(job, /Get-FileHash -Algorithm SHA256/, "PDFium staging must compare package hashes");
  assert.match(job, /npm run validate:pdfium-engine-release -- --dir dist-engines-advanced/, "PDFium staging must validate the exact asset directory");
  assert.match(job, /npm run test:pdfium-wrapper/, "PDFium staging must run wrapper runtime tests");
  assert.match(job, /name:\s+windows-pdfium-engine-assets/, "PDFium staging must upload a named Actions artifact");
  assert.doesNotMatch(workflow, /gh release (?:create|upload)/, "Staging must not publish a release before artifact review");
}
