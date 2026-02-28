import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const nextDir = path.join(rootDir, "statrumble", ".next");
const candidateDirs = [path.join(nextDir, "types"), path.join(nextDir, "dev", "types")];

const generatedTypesDir = candidateDirs.find((candidateDir) => fs.existsSync(candidateDir));

if (!generatedTypesDir) {
  console.error(
    "verify-next-types: expected Next route types at statrumble/.next/types or statrumble/.next/dev/types after typecheck.",
  );
  process.exit(1);
}

console.log(`verify-next-types: OK (${path.relative(rootDir, generatedTypesDir)})`);
