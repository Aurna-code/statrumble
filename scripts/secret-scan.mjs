#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT_FILE_ENCODING = "utf8";

function readTrackedFilesFromGit() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { encoding: TEXT_FILE_ENCODING })
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    if (typeof error?.stdout === "string" && error.stdout.length > 0) {
      return error.stdout.split("\0").filter(Boolean);
    }
    throw error;
  }
}

function readTrackedFilesFromListFile(filePath) {
  return readFileSync(filePath, TEXT_FILE_ENCODING)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const trackedFiles = process.argv[2] ? readTrackedFilesFromListFile(process.argv[2]) : readTrackedFilesFromGit();

const secretRegexes = [
  { label: "OpenAI secret-style token", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { label: "Google API key-style token", regex: /\bAIzaSy[A-Za-z0-9_-]{16,}\b/ },
  { label: "Slack token-style value", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    label: "Private key block header",
    regex: /-----BEGIN(?: [A-Z0-9 ]+)? PRIVATE KEY-----|-----BEGIN [A-Z0-9 ]+-----/,
  },
];

const envAssignRegex =
  /\b(OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\b\s*[:=]\s*("([^"\n]*)"|'([^'\n]*)'|([^\s#]+))/;
const serviceRoleJwtRegex = /\bservice[_-]?role\b/i;
const jwtLikeRegex = /\beyJ[A-Za-z0-9._-]{30,}\b/;

const placeholderValueRegex =
  /^(|YOUR_[A-Z0-9_]+|REPLACE_ME|CHANGE_ME|CHANGEME|EXAMPLE|example|<[^>]+>|\.\.\.|0|1|\$[A-Z0-9_]+|\$\{[A-Z0-9_]+\})$/;

function isBinary(content) {
  return content.includes(0);
}

function normalizeValue(rawValue) {
  if (!rawValue) {
    return "";
  }
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isPlaceholderValue(value) {
  if (placeholderValueRegex.test(value)) {
    return true;
  }
  if (/^\$[A-Z0-9_]+$/.test(value)) {
    return true;
  }
  if (/^\$\{[A-Z0-9_]+(?::-[^}]*)?\}$/.test(value)) {
    return true;
  }
  if (value.startsWith("http://127.0.0.1:54321")) {
    return true;
  }
  if (value.startsWith("YOUR_LOCAL_")) {
    return true;
  }
  return false;
}

const findings = [];

for (const filePath of trackedFiles) {
  const raw = readFileSync(filePath);
  if (isBinary(raw)) {
    continue;
  }
  const text = raw.toString(TEXT_FILE_ENCODING);
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const line = lines[i];

    for (const pattern of secretRegexes) {
      if (pattern.regex.test(line)) {
        findings.push({ filePath, lineNumber, reason: pattern.label });
      }
    }

    const envMatch = line.match(envAssignRegex);
    if (envMatch) {
      const rawValue = envMatch[2] ?? envMatch[3] ?? envMatch[4] ?? envMatch[5] ?? "";
      const normalized = normalizeValue(rawValue);
      if (normalized.length >= 12 && !isPlaceholderValue(normalized)) {
        findings.push({ filePath, lineNumber, reason: `${envMatch[1]} has a non-placeholder value` });
      }
    }

    if (serviceRoleJwtRegex.test(line) && jwtLikeRegex.test(line)) {
      findings.push({ filePath, lineNumber, reason: "service_role context with JWT-like value" });
    }
  }
}

if (findings.length > 0) {
  console.error("ERROR: Possible secret detected. Remove it before submission.");
  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.lineNumber}: ${finding.reason}`);
  }
  process.exit(1);
}

console.log("Secret scan: no suspicious tokens found in tracked files.");
