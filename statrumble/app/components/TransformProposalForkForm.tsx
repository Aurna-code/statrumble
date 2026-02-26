"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type TransformProposalForkFormProps = {
  importId: string;
  parentThreadId: string;
};

type ProposeTransformApiResponse = {
  thread_id?: string;
  ok?: boolean;
  error?: string;
  details?: {
    issues?: Array<{ path?: Array<string | number>; message?: string }>;
  };
};

type ValidationIssue = {
  path: string;
  message: string;
};

function normalizeIssues(payload: ProposeTransformApiResponse | null): ValidationIssue[] {
  const issuesRaw = payload?.details?.issues;

  if (!Array.isArray(issuesRaw)) {
    return [];
  }

  return issuesRaw
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.map((segment) => String(segment)).join(".") : "";
      const message = typeof issue.message === "string" ? issue.message : "Invalid value.";

      return {
        path: path.length > 0 ? path : "(root)",
        message,
      };
    })
    .filter((issue) => issue.message.length > 0);
}

export default function TransformProposalForkForm({ importId, parentThreadId }: TransformProposalForkFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const normalizedPrompt = prompt.trim();

    if (!normalizedPrompt) {
      setError("Prompt is required.");
      setIssues([]);
      return;
    }

    setSubmitting(true);
    setError(null);
    setIssues([]);

    try {
      const response = await fetch("/api/threads/propose-transform", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          import_id: importId,
          prompt: normalizedPrompt,
          parent_thread_id: parentThreadId,
        }),
      });

      const payload = (await response.json()) as ProposeTransformApiResponse;
      const threadId = typeof payload.thread_id === "string" ? payload.thread_id : null;

      if (!response.ok || !threadId) {
        setError(payload.error ?? "Failed to create fork proposal.");
        setIssues(normalizeIssues(payload));
        return;
      }

      router.push(`/threads/${threadId}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown error");
      setIssues([]);
    } finally {
      setSubmitting(false);
    }
  }

  function onCancel() {
    if (submitting) {
      return;
    }

    setOpen(false);
    setPrompt("");
    setError(null);
    setIssues([]);
  }

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={submitting}
        className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {open ? "Close Fork" : "Fork"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-2 rounded-md border border-emerald-200 bg-white p-3">
          <label htmlFor="fork-prompt" className="block text-xs font-medium text-zinc-600">
            New prompt
          </label>
          <textarea
            id="fork-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            disabled={submitting}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
            placeholder="Describe how this child proposal should refine the parent transform."
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={submitting || !importId.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create Fork"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {issues.length > 0 ? (
            <ul className="space-y-1 text-xs text-red-600">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
