"use client";

import { useEffect, useMemo, useState } from "react";

type ProfileResponse = {
  ok?: boolean;
  userId?: string;
  email?: string | null;
  displayName?: string | null;
  error?: string;
};

type SaveProfileResponse = {
  ok?: boolean;
  displayName?: string | null;
  error?: string;
};

type DisplayNameEditorProps = {
  embedded?: boolean;
  onDisplayNameChange?: (displayName: string) => void;
};

export default function DisplayNameEditor({ embedded = false, onDisplayNameChange }: DisplayNameEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const response = await fetch("/api/me/profile", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as ProfileResponse;

        if (!response.ok || payload.ok !== true) {
          throw new Error(payload.error ?? "Failed to load profile.");
        }

        if (cancelled) {
          return;
        }

        const nextDisplayName = payload.displayName?.trim() ?? "";
        setDisplayName(nextDisplayName);
        setInitialDisplayName(nextDisplayName);
        setEmail(payload.email ?? null);
        onDisplayNameChange?.(nextDisplayName);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Unknown profile error");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [onDisplayNameChange]);

  const isUnchanged = useMemo(() => displayName.trim() === initialDisplayName.trim(), [displayName, initialDisplayName]);

  async function handleSave() {
    if (saving || !displayName.trim()) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/me/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
        }),
      });
      const payload = (await response.json()) as SaveProfileResponse;

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error ?? "Failed to save display name.");
      }

      const nextDisplayName = payload.displayName?.trim() ?? "";
      setDisplayName(nextDisplayName);
      setInitialDisplayName(nextDisplayName);
      setSuccessMessage("Display name saved.");
      onDisplayNameChange?.(nextDisplayName);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown profile error");
    } finally {
      setSaving(false);
    }
  }

  const containerClassName = embedded
    ? "rounded-lg border border-zinc-200 bg-zinc-50 p-4"
    : "mt-6 rounded-lg border border-zinc-200 bg-white p-5";

  return (
    <section className={containerClassName}>
      <h2 className="text-base font-semibold">Display name</h2>
      <p className="mt-1 text-sm text-zinc-600">Set how your name appears in thread messages.</p>
      {email ? <p className="mt-1 text-xs text-zinc-500">Signed in as {email}</p> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-zinc-700">
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Set your display name"
            disabled={loading || saving}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || !displayName.trim() || isUnchanged}
          className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading..." : saving ? "Saving..." : "Save"}
        </button>
      </div>

      {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-3 text-sm text-emerald-700">{successMessage}</p> : null}
      {!errorMessage && !successMessage && initialDisplayName.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No display name set yet.</p>
      ) : null}
    </section>
  );
}
