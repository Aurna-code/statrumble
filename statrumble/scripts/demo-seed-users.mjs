import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_DEMO_USERS,
  createAdminClient,
  ensureDeterministicDemoUsers,
  requireLocalSupabaseStatus,
  signInWithDemoPassword,
} from "./local-demo-auth.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const localSupabase = await requireLocalSupabaseStatus(appDir);
  const adminClient = createAdminClient(localSupabase);

  await ensureDeterministicDemoUsers(adminClient);

  for (const user of LOCAL_DEMO_USERS) {
    await signInWithDemoPassword(localSupabase, user);
  }

  console.log("Deterministic local demo users are ready.");
  console.log("Rerun is safe: existing users are updated in place.");

  for (const user of LOCAL_DEMO_USERS) {
    console.log(`- ${user.label}: ${user.email} / ${user.password}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
