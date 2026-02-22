"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace/active";

type CreateWorkspaceResponse = {
  ok: boolean;
  workspace_id?: string;
  invite_code?: string;
  error?: string;
};

export default function CreateWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const normalizedName = name.trim();

    if (!normalizedName) {
      setErrorMessage("workspace name is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspaces/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
        }),
      });
      const payload = (await response.json()) as CreateWorkspaceResponse;

      if (!response.ok || !payload.ok || !payload.workspace_id) {
        setErrorMessage(payload.error ?? "Create workspace failed.");
        return;
      }

      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, payload.workspace_id);
      router.push("/");
      router.refresh();
    } catch {
      setErrorMessage("Network error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Create Workspace</h1>
      <p className="mt-2 text-sm text-zinc-600">새 워크스페이스를 만들고 owner로 시작합니다.</p>

      <section className="mt-6 max-w-md rounded-lg border border-zinc-200 bg-white p-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-zinc-800" htmlFor="workspace-name">
            Workspace name
          </label>
          <input
            id="workspace-name"
            name="workspace-name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
            placeholder="e.g. Growth Team"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating..." : "Create workspace"}
          </button>
        </form>
        {errorMessage ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
