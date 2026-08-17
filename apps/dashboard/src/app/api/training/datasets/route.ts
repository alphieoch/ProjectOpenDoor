import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { trainingDatasets } from "@opendoor/database";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  try {
    const db = getDb();
    const datasets = await db
      .select()
      .from(trainingDatasets)
      .where(eq(trainingDatasets.organizationId, orgId))
      .orderBy(desc(trainingDatasets.createdAt));
    return NextResponse.json({ datasets });
  } catch (err) {
    console.error("[training/datasets]", err);
    return NextResponse.json({ datasets: [], error: "Failed to load datasets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const slug =
    typeof body.slug === "string" && body.slug.trim()
      ? slugify(body.slug)
      : slugify(name);
  const purpose = (body.purpose || "sft") as string;
  const format = (body.format || "jsonl") as string;
  const rows = Array.isArray(body.rows) ? body.rows : null;
  const storageUri =
    typeof body.storageUri === "string"
      ? body.storageUri
      : typeof body.storage_uri === "string"
        ? body.storage_uri
        : null;

  if (!name || !slug) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!["sft", "dpo", "orpo", "eval"].includes(purpose)) {
    return NextResponse.json({ error: "purpose must be sft|dpo|orpo|eval" }, { status: 400 });
  }

  let rowCount = Number(body.rowCount || 0);
  let byteSize = Number(body.byteSize || 0);
  let sample: unknown = body.sample ?? null;
  let resolvedUri = storageUri;

  if (rows) {
    rowCount = rows.length;
    const payload = rows.map((r: unknown) => JSON.stringify(r)).join("\n");
    byteSize = Buffer.byteLength(payload, "utf8");
    sample = rows.slice(0, 3);
    // Inline datasets stored as data URI in DB metadata (small sets); large → require storageUri
    if (byteSize > 2_000_000 && !storageUri) {
      return NextResponse.json(
        { error: "Dataset > 2MB — upload to GCS and pass storageUri (gs://...)" },
        { status: 400 }
      );
    }
    if (!resolvedUri) {
      resolvedUri = `inline:jsonl:${slug}`;
    }
  }

  if (!resolvedUri && !rows) {
    return NextResponse.json(
      { error: "Provide rows[] (JSONL records) or storageUri" },
      { status: 400 }
    );
  }

  const db = getDb();
  try {
    const [dataset] = await db
      .insert(trainingDatasets)
      .values({
        organizationId: orgId,
        name,
        slug,
        format,
        purpose,
        storageUri: resolvedUri,
        rowCount,
        byteSize,
        status: "ready",
        sample: sample as any,
        metadata: rows
          ? { inlineRows: rows.length <= 500 ? rows : undefined, truncated: rows.length > 500 }
          : {},
      })
      .returning();

    return NextResponse.json({ dataset }, { status: 201 });
  } catch (e: any) {
    if (String(e?.message || e).includes("unique") || e?.code === "23505") {
      return NextResponse.json({ error: "slug already exists" }, { status: 409 });
    }
    throw e;
  }
}
