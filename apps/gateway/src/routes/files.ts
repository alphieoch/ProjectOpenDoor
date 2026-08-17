import { Hono } from "hono";
import {
  createStoredFile,
  deleteStoredFile,
  getStoredFile,
  getStoredFileText,
  listStoredFiles,
  toApiFile,
} from "../lib/file-store.js";

const filesRouter = new Hono();
const MAX_BYTES = 32 * 1024 * 1024;

function tenant(c: {
  get: (k: "apiKey" | "organization") => { id?: string } | undefined;
}) {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  if (!apiKey || !organization?.id) return null;
  return { organizationId: organization.id };
}

function isUpload(value: unknown): value is { name?: string; arrayBuffer: () => Promise<ArrayBuffer> } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

filesRouter.post("/", async (c) => {
  const auth = tenant(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "Expected multipart form data with file and purpose" }, 400);
  }

  const purposeRaw = form.get("purpose");
  const purpose = typeof purposeRaw === "string" ? purposeRaw.trim() : "";
  if (!purpose) {
    return c.json({ error: "purpose is required" }, 400);
  }

  const upload = form.get("file");
  if (!isUpload(upload)) {
    return c.json({ error: "file is required" }, 400);
  }

  const buf = Buffer.from(await upload.arrayBuffer());
  if (buf.length === 0) {
    return c.json({ error: "file is empty" }, 400);
  }
  if (buf.length > MAX_BYTES) {
    return c.json({ error: `file exceeds ${MAX_BYTES} byte limit` }, 400);
  }

  const filename = (upload.name || "upload").replace(/[/\\]/g, "_");
  const row = await createStoredFile({
    organizationId: auth.organizationId,
    filename,
    purpose,
    buf,
  });
  return c.json(toApiFile(row), 200);
});

filesRouter.get("/", async (c) => {
  const auth = tenant(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const purpose = c.req.query("purpose") || undefined;
  const rows = await listStoredFiles({ organizationId: auth.organizationId, purpose });
  return c.json({ object: "list", data: rows.map(toApiFile) });
});

filesRouter.get("/:id/content", async (c) => {
  const auth = tenant(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const extracted = await getStoredFileText(auth.organizationId, c.req.param("id"));
  if (!extracted) {
    const row = await getStoredFile(auth.organizationId, c.req.param("id"));
    if (!row) return c.json({ error: "File not found" }, 404);
    return c.json(
      {
        error: "No extracted text",
        message:
          "Text is extracted from .txt, .md, and PDF when `pdftotext` is on PATH. This file has no text layer.",
      },
      404
    );
  }
  return c.json({
    id: extracted.row.id,
    object: "file.content",
    filename: extracted.row.filename,
    text: extracted.text,
  });
});

filesRouter.get("/:id", async (c) => {
  const auth = tenant(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const row = await getStoredFile(auth.organizationId, c.req.param("id"));
  if (!row) return c.json({ error: "File not found" }, 404);
  return c.json(toApiFile(row));
});

filesRouter.delete("/:id", async (c) => {
  const auth = tenant(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const ok = await deleteStoredFile(auth.organizationId, id);
  if (!ok) return c.json({ error: "File not found" }, 404);
  return c.json({ id, object: "file", deleted: true });
});

export default filesRouter;
