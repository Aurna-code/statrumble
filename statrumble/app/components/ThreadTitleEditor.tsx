"use client";

import { useState } from "react";

type ThreadTitleEditorProps = {
  threadId: string;
  initialTitle: string;
};

type UpdateTitleApiResponse = {
  ok?: boolean;
  title?: string;
  error?: string;
};

const MAX_TITLE_LENGTH = 120;

export default function ThreadTitleEditor({ threadId, initialTitle }: ThreadTitleEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (saving) {
      return;
    }

    const nextTitle = draft.trim();

    if (!nextTitle) {
      setError("Title is required.");
      return;
    }

    if (nextTitle.length > MAX_TITLE_LENGTH) {
      setError(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/title`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: nextTitle }),
      });
      const payload = (await response.json()) as UpdateTitleApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update title.");
      }

      const resolvedTitle = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : nextTitle;
      setTitle(resolvedTitle);
      setDraft(resolvedTitle);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (saving) {
      return;
    }

    setDraft(title);
    setError(null);
    setEditing(false);
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(title);
              setEditing(true);
              setError(null);
            }}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Edit title
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={saving}
            maxLength={MAX_TITLE_LENGTH}
            className="w-full max-w-2xl rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
            placeholder="Enter thread title"
          />
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
