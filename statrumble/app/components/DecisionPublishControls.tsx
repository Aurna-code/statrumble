"use client";

import { useState } from "react";

type DecisionPublishControlsProps = {
  decisionId: string;
  initialIsPublic: boolean;
  initialPublicId: string | null;
};

type PublishApiResponse = {
  ok: boolean;
  publicId?: string | null;
  isPublic?: boolean;
  publicUrl?: string | null;
  error?: string;
};

export default function DecisionPublishControls({
  decisionId,
  initialIsPublic,
  initialPublicId,
}: DecisionPublishControlsProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [publicUrl, setPublicUrl] = useState<string | null>(
    initialPublicId ? `/p/decisions/${initialPublicId}` : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle() {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/decisions/${decisionId}/publish`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ public: !isPublic }),
      });
      const payload = (await response.json()) as PublishApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update publish status.");
      }

      setIsPublic(Boolean(payload.isPublic));
      setPublicUrl(payload.publicUrl ?? (payload.publicId ? `/p/decisions/${payload.publicId}` : null));
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
      setError("복사에 실패했습니다.");
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Public Portal</p>
          <p className="text-xs text-zinc-600">
            {isPublic ? "공개 상태입니다." : "비공개 상태입니다."}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={saving}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중..." : isPublic ? "Unpublish" : "Publish"}
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

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
