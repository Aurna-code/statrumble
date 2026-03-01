"use client";

import { useEffect, useState } from "react";
import {
  getDefaultVoteProfile,
  resolveVoteProfileFromConfig,
  type VoteLabels,
  type VoteProfileKind,
} from "@/lib/voteProfile";

type WorkspaceVoteSettingsProps = {
  workspaceId: string;
  isOwner: boolean;
  initialConfig: unknown | null;
};

type SaveWorkspaceVoteProfileResponse = {
  ok?: boolean;
  error?: string;
};

type EditableVoteProfile = {
  prompt: string;
  labels: VoteLabels;
};

function resolveEditableProfile(config: unknown | null, kind: VoteProfileKind): EditableVoteProfile {
  const resolved = resolveVoteProfileFromConfig(config, kind) ?? getDefaultVoteProfile(kind);

  return {
    prompt: resolved.prompt,
    labels: {
      A: resolved.labels.A,
      B: resolved.labels.B,
      C: resolved.labels.C,
    },
  };
}

export default function WorkspaceVoteSettings({ workspaceId, isOwner, initialConfig }: WorkspaceVoteSettingsProps) {
  const [discussion, setDiscussion] = useState<EditableVoteProfile>(() =>
    resolveEditableProfile(initialConfig, "discussion"),
  );
  const [transformProposal, setTransformProposal] = useState<EditableVoteProfile>(() =>
    resolveEditableProfile(initialConfig, "transform_proposal"),
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDiscussion(resolveEditableProfile(initialConfig, "discussion"));
    setTransformProposal(resolveEditableProfile(initialConfig, "transform_proposal"));
    setSaveMessage(null);
    setErrorMessage(null);
  }, [initialConfig, workspaceId]);

  async function onSave() {
    if (!isOwner || saving) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/vote-profile`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: {
            discussion: {
              prompt: discussion.prompt,
              labels: {
                A: discussion.labels.A,
                B: discussion.labels.B,
                C: discussion.labels.C,
              },
            },
            transform_proposal: {
              prompt: transformProposal.prompt,
              labels: {
                A: transformProposal.labels.A,
                B: transformProposal.labels.B,
                C: transformProposal.labels.C,
              },
            },
          },
        }),
      });
      const payload = (await response.json()) as SaveWorkspaceVoteProfileResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to save vote settings.");
      }

      setSaveMessage("Saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setSaving(false);
    }
  }

  const disabled = !isOwner || saving;

  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Vote settings</summary>
      <div className="mt-3 space-y-4">
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Discussion threads</h3>
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-zinc-700">
              Prompt
              <input
                type="text"
                value={discussion.prompt}
                onChange={(event) =>
                  setDiscussion((prev) => ({
                    ...prev,
                    prompt: event.target.value,
                  }))
                }
                disabled={disabled}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["A", "B", "C"] as const).map((stance) => (
                <label key={stance} className="block text-xs font-medium text-zinc-700">
                  Label {stance}
                  <input
                    type="text"
                    value={discussion.labels[stance]}
                    onChange={(event) =>
                      setDiscussion((prev) => ({
                        ...prev,
                        labels: {
                          ...prev.labels,
                          [stance]: event.target.value,
                        },
                      }))
                    }
                    disabled={disabled}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Transform proposals</h3>
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-zinc-700">
              Prompt
              <input
                type="text"
                value={transformProposal.prompt}
                onChange={(event) =>
                  setTransformProposal((prev) => ({
                    ...prev,
                    prompt: event.target.value,
                  }))
                }
                disabled={disabled}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["A", "B", "C"] as const).map((stance) => (
                <label key={stance} className="block text-xs font-medium text-zinc-700">
                  Label {stance}
                  <input
                    type="text"
                    value={transformProposal.labels[stance]}
                    onChange={(event) =>
                      setTransformProposal((prev) => ({
                        ...prev,
                        labels: {
                          ...prev.labels,
                          [stance]: event.target.value,
                        },
                      }))
                    }
                    disabled={disabled}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!isOwner || saving}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saveMessage ? <p className="text-xs text-emerald-700">{saveMessage}</p> : null}
          {errorMessage ? <p className="text-xs text-red-700">{errorMessage}</p> : null}
        </div>

        {!isOwner ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Only workspace owners can edit vote settings.
          </p>
        ) : null}
      </div>
    </details>
  );
}
