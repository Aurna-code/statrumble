#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const targetFile = "statrumble/app/layout.tsx";

try {
  const output = execFileSync("git", ["grep", "-n", "data-demo-mode", "--", targetFile], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (!output) {
    throw new Error("No match output");
  }
} catch {
  console.error(`verify-demo-ui-mode: FAIL - missing data-demo-mode in ${targetFile}`);
  process.exit(1);
}

console.log("verify-demo-ui-mode: OK");
