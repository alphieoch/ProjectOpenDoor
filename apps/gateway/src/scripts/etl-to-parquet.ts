/**
 * ETL Script: Export historical PostgreSQL data to Parquet on Azure Blob Storage
 *
 * Usage:
 *   DUCKDB_ANALYTICS_ENABLED=true bun run apps/gateway/src/scripts/etl-to-parquet.ts
 *
 * Tables exported:
 *   - requests (older than 90 days)
 *   - audit_logs (older than 90 days)
 *   - credit_transactions (older than 90 days)
 *   - policy_violations (older than 90 days)
 */

import { DuckDBAnalyticsClient } from "@opendoor/analytics";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { createReadStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const RETENTION_DAYS = 90;
const TMP_DIR = "/tmp/opendoor-etl";

interface EtlTable {
  name: string;
  dateColumn: string;
  partitionColumns: string[];
}

const TABLES: EtlTable[] = [
  { name: "requests", dateColumn: "created_at", partitionColumns: ["organization_id", "DATE(created_at)"] },
  { name: "audit_logs", dateColumn: "created_at", partitionColumns: ["organization_id", "DATE(created_at)"] },
  { name: "credit_transactions", dateColumn: "created_at", partitionColumns: ["organization_id", "DATE(created_at)"] },
  { name: "policy_violations", dateColumn: "created_at", partitionColumns: ["organization_id", "DATE(created_at)"] },
];

async function ensureBlobContainer(): Promise<string> {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "analytics";

  if (!accountName || !accountKey) {
    throw new Error("AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY are required");
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  return containerName;
}

async function exportTable(
  client: DuckDBAnalyticsClient,
  table: EtlTable,
  cutoffDate: Date
): Promise<string> {
  const localPath = `${TMP_DIR}/${table.name}.parquet`;
  await mkdir(dirname(localPath), { recursive: true });

  const sql = `
    SELECT *
    FROM pg.${table.name}
    WHERE ${table.dateColumn} < '${cutoffDate.toISOString()}'
  `;

  console.log(`[ETL] Exporting ${table.name} to ${localPath}...`);
  await client.copyTo(sql, localPath, "parquet");

  return localPath;
}

async function uploadToBlob(
  localPath: string,
  tableName: string,
  containerName: string
): Promise<void> {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!;

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobName = `${tableName}/year=${new Date().getUTCFullYear()}/month=${String(new Date().getUTCMonth() + 1).padStart(2, "0")}/day=${String(new Date().getUTCDate()).padStart(2, "0")}/${tableName}.parquet`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  console.log(`[ETL] Uploading ${localPath} to azure://${containerName}/${blobName}...`);
  await blockBlobClient.uploadStream(createReadStream(localPath), 4 * 1024 * 1024, 20);
  console.log(`[ETL] Uploaded ${blobName} (${(await blockBlobClient.getProperties()).contentLength} bytes)`);
}

async function runETL(): Promise<void> {
  console.log("[ETL] Starting OpenDoor analytics ETL...");

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    console.error("[ETL] DUCKDB_ANALYTICS_ENABLED must be set to true");
    process.exit(1);
  }

  await client.init();

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[ETL] Cutoff date: ${cutoffDate.toISOString()}`);

  const containerName = await ensureBlobContainer();

  for (const table of TABLES) {
    const localPath = await exportTable(client, table, cutoffDate);
    await uploadToBlob(localPath, table.name, containerName);
    await unlink(localPath);
    console.log(`[ETL] Cleaned up ${localPath}`);
  }

  client.closeSync();
  console.log("[ETL] Complete.");
}

runETL().catch((err) => {
  console.error("[ETL] Fatal error:", err);
  process.exit(1);
});
