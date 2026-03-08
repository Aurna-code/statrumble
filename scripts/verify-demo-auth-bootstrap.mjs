import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPackageJson = JSON.parse(await readFile(path.join(rootDir, "statrumble", "package.json"), "utf8"));
const loginPage = await readFile(path.join(rootDir, "statrumble", "app", "login", "page.tsx"), "utf8");
const rootEnvExample = await readFile(path.join(rootDir, ".env.example"), "utf8");
const appEnvExample = await readFile(path.join(rootDir, "statrumble", ".env.example"), "utf8");
const { LOCAL_DEMO_USERS } = await import(
  pathToFileURL(path.join(rootDir, "statrumble", "scripts", "local-demo-auth.mjs")).href
);

assert.equal(appPackageJson.scripts["demo:seed-users"], "node scripts/demo-seed-users.mjs");
assert(loginPage.includes('const DEV_PASSWORD_LOGIN_ENABLED = process.env.NEXT_PUBLIC_DEV_PASSWORD_LOGIN === "1";'));
assert(!loginPage.includes('process.env.NODE_ENV === "development"'));
assert(rootEnvExample.includes("NEXT_PUBLIC_DEV_PASSWORD_LOGIN=0"));
assert(appEnvExample.includes("NEXT_PUBLIC_DEV_PASSWORD_LOGIN=0"));
assert.equal(LOCAL_DEMO_USERS.length, 2);
assert.deepEqual(
  LOCAL_DEMO_USERS.map((user) => user.email),
  ["demo-a@local.statrumble.test", "demo-b@local.statrumble.test"],
);
assert(LOCAL_DEMO_USERS.every((user) => user.password.startsWith("StatRumbleLocal")));

console.log("verify-demo-auth-bootstrap: OK");
