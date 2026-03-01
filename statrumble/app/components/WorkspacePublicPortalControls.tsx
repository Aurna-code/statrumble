"use client";

import { useMemo, useState } from "react";

type WorkspacePublicPortalControlsProps = {
  workspaceId: string;
  workspaceName: string;
  initialProfile:
    | {
        slug: string;
        is_public: boolean;
        public_at: string | null;
      }
    | null;
  onStatusChange?: (isPublic: boolean) => void;
};

type PublishApiResponse = {
  ok: boolean;
  slug?: string | null;
  isPublic?: boolean;
  publicAt?: string | null;
  publicUrl?: string | null;
  error?: string;
};

export default function WorkspacePublicPortalControls({
  workspaceId,
  workspaceName,
  initialProfile,
  onStatusChange,
}: WorkspacePublicPortalControlsProps) {
  const [isPublic, setIsPublic] = useState(Boolean(initialProfile?.is_public));
  const [publicUrl, setPublicUrl] = useState<string | null>(
    initialProfile?.slug ? `/p/w/${initialProfile.slug}` : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    return isPublic ? "Currently public." : "Currently private.";
  }, [isPublic]);

  async function onToggle() {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        public: !isPublic,
      };

      if (!isPublic) {
        body.displayName = workspaceName;
      }

      const response = await fetch(`/api/workspaces/${workspaceId}/publish`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as PublishApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update publish status.");
      }

      const nextIsPublic = Boolean(payload.isPublic);
      const nextPublicUrl = payload.publicUrl ?? (payload.slug ? `/p/w/${payload.slug}` : null);

      setIsPublic(nextIsPublic);
      setPublicUrl(nextPublicUrl);
      onStatusChange?.(nextIsPublic);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown publish error");
    } finally {
      setSaving(false);
    }
  }

  async function onCopy() {
    if (!publicUrl) {
      return;
    }

    const fullUrl = `${window.location.origin}${publicUrl}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      setError("Copy failed.");
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Workspace Public Portal</p>
          <p className="text-xs text-zinc-600">{statusLabel}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={saving}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : isPublic ? "Unpublish" : "Publish"}
        </button>
      </div>

      {isPublic && publicUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span>URL:</span>
          <code className="rounded bg-white px-2 py-1 text-xs text-zinc-900">{publicUrl}</code>
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-900 transition hover:bg-white"
          >
            Copy
          </button>
        </div>
      ) : null}

      {!isPublic ? (
        <p className="mt-2 text-xs text-zinc-600">When unpublished, the public URL returns 404.</p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
