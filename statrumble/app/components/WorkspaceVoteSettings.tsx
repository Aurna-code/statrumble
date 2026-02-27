"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resolveVoteProfileConfig,
  type VoteLabels,
  type VoteProfileConfig,
  type VoteProfileKind,
  type VoteStance,
} from "@/lib/voteProfile";

type WorkspaceVoteSettingsProps = {
  workspaceId: string;
  isOwner: boolean;
  initialConfig: VoteProfileConfig | null;
};

type SaveVoteProfileResponse = {
  ok: boolean;
  error?: string;
};

const KIND_SECTIONS: { kind: VoteProfileKind; title: string }[] = [
  { kind: "discussion", title: "Discussion threads" },
  { kind: "transform_proposal", title: "Transform proposals" },
];

const STANCES: VoteStance[] = ["A", "B", "C"];

export default function WorkspaceVoteSettings({ workspaceId, isOwner, initialConfig }: WorkspaceVoteSettingsProps) {
  const [config, setConfig] = useState<VoteProfileConfig>(() => resolveVoteProfileConfig(initialConfig));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = !isOwner || saving;
  const helperText = useMemo(
    () => (isOwner ? "Define vote prompt and A/B/C labels for each thread kind." : "Only owners can edit these settings."),
    [isOwner],
  );

  useEffect(() => {
    setConfig(resolveVoteProfileConfig(initialConfig));
    setSaveMessage(null);
    setError(null);
  }, [initialConfig, workspaceId]);

  function setPrompt(kind: VoteProfileKind, value: string) {
    setConfig((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        prompt: value,
      },
    }));
  }

  function setLabel(kind: VoteProfileKind, stance: VoteStance, value: string) {
    setConfig((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        labels: {
          ...prev[kind].labels,
          [stance]: value,
        } as VoteLabels,
      },
    }));
  }

  async function onSave() {
    if (!isOwner || saving) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/workspaces/vote-profile", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          config,
        }),
      });
      const payload = (await response.json()) as SaveVoteProfileResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to save vote profile.");
      }

      setSaveMessage("Saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown save error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">Vote settings</h2>
        <p className="mt-1 text-sm text-zinc-600">{helperText}</p>
      </div>

      <div className="mt-4 space-y-4">
        {KIND_SECTIONS.map((section) => (
          <section key={section.kind} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold text-zinc-900">{section.title}</h3>

            <div className="mt-3">
              <label className="block text-xs font-medium text-zinc-600" htmlFor={`${section.kind}-prompt`}>
                Prompt
              </label>
              <input
                id={`${section.kind}-prompt`}
                type="text"
                value={config[section.kind].prompt}
                onChange={(event) => setPrompt(section.kind, event.target.value)}
                disabled={disabled}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {STANCES.map((stance) => (
                <div key={`${section.kind}-${stance}`}>
                  <label
                    className="block text-xs font-medium text-zinc-600"
                    htmlFor={`${section.kind}-label-${stance}`}
                  >
                    {stance} label
                  </label>
                  <input
                    id={`${section.kind}-label-${stance}`}
                    type="text"
                    value={config[section.kind].labels[stance]}
                    onChange={(event) => setLabel(section.kind, stance, event.target.value)}
                    disabled={disabled}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
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
        {saveMessage ? <p className="text-xs text-emerald-700">{saveMessage}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
