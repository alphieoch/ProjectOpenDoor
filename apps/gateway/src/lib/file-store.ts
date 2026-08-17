import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { mkdir, readFile, rmdir, unlink, writeFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  filesUseGcs,
  gcsBlobObject,
  gcsDeleteObject,
  gcsGetObject,
  gcsIndexObject,
  gcsPutObject,
  gcsTextObject,
} from "./gcs-objects.js";

export interface StoredFile {
  id: string;
  object: "file";
  filename: string;
  bytes: number;
  purpose: string;
  created_at: number;
  organizationId: string;
  has_text: boolean;
}

type IndexFile = Record<string, StoredFile>;

function rootDir(): string {
  return process.env.OPENDOOR_FILES_DIR || path.join(process.cwd(), "tmp", "opendoor-files");
}

function indexPath(): string {
  return path.join(rootDir(), "index.json");
}

function blobPath(id: string): string {
  return path.join(rootDir(), id);
}

function textPath(id: string): string {
  return path.join(rootDir(), `${id}.txt`);
}

let writeChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureRoot(): Promise<void> {
  await mkdir(rootDir(), { recursive: true });
}

async function readIndex(): Promise<IndexFile> {
  try {
    const raw = await readFile(indexPath(), "utf8");
    const parsed = JSON.parse(raw) as IndexFile;
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length) return parsed;
  } catch {
    /* try GCS */
  }
  if (filesUseGcs()) {
    try {
      const buf = await gcsGetObject(gcsIndexObject());
      if (buf) {
        const parsed = JSON.parse(buf.toString("utf8")) as IndexFile;
        if (parsed && typeof parsed === "object") {
          await ensureRoot();
          await writeFile(indexPath(), JSON.stringify(parsed), "utf8");
          return parsed;
        }
      }
    } catch {
      /* empty index */
    }
  }
  return {};
}

async function writeIndex(index: IndexFile): Promise<void> {
  await ensureRoot();
  const raw = JSON.stringify(index);
  await writeFile(indexPath(), raw, "utf8");
  if (filesUseGcs()) {
    await gcsPutObject(gcsIndexObject(), Buffer.from(raw), "application/json");
  }
}

async function writeBlob(row: { organizationId: string; id: string }, buf: Buffer): Promise<void> {
  if (filesUseGcs()) {
    await gcsPutObject(gcsBlobObject(row.organizationId, row.id), buf, "application/octet-stream");
    return;
  }
  await writeFile(blobPath(row.id), buf);
}

async function writeText(row: { organizationId: string; id: string }, text: string): Promise<void> {
  if (filesUseGcs()) {
    await gcsPutObject(gcsTextObject(row.organizationId, row.id), Buffer.from(text, "utf8"), "text/plain");
    return;
  }
  await writeFile(textPath(row.id), text, "utf8");
}

async function readBlob(row: { organizationId: string; id: string }): Promise<Buffer | null> {
  try {
    return await readFile(blobPath(row.id));
  } catch {
    /* try GCS */
  }
  if (filesUseGcs()) {
    return gcsGetObject(gcsBlobObject(row.organizationId, row.id));
  }
  return null;
}

async function readText(row: { organizationId: string; id: string }): Promise<string | null> {
  try {
    return await readFile(textPath(row.id), "utf8");
  } catch {
    /* try GCS */
  }
  if (filesUseGcs()) {
    const buf = await gcsGetObject(gcsTextObject(row.organizationId, row.id));
    return buf ? buf.toString("utf8") : null;
  }
  return null;
}

const TEXT_EXTS = new Set([".txt", ".md", ".markdown", ".jsonl", ".json"]);

export function extractPlainText(filename: string, buf: Buffer): string | null {
  const ext = path.extname(filename).toLowerCase();
  if (!TEXT_EXTS.has(ext)) return null;
  return buf.toString("utf8");
}

function runPdftotext(pdfPath: string, txtPath: string): Promise<void> {
  const bin = process.env.PDFTOTEXT_PATH || "pdftotext";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-layout", "-enc", "UTF-8", pdfPath, txtPath], {
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("pdftotext timeout"));
    }, 15_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`pdftotext exit ${code}`));
    });
  });
}

export async function extractPdfText(buf: Buffer): Promise<string | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "od-pdf-"));
  const pdfPath = path.join(dir, "in.pdf");
  const txtPath = path.join(dir, "out.txt");
  try {
    await writeFile(pdfPath, buf);
    await runPdftotext(pdfPath, txtPath);
    const text = await readFile(txtPath, "utf8");
    const trimmed = text.trim();
    return trimmed ? text : null;
  } catch {
    return null;
  } finally {
    await unlink(pdfPath).catch(() => undefined);
    await unlink(txtPath).catch(() => undefined);
    await rmdir(dir).catch(() => undefined);
  }
}

export async function extractFileText(filename: string, buf: Buffer): Promise<string | null> {
  const plain = extractPlainText(filename, buf);
  if (plain != null) return plain;
  if (path.extname(filename).toLowerCase() === ".pdf") {
    return extractPdfText(buf);
  }
  return null;
}

export function toApiFile(row: StoredFile) {
  return {
    id: row.id,
    object: "file" as const,
    filename: row.filename,
    bytes: row.bytes,
    purpose: row.purpose,
    created_at: row.created_at,
    has_text: row.has_text,
  };
}

export async function createStoredFile(opts: {
  organizationId: string;
  filename: string;
  purpose: string;
  buf: Buffer;
}): Promise<StoredFile> {
  return enqueue(async () => {
    await ensureRoot();
    const id = `file-${randomBytes(12).toString("hex")}`;
    const text = await extractFileText(opts.filename, opts.buf);
    const row: StoredFile = {
      id,
      object: "file",
      filename: opts.filename,
      bytes: opts.buf.length,
      purpose: opts.purpose,
      created_at: Math.floor(Date.now() / 1000),
      organizationId: opts.organizationId,
      has_text: text != null,
    };
    await writeBlob(row, opts.buf);
    if (text != null) {
      await writeText(row, text);
    }
    const index = await readIndex();
    index[id] = row;
    await writeIndex(index);
    return row;
  });
}

export async function listStoredFiles(opts: {
  organizationId: string;
  purpose?: string;
}): Promise<StoredFile[]> {
  const index = await readIndex();
  return Object.values(index)
    .filter((row) => row.organizationId === opts.organizationId)
    .filter((row) => (opts.purpose ? row.purpose === opts.purpose : true))
    .sort((a, b) => b.created_at - a.created_at);
}

export async function getStoredFile(
  organizationId: string,
  id: string
): Promise<StoredFile | null> {
  const index = await readIndex();
  const row = index[id];
  if (!row || row.organizationId !== organizationId) return null;
  return row;
}

export async function getStoredFileBytes(
  organizationId: string,
  id: string
): Promise<{ row: StoredFile; buf: Buffer } | null> {
  const row = await getStoredFile(organizationId, id);
  if (!row) return null;
  const buf = await readBlob(row);
  if (!buf) return null;
  return { row, buf };
}

export async function getStoredFileText(
  organizationId: string,
  id: string
): Promise<{ row: StoredFile; text: string } | null> {
  return enqueue(async () => {
    const index = await readIndex();
    const row = index[id];
    if (!row || row.organizationId !== organizationId) return null;
    if (row.has_text) {
      const cached = await readText(row);
      if (cached != null) return { row, text: cached };
    }
    const buf = await readBlob(row);
    if (!buf) return null;
    const text = await extractFileText(row.filename, buf);
    if (text == null) return null;
    await writeText(row, text);
    row.has_text = true;
    index[id] = row;
    await writeIndex(index);
    return { row, text };
  });
}

export async function deleteStoredFile(
  organizationId: string,
  id: string
): Promise<boolean> {
  return enqueue(async () => {
    const index = await readIndex();
    const row = index[id];
    if (!row || row.organizationId !== organizationId) return false;
    delete index[id];
    await writeIndex(index);
    await unlink(blobPath(id)).catch(() => undefined);
    await unlink(textPath(id)).catch(() => undefined);
    if (filesUseGcs()) {
      await gcsDeleteObject(gcsBlobObject(organizationId, id)).catch(() => undefined);
      await gcsDeleteObject(gcsTextObject(organizationId, id)).catch(() => undefined);
    }
    return true;
  });
}
