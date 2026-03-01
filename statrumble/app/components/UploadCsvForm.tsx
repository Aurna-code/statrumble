"use client";

import { FormEvent, useActionState, useState } from "react";
import { uploadCsvAction } from "../actions/uploadCsv";
import { initialUploadCsvActionState, type UploadCsvActionState } from "../actions/uploadCsv.types";

export default function UploadCsvForm() {
  const [state, formAction, pending] = useActionState<UploadCsvActionState, FormData>(
    uploadCsvAction,
    initialUploadCsvActionState,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const metricName = String(formData.get("metric_name") ?? "").trim();
    const file = formData.get("file");

    if (!metricName) {
      event.preventDefault();
      setClientError("metric_name is required.");
      return;
    }

    if (!(file instanceof File) || file.size === 0) {
      event.preventDefault();
      setClientError("CSV file is required.");
      return;
    }

    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="mt-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-800" htmlFor="metric_name">
            metric_name
          </label>
          <input
            id="metric_name"
            name="metric_name"
            type="text"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
            placeholder="e.g. Revenue"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-800" htmlFor="unit">
            unit (optional)
          </label>
          <input
            id="unit"
            name="unit"
            type="text"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
            placeholder="e.g. USD"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800" htmlFor="file">
          file
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".csv,text/csv"
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-sm file:font-medium file:text-zinc-700"
        />
        <p className="mt-1 text-xs text-zinc-600">Expected header: ts,value (ts: ISO8601, value: number).</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload CSV"}
      </button>

      {clientError ? <p className="text-sm text-red-600">{clientError}</p> : null}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
