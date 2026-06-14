import { spawnSync } from "node:child_process";
import process from "node:process";

const steps = [
  ["npm", ["run", "test:linux:environment"]],
  ["npm", ["run", "validate:embedded-manifest"]],
  ["npm", ["run", "validate:i18n"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "test:release-notes"]],
  ["npm", ["run", "test:linux-packaging"]],
  ["npm", ["run", "test:linux-engine-release-assets"]],
  ["npm", ["run", "test:github-workflows"]],
  ["npm", ["run", "test:release-assets"]],
  ["npm", ["run", "test:bundled-engines-platform"]],
  ["npm", ["run", "test:ui-layout"]],
  ["npm", ["run", "test:repository-metadata"]],
  ["npm", ["run", "test:run-tauri"]],
  ["npm", ["run", "fmt:rust:check"]],
  ["node", ["scripts/prepare-tauri-ci-sidecars.mjs", "--target", "x86_64-unknown-linux-gnu"]],
  ["node", ["scripts/cargo-test-temp.mjs", "check", "--manifest-path", "src-tauri/Cargo.toml", "--target", "x86_64-unknown-linux-gnu"]],
  ["node", ["scripts/cargo-test-temp.mjs", "clippy", "--manifest-path", "src-tauri/Cargo.toml", "--target", "x86_64-unknown-linux-gnu", "--all-targets", "--", "-D", "warnings"]],
  ["npm", ["run", "test:rust"]],
  ["npm", ["run", "test:pdfium-wrapper:compile"]],
  ["npm", ["run", "clippy:pdfium-wrapper"]],
];

if (process.platform !== "linux" || process.arch !== "x64") {
  console.error(`Linux CI gate must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
  process.exit(1);
}

for (const [command, args] of steps) {
  run(command, args);
}

console.log("Linux CI gate passed.");

function run(command, args) {
  const executable = command === "npm" && process.env.npm_execpath ? process.execPath : command;
  const finalArgs = command === "npm" && process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, finalArgs, {
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      MULTI_CONVERTER_ENGINE_PLATFORM: "linux-x64",
      MULTI_CONVERTER_SKIP_ENGINE_SMOKE: "1",
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`Failed to start ${command} ${args.join(" ")}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}
