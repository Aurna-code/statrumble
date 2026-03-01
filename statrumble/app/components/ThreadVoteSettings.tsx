"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VoteLabels } from "@/lib/voteProfile";

type ThreadVoteSettingsProps = {
  threadId: string;
  isOwner: boolean;
  initialPrompt: string;
  initialLabels: VoteLabels;
};

type UpdateThreadVoteProfileResponse = {
  ok?: boolean;
  error?: string;
};

export default function ThreadVoteSettings({
  threadId,
  isOwner,
  initialPrompt,
  initialLabels,
}: ThreadVoteSettingsProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [labels, setLabels] = useState<VoteLabels>({ ...initialLabels });
  const [resetVotes, setResetVotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(initialPrompt);
    setLabels({ ...initialLabels });
    setResetVotes(false);
    setSaveMessage(null);
    setErrorMessage(null);
  }, [initialPrompt, initialLabels, threadId]);

  async function onSave() {
    if (saving || !isOwner) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/vote-profile`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vote_prompt: prompt,
          vote_labels: labels,
          reset_votes: resetVotes,
        }),
      });
      const payload = (await response.json()) as UpdateThreadVoteProfileResponse;

      if (response.status === 409) {
        setErrorMessage("Votes already exist. Enable \"Reset existing votes\" and save again.");
        return;
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update thread vote settings.");
      }

      setSaveMessage("Saved.");
      setResetVotes(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !isOwner;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">Thread vote settings</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Thread vote settings are snapshotted at creation. Updating after votes exist requires reset.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-zinc-700">
          Prompt
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={readOnly || saving}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-3">
          {(["A", "B", "C"] as const).map((stance) => (
            <label key={stance} className="block text-xs font-medium text-zinc-700">
              Label {stance}
              <input
                type="text"
                value={labels[stance]}
                onChange={(event) =>
                  setLabels((prev) => ({
                    ...prev,
                    [stance]: event.target.value,
                  }))
                }
                disabled={readOnly || saving}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={resetVotes}
            onChange={(event) => setResetVotes(event.target.checked)}
            disabled={readOnly || saving}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed"
          />
          Reset existing votes
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={readOnly || saving}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saveMessage ? <p className="text-xs text-emerald-700">{saveMessage}</p> : null}
          {errorMessage ? <p className="text-xs text-red-700">{errorMessage}</p> : null}
        </div>

        {readOnly ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Only workspace owners can edit thread vote settings.
          </p>
        ) : null}
      </div>
    </section>
  );
}
