"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error.message?.trim() ? error.message : "Unknown error.";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-600">An unexpected error occurred while loading this page.</p>
        <p className="mt-2 text-xs text-zinc-500">{message}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Try again
          </button>
          <Link
            href="/portal"
            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Back to Portal
          </Link>
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
