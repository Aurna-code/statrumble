"use client";

import Link from "next/link";
import { useEffect } from "react";
import SetupDiagnosticsPanel from "@/app/components/SetupDiagnosticsPanel";
import {
  getSupabaseEnvStatus,
  isSupabaseEnvError,
  readSupabaseEnvSource,
} from "@/lib/supabase/env";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isSetupError = isSupabaseEnvError(error);
  const supabaseEnv = getSupabaseEnvStatus(readSupabaseEnvSource(), "error boundary");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{isSetupError ? "Supabase setup incomplete" : "Something went wrong"}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {isSetupError
            ? "StatRumble could not initialize a Supabase client for this page."
            : "An unexpected error occurred while loading this page."}
        </p>
        <p className="mt-2 text-xs text-zinc-500">{error.message || "Unknown error"}</p>
        {isSetupError ? (
          <div className="mt-5">
            <SetupDiagnosticsPanel
              status={supabaseEnv}
              title="Required configuration"
              description="Fix the missing or invalid Supabase environment variables, then retry the page."
            />
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Try again
          </button>
          <Link
            href="/portal"
            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Back to Portal
          </Link>
          {isSetupError ? (
            <Link
              href="/setup"
              className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Open Setup
            </Link>
          ) : null}
          <Link
            href="/#chart"
            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Back to Arena
          </Link>
        </div>
      </section>
    </main>
  );
}
