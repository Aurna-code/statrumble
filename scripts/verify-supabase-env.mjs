import assert from "node:assert/strict";
import {
  SUPABASE_ENV_ERROR_CODE,
  getSupabaseEnvStatus,
  isSupabaseEnvError,
  requireSupabaseEnv,
} from "../statrumble/lib/supabase/env.ts";

const validSource = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.localanonkey",
};

const validStatus = getSupabaseEnvStatus(validSource, "test");
assert.equal(validStatus.ok, true, "valid env should pass");
assert.deepEqual(validStatus.missing, [], "valid env should have no missing keys");
assert.deepEqual(validStatus.invalid, [], "valid env should have no invalid keys");
assert.equal(requireSupabaseEnv("test", validSource).supabaseUrl, validSource.NEXT_PUBLIC_SUPABASE_URL);

const missingUrlStatus = getSupabaseEnvStatus(
  {
    NEXT_PUBLIC_SUPABASE_URL: " ",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: validSource.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  "test",
);
assert.equal(missingUrlStatus.ok, false, "blank Supabase URL should fail");
assert.deepEqual(missingUrlStatus.missing, ["NEXT_PUBLIC_SUPABASE_URL"]);
assert.ok(
  missingUrlStatus.message.includes("NEXT_PUBLIC_SUPABASE_URL"),
  "missing env message should include the missing key",
);

const invalidUrlStatus = getSupabaseEnvStatus(
  {
    NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: validSource.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  "test",
);
assert.equal(invalidUrlStatus.ok, false, "invalid Supabase URL should fail");
assert.deepEqual(invalidUrlStatus.invalid, ["NEXT_PUBLIC_SUPABASE_URL"]);
assert.equal(invalidUrlStatus.missing.length, 0);

assert.throws(
  () =>
    requireSupabaseEnv("test", {
      NEXT_PUBLIC_SUPABASE_URL: validSource.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    }),
  (error) => {
    assert.ok(isSupabaseEnvError(error), "requireSupabaseEnv should throw a tagged Supabase env error");
    assert.ok(error instanceof Error, "thrown value should be an Error");
    assert.ok(error.message.includes(SUPABASE_ENV_ERROR_CODE), "error message should carry the shared error code");
    assert.ok(error.message.includes("/setup"), "error message should point to setup diagnostics");
    return true;
  },
);

console.log("verify-supabase-env: OK");
