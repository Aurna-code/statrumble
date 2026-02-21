"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createImport, getOrCreateMetric, insertPointsBulk, type PointInput } from "@/lib/db";
import type { UploadCsvActionState } from "./uploadCsv.types";

const MAX_ROWS = 50_000;
const MAX_ERROR_EXAMPLES = 3;

type CsvRow = {
  ts?: string;
  value?: string;
};

function collectParseErrorExamples(errors: Papa.ParseError[]) {
  return errors.slice(0, MAX_ERROR_EXAMPLES).map((error) => {
    const row = typeof error.row === "number" ? error.row + 2 : "?";
    return `row ${row}: ${error.message}`;
  });
}

function parseCsvRows(csvText: string): { rows: PointInput[]; error: string | null } {
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const examples = collectParseErrorExamples(parsed.errors);
    return {
      rows: [],
      error: `CSV parse error. ${examples.join(" | ")}`,
    };
  }

  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("ts") || !fields.includes("value")) {
    return {
      rows: [],
      error: "CSV must include header columns: ts,value",
    };
  }

  const rows: PointInput[] = [];
  const validationErrors: string[] = [];

  parsed.data.forEach((row, index) => {
    if (validationErrors.length >= MAX_ERROR_EXAMPLES) {
      return;
    }

    const rowNumber = index + 2;
    const rawTs = String(row.ts ?? "").trim();
    const rawValue = String(row.value ?? "").trim();
    const parsedDate = new Date(rawTs);
    const parsedValue = Number(rawValue);

    if (!rawTs || Number.isNaN(parsedDate.getTime())) {
      validationErrors.push(`row ${rowNumber}: invalid ts="${rawTs}"`);
      return;
    }

    if (!rawValue || Number.isNaN(parsedValue)) {
      validationErrors.push(`row ${rowNumber}: invalid value="${rawValue}"`);
      return;
    }

    rows.push({
      ts: parsedDate.toISOString(),
      value: parsedValue,
    });
  });

  if (validationErrors.length > 0) {
    return {
      rows: [],
      error: `CSV validation failed. ${validationErrors.join(" | ")}`,
    };
  }

  if (rows.length === 0) {
    return {
      rows: [],
      error: "CSV has no valid data rows.",
    };
  }

  if (rows.length > MAX_ROWS) {
    return {
      rows: [],
      error: `CSV row limit exceeded: ${rows.length}. Max is ${MAX_ROWS}.`,
    };
  }

  return { rows, error: null };
}

export async function uploadCsvAction(
  _prevState: UploadCsvActionState,
  formData: FormData,
): Promise<UploadCsvActionState> {
  const metricName = String(formData.get("metric_name") ?? "").trim();
  const unitInput = String(formData.get("unit") ?? "").trim();
  const unit = unitInput.length > 0 ? unitInput : null;
  const fileValue = formData.get("file");

  if (!metricName) {
    return { ok: false, error: "metric_name is required." };
  }

  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return { ok: false, error: "CSV file is required." };
  }

  try {
    const csvText = await fileValue.text();
    const { rows, error } = parseCsvRows(csvText);

    if (error) {
      return { ok: false, error };
    }

    const metric = await getOrCreateMetric(metricName, unit);
    const metricImport = await createImport(metric.id, fileValue.name, rows.length);
    await insertPointsBulk(metricImport.id, rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    return { ok: false, error: `Upload failed: ${message}` };
  }

  revalidatePath("/");
  redirect("/");
}
