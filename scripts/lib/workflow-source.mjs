import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export function workflowJob(workflow, jobName) {
  const match = workflow.match(new RegExp(`^  ${jobName}:\\r?\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:\\r?\\n|(?![\\s\\S]))`, "m"));
  assert.ok(match, `workflow job is missing: ${jobName}`);
  return match[0];
}

export function readWorkflow(fileName) {
  return fs.readFileSync(path.join(process.cwd(), ".github", "workflows", fileName), "utf8");
}
