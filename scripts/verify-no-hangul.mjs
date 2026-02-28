#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const HANGUL_REGEX = /[\u3131-\u318E\uAC00-\uD7A3]/u;
const MAX_LINES_PER_FILE = 5;

function listTrackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    if (typeof error?.stdout === "string" && error.stdout.length > 0) {
      return error.stdout.split("\0").filter(Boolean);
    }
    throw error;
  }
}

const findings = [];

for (const filePath of listTrackedFiles()) {
  let raw;
  try {
    raw = readFileSync(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }
    throw error;
  }

  if (raw.includes(0)) {
    continue;
  }

  const lines = raw.toString("utf8").split(/\r?\n/);
  const matchedLines = [];
  let totalMatches = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (HANGUL_REGEX.test(lines[lineIndex])) {
      totalMatches += 1;
      if (matchedLines.length < MAX_LINES_PER_FILE) {
        matchedLines.push(lineIndex + 1);
      }
    }
  }

  if (totalMatches > 0) {
    findings.push({
      filePath,
      matchedLines,
      remainingCount: Math.max(0, totalMatches - matchedLines.length),
    });
  }
}

if (findings.length > 0) {
  console.error("verify-no-hangul: FAIL");
  for (const finding of findings) {
    const suffix = finding.remainingCount > 0 ? ` (+${finding.remainingCount} more)` : "";
    console.error(`${finding.filePath}: lines ${finding.matchedLines.join(", ")}${suffix}`);
  }
  process.exit(1);
}

console.log("verify-no-hangul: OK");
