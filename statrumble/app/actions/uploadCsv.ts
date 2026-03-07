"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";
import { parseCsvRows, persistCsvImportToWorkspace } from "@/lib/csvImport";
import { createClient } from "@/lib/supabase/server";
import type { UploadCsvActionState } from "./uploadCsv.types";

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

    const supabase = await createClient();
    const workspaceId = await getRequiredActiveWorkspaceId();

    await persistCsvImportToWorkspace({
      supabase,
      workspaceId,
      metricName,
      unit,
      fileName: fileValue.name,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    return { ok: false, error: `Upload failed: ${message}` };
  }

  revalidatePath("/");
  redirect("/");
}
