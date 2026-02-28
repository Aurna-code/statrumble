import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function NotFound() {
  let isAuthenticated = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  } catch {
    isAuthenticated = false;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-zinc-600">The page you requested could not be found.</p>
        <div className="mt-5 flex flex-wrap gap-3">
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
          {isAuthenticated ? (
            <Link
              href="/threads"
              className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Back to Threads
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
