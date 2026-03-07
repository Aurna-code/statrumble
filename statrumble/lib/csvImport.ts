import type { SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";

const MAX_ROWS = 50_000;
const MAX_ERROR_EXAMPLES = 3;
const BULK_INSERT_CHUNK_SIZE = 500;

type CsvRow = {
  ts?: string;
  value?: string;
};

export type CsvPointInput = {
  ts: string;
  value: number;
};

type CsvImportParseResult = {
  rows: CsvPointInput[];
  error: string | null;
};

function collectParseErrorExamples(errors: Papa.ParseError[]) {
  return errors.slice(0, MAX_ERROR_EXAMPLES).map((error) => {
    const row = typeof error.row === "number" ? error.row + 2 : "?";
    return `row ${row}: ${error.message}`;
  });
}

export function parseCsvRows(csvText: string): CsvImportParseResult {
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

  const rows: CsvPointInput[] = [];
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

type PersistCsvImportParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  metricName: string;
  unit: string | null;
  fileName: string;
  rows: CsvPointInput[];
};

type PersistCsvImportResult = {
  metricId: string;
  importId: string;
  rowCount: number;
};

export async function persistCsvImportToWorkspace({
  supabase,
  workspaceId,
  metricName,
  unit,
  fileName,
  rows,
}: PersistCsvImportParams): Promise<PersistCsvImportResult> {
  const normalizedMetricName = metricName.trim();
  const normalizedFileName = fileName.trim();

  if (!workspaceId) {
    throw new Error("workspace_id is required.");
  }

  if (!normalizedMetricName) {
    throw new Error("metric_name is required.");
  }

  if (!normalizedFileName) {
    throw new Error("file_name is required.");
  }

  if (rows.length === 0) {
    throw new Error("CSV has no valid data rows.");
  }

  const { data: metric, error: metricError } = await supabase
    .from("metrics")
    .upsert(
      {
        workspace_id: workspaceId,
        name: normalizedMetricName,
        unit,
      },
      {
        onConflict: "workspace_id,name",
      },
    )
    .select("id")
    .single();

  if (metricError || !metric?.id) {
    throw new Error(`Failed to get or create metric: ${metricError?.message ?? "Unknown error"}`);
  }

  const { data: metricImport, error: importError } = await supabase
    .from("metric_imports")
    .insert({
      workspace_id: workspaceId,
      metric_id: metric.id,
      file_name: normalizedFileName,
      row_count: rows.length,
    })
    .select("id")
    .single();

  if (importError || !metricImport?.id) {
    throw new Error(`Failed to create import: ${importError?.message ?? "Unknown error"}`);
  }

  for (let start = 0; start < rows.length; start += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + BULK_INSERT_CHUNK_SIZE);
    const payload = chunk.map((row) => ({
      workspace_id: workspaceId,
      import_id: metricImport.id,
      ts: row.ts,
      value: row.value,
    }));

    const { error: pointsError } = await supabase.from("metric_points").insert(payload);

    if (pointsError) {
      const chunkIndex = Math.floor(start / BULK_INSERT_CHUNK_SIZE) + 1;
      throw new Error(`Failed to insert points chunk ${chunkIndex}: ${pointsError.message}`);
    }
  }

  return {
    metricId: metric.id,
    importId: metricImport.id,
    rowCount: rows.length,
  };
}
