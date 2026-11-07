import { createHash } from "node:crypto";

// Tauri 2.11.2 patches the first UNK token for the package, then restores the
// unsigned source executable after bundling. Reproduce that exact operation
// only in memory; every other byte remains part of the expected SHA-256.
// https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle.rs
export function nsisBinaryExpectation(source) {
  const unknown = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const nsis = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_NSS");
  const offset = source.indexOf(unknown);
  const expected = Buffer.from(source);
  if (offset >= 0) {
    if (source.indexOf(unknown, offset + unknown.length) >= 0) throw Error("Ambiguous Tauri bundle marker");
    nsis.copy(expected, offset);
  } else if (source.indexOf(nsis) < 0) {
    throw Error("Missing Tauri NSIS bundle marker");
  }
  return { bytes: source.length, sha256: sha(expected), sourceSha256: sha(source),
    transformation: offset >= 0 ? "Exact Tauri UNK-to-NSS marker replacement" : "Source already contains NSIS marker",
    markerOffset: offset >= 0 ? offset : source.indexOf(nsis) };
}

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
