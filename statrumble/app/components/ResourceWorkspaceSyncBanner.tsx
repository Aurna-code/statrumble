"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace/active";

type SetActiveWorkspaceResponse = {
  ok: boolean;
  workspace_id?: string;
  error?: string;
};

type ResourceWorkspaceSyncBannerProps = {
  activeWorkspaceId: string | null;
  resourceWorkspaceId: string;
  resourceWorkspaceName?: string | null;
  resourceLabel: "thread" | "decision";
};

function getWorkspaceLabel(resourceWorkspaceName?: string | null) {
  const trimmed = resourceWorkspaceName?.trim();
  return trimmed && trimmed.length > 0 ? `"${trimmed}"` : "this workspace";
}

export default function ResourceWorkspaceSyncBanner({
  activeWorkspaceId,
  resourceWorkspaceId,
  resourceWorkspaceName = null,
  resourceLabel,
}: ResourceWorkspaceSyncBannerProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const needsSync = activeWorkspaceId !== resourceWorkspaceId;

  useEffect(() => {
    if (!needsSync) {
      return;
    }

    let cancelled = false;

    async function syncWorkspaceContext() {
      setIsSyncing(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/workspaces/active", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: resourceWorkspaceId,
          }),
        });
        const payload = (await response.json()) as SetActiveWorkspaceResponse;

        if (!response.ok || !payload.ok || !payload.workspace_id) {
          throw new Error(payload.error ?? "Failed to switch workspace.");
        }

        if (cancelled) {
          return;
        }

        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, payload.workspace_id);
        router.refresh();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to switch workspace.");
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    }

    void syncWorkspaceContext();

    return () => {
      cancelled = true;
    };
  }, [needsSync, resourceWorkspaceId, router, syncAttempt]);

  if (!needsSync) {
    return null;
  }

  return (
    <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">Workspace context mismatch</h2>
      {!errorMessage ? (
        <p className="mt-2 text-sm text-amber-800">
          This {resourceLabel} belongs to {getWorkspaceLabel(resourceWorkspaceName)}. Updating active workspace context.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-amber-800">
            This {resourceLabel} belongs to {getWorkspaceLabel(resourceWorkspaceName)}. Automatic workspace switching failed:
            {" "}
            {errorMessage}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncAttempt((current) => current + 1)}
              disabled={isSyncing}
              className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSyncing ? "Switching..." : "Retry switch"}
            </button>
            <Link
              href="/workspaces"
              className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900 transition hover:bg-amber-100"
            >
              Open workspaces
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
