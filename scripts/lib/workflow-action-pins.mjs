import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const lock = JSON.parse(fs.readFileSync(new URL("../../tools/workflow-action-lock.json", import.meta.url), "utf8"));
export const reviewedRustAction = `dtolnay/rust-toolchain@${lock.actions["dtolnay/rust-toolchain"].sha}`;

export function assertWorkflowActionPins(root) {
  assert.equal(lock.schemaVersion, 1);
  const directory = path.join(root, ".github", "workflows");
  for (const file of fs.readdirSync(directory).filter((name) => /\.ya?ml$/u.test(name))) {
    const text = fs.readFileSync(path.join(directory, file), "utf8");
    for (const match of text.matchAll(/\buses:\s+([^\s#]+)([^\n]*)/gu)) {
      const reference = match[1];
      if (reference.startsWith("./")) continue;
      const [repository, sha] = reference.split("@");
      const pin = lock.actions[repository];
      assert.ok(pin, `${file}: unreviewed action ${repository}`);
      assert.match(sha ?? "", /^[a-f0-9]{40}$/u, `${file}: action must use a full commit SHA`);
      assert.equal(sha, pin.sha, `${file}: action must match reviewed provenance`);
      assert.equal(match[2].trim(), `# ${pin.version}`, `${file}: keep the reviewed version visible`);
      assert.equal(pin.commitUrl, `https://github.com/${repository}/commit/${sha}`);
    }
  }
}
