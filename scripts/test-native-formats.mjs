import { spawnSync } from "node:child_process";

const python = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(python, ["-B", "tools/format-tests/run.py", ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, PYTHONUTF8: "1" },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
