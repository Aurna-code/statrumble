"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace/active";

type JoinResponse = {
  ok: boolean;
  error?: string;
  workspace_id?: string;
};

export default function JoinPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspaces/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: inviteCode.trim().toUpperCase(),
        }),
      });
      const payload = (await response.json()) as JoinResponse;

      if (!response.ok || !payload.ok) {
        setErrorMessage(payload.error ?? "Join failed.");
        setIsSubmitting(false);
        return;
      }

      if (payload.workspace_id) {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, payload.workspace_id);
      }

      router.push("/workspaces");
      router.refresh();
    } catch {
      setErrorMessage("Network error.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Join Workspace</h1>
      <p className="mt-2 text-sm text-zinc-600">Enter an invite code to join the workspace.</p>

      <section className="mt-6 max-w-md rounded-lg border border-zinc-200 bg-white p-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-zinc-800" htmlFor="invite-code">
            Invite code
          </label>
          <input
            id="invite-code"
            name="invite-code"
            type="text"
            required
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono uppercase outline-none ring-0 transition focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Joining..." : "Join workspace"}
          </button>
        </form>
        {errorMessage ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
