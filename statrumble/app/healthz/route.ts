import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demoMode";
import {
  SUPABASE_PUBLIC_ENV_KEYS,
  getSupabaseEnvStatus,
  readSupabaseEnvSource,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseEnv = getSupabaseEnvStatus(readSupabaseEnvSource(), "health check");

  return NextResponse.json(
    {
      ok: supabaseEnv.ok,
      service: "statrumble",
      checks: {
        supabase_env: {
          ok: supabaseEnv.ok,
          missing: supabaseEnv.missing,
          invalid: supabaseEnv.invalid,
          required: SUPABASE_PUBLIC_ENV_KEYS,
        },
      },
      mode: {
        demo: isDemoMode(),
      },
    },
    {
      status: supabaseEnv.ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
