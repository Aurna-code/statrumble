"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const next = searchParams.get("next") ?? "/";
    return next.startsWith("/") ? next : "/";
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Magic link를 전송했습니다. 이메일에서 링크를 열어 로그인하세요.");
    setIsSubmitting(false);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-zinc-600">Supabase Email OTP (Magic Link) 로그인</p>

      <div className="mt-6 max-w-md rounded-lg border border-zinc-200 bg-white p-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-zinc-800" htmlFor="email">
            Email
          </label>
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        {successMessage ? (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}
      </div>
    </main>
  );
}
