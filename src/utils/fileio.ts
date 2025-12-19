
// src/utils/fileio.ts
import { ModelSchema, type Model } from "../engine/schema";

export async function importJson(file: File): Promise<Model> {
  const text = await file.text();
  const json = JSON.parse(text);
  const parsed = ModelSchema.safeParse(json);
  if (!parsed.success) throw new Error(parsed.error.message);
  return parsed.data;
}

export function exportJson(model: Model) {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
   a.download = `${model.project.name}.json`;
  a.click();
}

export function exportCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
