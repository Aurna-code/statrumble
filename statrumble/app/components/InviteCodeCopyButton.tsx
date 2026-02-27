"use client";

import { useState } from "react";

type InviteCodeCopyButtonProps = {
  inviteCode: string;
};

export default function InviteCodeCopyButton({ inviteCode }: InviteCodeCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setError(null);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setError("Failed to copy.");
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
      >
        {copied ? "Copied" : "Copy invite code"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
