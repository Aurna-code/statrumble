#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

const trackedFiles = listTrackedFiles();

const rules = [
  { name: "next-font-google", regex: /next\/font\/google/ },
  { name: "fonts-googleapis", regex: /fonts\.googleapis\.com/ },
  { name: "css-import-google-font", regex: /@import\s+url\(["']https:\/\/fonts\.googleapis\.com/ },
];

const findings = [];

for (const filePath of trackedFiles) {
  const raw = readFileSync(filePath);
  if (raw.includes(0)) {
    continue;
  }

  const lines = raw.toString("utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of rules) {
      if (rule.regex.test(line)) {
        findings.push({
          filePath,
          line: i + 1,
          match: rule.name,
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("verify-no-remote-fonts: FAIL");
  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.line}: ${finding.match}`);
  }
  process.exit(1);
}

console.log("verify-no-remote-fonts: OK");
