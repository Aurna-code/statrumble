export type UploadCsvActionState = {
  ok: boolean;
  error?: string;
};

export const initialUploadCsvActionState: UploadCsvActionState = {
  ok: true,
};
