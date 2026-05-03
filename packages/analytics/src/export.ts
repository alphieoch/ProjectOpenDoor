import type { DuckDBAnalyticsClient } from "./client.js";
import type { ExportFormat } from "./types.js";

export async function exportQueryToBuffer(
  client: DuckDBAnalyticsClient,
  sql: string,
  format: ExportFormat
): Promise<Buffer> {
  const tmpPath = `/tmp/opendoor-export-${Date.now()}.${format}`;

  if (format === "json") {
    const rows = await client.query<Record<string, unknown>>(sql);
    return Buffer.from(JSON.stringify(rows, null, 2));
  }

  if (format === "csv") {
    await client.copyTo(sql, tmpPath, "csv");
  } else if (format === "parquet") {
    await client.copyTo(sql, tmpPath, "parquet");
  }

  const file = await import("node:fs/promises");
  const data = await file.readFile(tmpPath);
  await file.unlink(tmpPath);
  return data;
}

export function getExportContentType(format: ExportFormat): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "parquet":
      return "application/octet-stream";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export function getExportFileName(
  baseName: string,
  format: ExportFormat
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${baseName}-${timestamp}.${format}`;
}
