"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberWorkspaceSummary } from "@/lib/db/workspaces";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace/active";

type WorkspaceSwitcherProps = {
  workspaces: MemberWorkspaceSummary[];
  activeWorkspaceId: string;
};

type SetActiveWorkspaceResponse = {
  ok: boolean;
  workspace_id?: string;
  error?: string;
};

export default function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(activeWorkspaceId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const onSelectWorkspace = useCallback(async (nextWorkspaceId: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: nextWorkspaceId,
        }),
      });
      const payload = (await response.json()) as SetActiveWorkspaceResponse;

      if (!response.ok || !payload.ok || !payload.workspace_id) {
        setErrorMessage(payload.error ?? "Failed to switch workspace.");
        setSelectedWorkspaceId(activeWorkspaceId);
        return;
      }

      setSelectedWorkspaceId(payload.workspace_id);
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, payload.workspace_id);
      router.refresh();
    } catch {
      setErrorMessage("Network error.");
      setSelectedWorkspaceId(activeWorkspaceId);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeWorkspaceId, router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const persisted = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    const exists = persisted && workspaces.some((workspace) => workspace.id === persisted);

    if (!persisted || !exists) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspaceId);
      return;
    }

    if (persisted !== activeWorkspaceId) {
      void onSelectWorkspace(persisted);
    }
  }, [activeWorkspaceId, onSelectWorkspace, workspaces]);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="workspace-switcher" className="text-zinc-500">
        Workspace
      </label>
      <select
        id="workspace-switcher"
        value={selectedWorkspaceId}
        onChange={(event) => {
          const nextWorkspaceId = event.target.value;
          setSelectedWorkspaceId(nextWorkspaceId);
          void onSelectWorkspace(nextWorkspaceId);
        }}
        disabled={isSubmitting}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  );
}
