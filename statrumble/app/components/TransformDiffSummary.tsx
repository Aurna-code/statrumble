"use client";

import { useState } from "react";

type CodexDiffSummary = {
  summary: string;
  key_diffs: string[];
  risks: string[];
  recommendation: string;
};

type TransformDiffSummaryProps = {
  threadId: string;
  initialSummary: CodexDiffSummary | null;
};

type SummarizeDiffApiResponse = {
  ok?: boolean;
  error?: string;
  codex_summary?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: string[] = [];

  for (const entry of value) {
    const text = asNonEmptyString(entry);

    if (!text) {
      return null;
    }

    items.push(text);
  }

  return items;
}

function parseSummary(value: unknown): CodexDiffSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summary = asNonEmptyString(record.summary);
  const keyDiffs = asStringArray(record.key_diffs);
  const risks = asStringArray(record.risks);
  const recommendation = asNonEmptyString(record.recommendation);

  if (!summary || !keyDiffs || !risks || !recommendation) {
    return null;
  }

  return {
    summary,
    key_diffs: keyDiffs,
    risks,
    recommendation,
  };
}

export default function TransformDiffSummary({ threadId, initialSummary }: TransformDiffSummaryProps) {
  const [summary, setSummary] = useState<CodexDiffSummary | null>(initialSummary);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function summarizeDiff() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/summarize-diff`, {
        method: "POST",
        cache: "no-store",
      });

      let payload: SummarizeDiffApiResponse = {};

      try {
        payload = (await response.json()) as SummarizeDiffApiResponse;
      } catch {
        payload = {};
      }

      const nextSummary = parseSummary(payload.codex_summary);

      if (!response.ok || !payload.ok || !nextSummary) {
        setError(payload.error ?? "Failed to summarize diff.");
        return;
      }

      setSummary(nextSummary);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (summary) {
    return (
      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Codex Collaboration Summary</p>
        <p className="mt-1 leading-relaxed">{summary.summary}</p>

        <p className="mt-3 font-medium text-emerald-800">Key diffs</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {summary.key_diffs.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="mt-3 font-medium text-emerald-800">Risks</p>
        {summary.risks.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {summary.risks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">No major risks flagged.</p>
        )}

        <p className="mt-3 font-medium text-emerald-800">Recommendation</p>
        <p className="mt-1 leading-relaxed">{summary.recommendation}</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={summarizeDiff}
        disabled={submitting}
        className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Summarizing..." : "Summarize this diff with Codex"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
