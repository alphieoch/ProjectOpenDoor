import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { uploadToBlob } from "@/lib/azure/blob";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  const session = await requireAuth();

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Only JPEG, PNG, WebP and SVG images are allowed" }, { status: 400 });

  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const blobName = `assistant-logos/${session.orgId}/${randomUUID()}.${ext}`;
  const url = await uploadToBlob("assistant-assets", blobName, buffer, file.type);

  return NextResponse.json({ url });
}
