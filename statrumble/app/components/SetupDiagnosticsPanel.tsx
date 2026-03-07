"use client";

import Link from "next/link";
import type { SupabaseEnvStatus } from "@/lib/supabase/env";

type SetupDiagnosticsPanelProps = {
  status: SupabaseEnvStatus;
  title?: string;
  description?: string;
  showSetupLink?: boolean;
};

function statusBadgeClass(status: "ok" | "missing" | "invalid") {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

export default function SetupDiagnosticsPanel({
  status,
  title = "Supabase setup diagnostics",
  description = "Local development requires a valid Supabase URL and anon key before auth or database flows can work.",
  showSetupLink = true,
}: SetupDiagnosticsPanelProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Setup</p>
      <h2 className="mt-2 text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
      <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${status.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
        {status.ok ? "Supabase environment is configured." : status.message}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {status.checks.map((check) => (
          <div key={check.name} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900">{check.name}</p>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(check.status)}`}>
                {check.message}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {check.valuePreview ? `Current value: ${check.valuePreview}` : "No value detected"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Recommended local steps</p>
        <p className="mt-2">1. Copy `statrumble/.env.example` to `statrumble/.env.local`.</p>
        <p className="mt-1">2. Run `pnpm -C statrumble exec supabase status` and paste the local anon key.</p>
        <p className="mt-1">3. Restart `pnpm -C statrumble dev` after updating the file.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {showSetupLink ? (
          <Link href="/setup" className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-900 hover:bg-zinc-100">
            Open setup page
          </Link>
        ) : null}
        <Link
          href="/healthz"
          className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-900 hover:bg-zinc-100"
        >
          Open /healthz
        </Link>
      </div>
    </section>
  );
}
