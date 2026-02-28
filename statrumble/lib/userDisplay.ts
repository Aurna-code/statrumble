import { shortId as shortThreadId } from "@/lib/threadLabel";

type SupabaseUserLike = {
  user_metadata?: unknown;
};

export function getDisplayNameFromUser(user: SupabaseUserLike | null | undefined): string | null {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const displayName = (metadata as { display_name?: unknown }).display_name;

  if (typeof displayName !== "string") {
    return null;
  }

  const trimmed = displayName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function shortId(id: string): string {
  return shortThreadId(id);
}
