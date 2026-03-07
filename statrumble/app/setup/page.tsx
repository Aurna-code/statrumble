import SetupDiagnosticsPanel from "@/app/components/SetupDiagnosticsPanel";
import { isDemoMode } from "@/lib/demoMode";
import { getSupabaseEnvStatus, readSupabaseEnvSource } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const supabaseEnv = getSupabaseEnvStatus(readSupabaseEnvSource(), "setup diagnostics");
  const demoMode = isDemoMode();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Local Development</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Setup diagnostics</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Use this page when StatRumble boots but auth or data requests fail before reaching Supabase.
        </p>
      </div>

      <div className="mt-6">
        <SetupDiagnosticsPanel
          status={supabaseEnv}
          title="Supabase environment"
          description="This check is lightweight. It validates only the public Supabase URL and anon key required for auth and database access."
          showSetupLink={false}
        />
      </div>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Runtime status</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Demo mode: <span className="font-medium text-zinc-900">{demoMode ? "enabled" : "disabled"}</span>
          </p>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Health endpoint: <span className="font-medium text-zinc-900">/healthz</span>
          </p>
        </div>
      </section>
    </main>
  );
}
