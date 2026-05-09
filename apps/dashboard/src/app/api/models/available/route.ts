import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { models, providers, deployments } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

/* Fallback list used when the DB has not been seeded yet */
const FALLBACK_MODELS = [
  { id: "gpt-4o",                     label: "GPT-4o",            provider: "OpenAI"    },
  { id: "gpt-4o-mini",                label: "GPT-4o Mini",       provider: "OpenAI"    },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "claude-3-haiku-20240307",    label: "Claude 3 Haiku",    provider: "Anthropic" },
  { id: "gemini-1.5-pro",             label: "Gemini 1.5 Pro",    provider: "Google"    },
  { id: "gemini-1.5-flash",           label: "Gemini 1.5 Flash",  provider: "Google"    },
  { id: "mistral-large-latest",       label: "Mistral Large",     provider: "Mistral"   },
  { id: "command-r-plus",             label: "Command R+",        provider: "Cohere"    },
];

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const db = getDb();

  const result: { id: string; label: string; provider: string }[] = [];

  /* 1. Cloud / provider models from the DB registry */
  try {
    const dbModels = await db
      .select({
        modelId: models.modelId,
        displayName: models.displayName,
        providerName: providers.name,
        providerSlug: providers.slug,
        deploymentStatus: models.deploymentStatus,
      })
      .from(models)
      .leftJoin(providers, eq(models.providerId, providers.id))
      .where(eq(models.enabled, true));

    for (const m of dbModels) {
      if (!m.modelId) continue;
      // Skip models that are explicitly not ready
      if (m.deploymentStatus === "coming_soon") continue;
      result.push({
        id: m.modelId,
        label: m.displayName || m.modelId,
        provider: m.providerName || m.providerSlug || "Unknown",
      });
    }
  } catch (err: any) {
    console.error("[models/available] Failed to fetch DB models:", err.message);
  }

  /* 2. Custom deployments belonging to this org */
  try {
    const orgDeployments = await db
      .select({ id: deployments.id, name: deployments.name, status: deployments.status })
      .from(deployments)
      .where(and(eq(deployments.organizationId, orgId), eq(deployments.status, "running")));

    for (const d of orgDeployments) {
      result.push({
        id: `custom:${d.id}`,
        label: d.name,
        provider: "Custom",
      });
    }
  } catch (err: any) {
    console.error("[models/available] Failed to fetch deployments:", err.message);
  }

  /* 3. Deduplicate by id */
  const seen = new Set<string>();
  const deduped = result.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  /* 4. If nothing in DB yet, fall back so the UI isn't empty */
  if (deduped.length === 0) {
    return NextResponse.json({ models: FALLBACK_MODELS });
  }

  return NextResponse.json({ models: deduped });
}
