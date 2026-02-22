"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAGIC_LINK_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_MESSAGE =
  "Email sending is rate-limited. Use dev password login or try later.";
const DEV_PASSWORD_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_DEV_PASSWORD_LOGIN === "1" || process.env.NODE_ENV === "development";

function getAuthErrorMessage(error: { message: string; status?: number | null }) {
  const normalizedMessage = error.message.toLowerCase();
  const isRateLimitError =
    error.status === 429 ||
    normalizedMessage.includes("email rate limit exceeded") ||
    normalizedMessage.includes("429");

  if (isRateLimitError) {
    return RATE_LIMIT_MESSAGE;
  }

  return error.message;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isMagicLinkSubmitting, setIsMagicLinkSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const next = searchParams.get("next") ?? "/";
    return next.startsWith("/") ? next : "/";
  }, [searchParams]);

  useEffect(() => {
    if (cooldownLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldownLeft((previous) => (previous <= 1 ? 0 : previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownLeft]);

  async function onSendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isMagicLinkSubmitting || cooldownLeft > 0) {
      return;
    }

    setIsMagicLinkSubmitting(true);
    setCooldownLeft(MAGIC_LINK_COOLDOWN_SECONDS);
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
      setErrorMessage(getAuthErrorMessage(error));
      setIsMagicLinkSubmitting(false);
      return;
    }

    setSuccessMessage("Magic link를 전송했습니다. 이메일에서 링크를 열어 로그인하세요.");
    setIsMagicLinkSubmitting(false);
  }

  async function onSignInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!DEV_PASSWORD_LOGIN_ENABLED || isPasswordSubmitting) {
      return;
    }

    setIsPasswordSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsPasswordSubmitting(false);
      return;
    }

    window.location.assign(nextPath);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-zinc-600">Supabase Email OTP (Magic Link) 로그인</p>

      <div className="mt-6 max-w-md rounded-lg border border-zinc-200 bg-white p-5">
        <form className="space-y-4" onSubmit={onSendMagicLink}>
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
            disabled={isMagicLinkSubmitting || cooldownLeft > 0}
            type="submit"
          >
            {isMagicLinkSubmitting
              ? "Sending..."
              : cooldownLeft > 0
                ? `Send Magic Link (${cooldownLeft}s)`
                : "Send Magic Link"}
          </button>
        </form>

        {DEV_PASSWORD_LOGIN_ENABLED ? (
          <form className="mt-6 space-y-4 border-t border-zinc-200 pt-6" onSubmit={onSignInWithPassword}>
            <label className="block text-sm font-medium text-zinc-800" htmlFor="password">
              Password
            </label>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="inline-flex items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPasswordSubmitting}
              type="submit"
            >
              {isPasswordSubmitting ? "Signing in..." : "Sign in with password"}
            </button>
          </form>
        ) : null}

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
