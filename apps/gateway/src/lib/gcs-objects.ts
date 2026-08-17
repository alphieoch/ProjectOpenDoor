import { getGcpAccessToken } from "./web-search.js";

const HTTP_TIMEOUT_MS = 30_000;

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function filesBucket(): string {
  return env("OPENDOOR_FILES_BUCKET") || env("GCS_FILES_BUCKET") || env("GCS_BUCKET");
}

export function filesUseGcs(): boolean {
  return Boolean(filesBucket());
}

export function gcsFilesPrefix(): string {
  return (env("OPENDOOR_FILES_PREFIX") || "opendoor-files").replace(/^\/+|\/+$/g, "");
}

export function gcsIndexObject(): string {
  return `${gcsFilesPrefix()}/index.json`;
}

export function gcsBlobObject(organizationId: string, id: string): string {
  return `${gcsFilesPrefix()}/${organizationId}/${id}`;
}

export function gcsTextObject(organizationId: string, id: string): string {
  return `${gcsFilesPrefix()}/${organizationId}/${id}.txt`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getGcpAccessToken();
  if (!token) {
    throw new Error(
      "OPENDOOR_FILES_BUCKET is set but GCS auth failed. Use Application Default Credentials or GOOGLE_ACCESS_TOKEN."
    );
  }
  return { Authorization: `Bearer ${token}` };
}

export async function gcsPutObject(object: string, body: Buffer, contentType: string): Promise<void> {
  const bucket = filesBucket();
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(object)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": contentType },
    body,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GCS upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function gcsGetObject(object: string): Promise<Buffer | null> {
  const bucket = filesBucket();
  const url =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/` +
    `${encodeURIComponent(object)}?alt=media`;
  const res = await fetch(url, {
    headers: await authHeaders(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GCS download failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function gcsDeleteObject(object: string): Promise<void> {
  const bucket = filesBucket();
  const url =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/` +
    `${encodeURIComponent(object)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: await authHeaders(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (res.status === 404 || res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(`GCS delete failed (${res.status}): ${text.slice(0, 200)}`);
}
