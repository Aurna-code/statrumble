"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VoteLabels, VoteStance } from "@/lib/voteProfile";

type ThreadVoteSettingsProps = {
  threadId: string;
  isOwner: boolean;
  initialPrompt: string;
  initialLabels: VoteLabels;
  initialHasVotes?: boolean;
};

type SaveThreadVoteProfileResponse = {
  ok: boolean;
  error?: string;
};

const STANCES: VoteStance[] = ["A", "B", "C"];

function normalizeLabel(value: string): string {
  return value.trim();
}

export default function ThreadVoteSettings({
  threadId,
  isOwner,
  initialPrompt,
  initialLabels,
  initialHasVotes = false,
}: ThreadVoteSettingsProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [labels, setLabels] = useState<VoteLabels>({
    A: initialLabels.A,
    B: initialLabels.B,
    C: initialLabels.C,
  });
  const [resetVotes, setResetVotes] = useState(false);
  const [hasVotes, setHasVotes] = useState(initialHasVotes);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = !isOwner || saving;

  useEffect(() => {
    setPrompt(initialPrompt);
    setLabels({
      A: initialLabels.A,
      B: initialLabels.B,
      C: initialLabels.C,
    });
    setResetVotes(false);
    setHasVotes(initialHasVotes);
    setSavedMessage(null);
    setError(null);
  }, [initialHasVotes, initialLabels.A, initialLabels.B, initialLabels.C, initialPrompt, threadId]);

  function setLabel(stance: VoteStance, value: string) {
    setLabels((prev) => ({
      ...prev,
      [stance]: value,
    }));
  }

  async function onSave() {
    if (!isOwner || saving) {
      return;
    }

    const normalizedPrompt = prompt.trim();
    const normalizedLabels: VoteLabels = {
      A: normalizeLabel(labels.A),
      B: normalizeLabel(labels.B),
      C: normalizeLabel(labels.C),
    };

    if (!normalizedPrompt) {
      setError("Prompt is required.");
      setSavedMessage(null);
      return;
    }

    if (!normalizedLabels.A || !normalizedLabels.B || !normalizedLabels.C) {
      setError("All vote labels must be non-empty.");
      setSavedMessage(null);
      return;
    }

    if (hasVotes && !resetVotes) {
      setError("Votes exist. Enable Reset existing votes to change thread vote settings.");
      setSavedMessage(null);
      return;
    }

    setSaving(true);
    setSavedMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/vote-profile`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vote_prompt: normalizedPrompt,
          vote_labels: normalizedLabels,
          reset_votes: resetVotes,
        }),
      });
      const payload = (await response.json()) as SaveThreadVoteProfileResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to save thread vote settings.");
      }

      if (resetVotes) {
        setHasVotes(false);
        setResetVotes(false);
      }

      setSavedMessage("Saved.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown save error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold">Thread vote settings</h2>
      <p className="mt-1 text-sm text-zinc-600">
        This thread uses a snapshot of the vote prompt and labels. Owners may edit; changing after votes exist requires reset.
      </p>
      {!isOwner ? <p className="mt-2 text-xs text-zinc-500">Only owners can edit.</p> : null}

      <div className="mt-4">
        <label htmlFor="thread-vote-prompt" className="block text-xs font-medium text-zinc-600">
          Prompt
        </label>
        <input
          id="thread-vote-prompt"
          type="text"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {STANCES.map((stance) => (
          <div key={stance}>
            <label htmlFor={`thread-vote-label-${stance}`} className="block text-xs font-medium text-zinc-600">
              {stance} label
            </label>
            <input
              id={`thread-vote-label-${stance}`}
              type="text"
              value={labels[stance]}
              onChange={(event) => setLabel(stance, event.target.value)}
              disabled={disabled}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={resetVotes}
            onChange={(event) => setResetVotes(event.target.checked)}
            disabled={disabled || !hasVotes}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed"
          />
          Reset existing votes
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          {hasVotes
            ? "Votes already exist on this thread. Enable reset to apply new vote semantics."
            : "No existing votes were detected for this thread."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={disabled}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {savedMessage ? <p className="text-xs text-emerald-700">{savedMessage}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
