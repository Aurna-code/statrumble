import {
  readRefereeReport,
  type RefereeReport,
} from "../referee/schema";

export const PROMOTE_REQUIRES_JUDGE_MESSAGE = "Run Judge before promoting this thread.";

export function getPromotableRefereeReport(report: unknown): { report: RefereeReport; summary: string } | null {
  const parsed = readRefereeReport(report);

  if (!parsed) {
    return null;
  }

  const summary = parsed.tldr.trim();

  if (summary.length === 0) {
    return null;
  }

  return {
    report: parsed,
    summary,
  };
}

export function getPromoteAvailability(params: {
  decisionId: string | null;
  refereeReport: unknown;
}) {
  if (params.decisionId) {
    return {
      canPromote: false,
      reason: null as string | null,
    };
  }

  const promotable = getPromotableRefereeReport(params.refereeReport);

  if (!promotable) {
    return {
      canPromote: false,
      reason: PROMOTE_REQUIRES_JUDGE_MESSAGE,
    };
  }

  return {
    canPromote: true,
    reason: null as string | null,
  };
}
