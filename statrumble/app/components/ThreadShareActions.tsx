"use client";

import Link from "next/link";
import { useState } from "react";

type ThreadShareActionsProps = {
  threadId: string;
  backHref: string;
};

type CopyTarget = "link" | "id" | null;

export default function ThreadShareActions({ threadId, backHref }: ThreadShareActionsProps) {
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [error, setError] = useState<string | null>(null);

  async function copyText(value: string, target: Exclude<CopyTarget, null>) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setError(null);

      window.setTimeout(() => {
        setCopied((prev) => (prev === target ? null : prev));
      }, 1500);
    } catch {
      try {
        window.prompt("Copy:", value);
      } catch {
        // no-op: keep inline error message below
      }
      setError("Clipboard access failed. Use the prompt to copy manually.");
    }
  }

  async function onCopyLink() {
    await copyText(window.location.href, "link");
  }

  async function onCopyId() {
    await copyText(threadId, "id");
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Link
        href={backHref}
        className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
      >
        Back to Arena
      </Link>
      <Link
        href="/threads"
        className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
      >
        Back to Threads
      </Link>
      <button
        type="button"
        onClick={onCopyLink}
        className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
      >
        {copied === "link" ? "Link copied" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={onCopyId}
        className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
      >
        {copied === "id" ? "ID copied" : "Copy ID"}
      </button>
      {error ? <p className="basis-full text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
