import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { trainingJobs } from "@opendoor/database";
import { HOUSE_CHAT_MODEL_ID, houseChatModelForMode } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  assistantGatewayHeaders,
  assistantGatewaySecret,
  assistantGatewayUrl,
} from "@/lib/assistant-gateway";
import { trainingCapabilities } from "@/lib/training/capabilities";
import { explainTrainingFailure, extractJsonObject } from "@/lib/training/plan";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json().catch(() => ({}));
  let statusMessage = typeof body.statusMessage === "string" ? body.statusMessage : "";
  const jobId = typeof body.jobId === "string" ? body.jobId : "";

  if (jobId) {
    const db = getDb();
    const rows = await db
      .select()
      .from(trainingJobs)
      .where(and(eq(trainingJobs.id, jobId), eq(trainingJobs.organizationId, orgId)))
      .limit(1);
    if (!rows[0]) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    statusMessage = rows[0].statusMessage || statusMessage;
  }

  const capabilities = trainingCapabilities();
  const heuristic = explainTrainingFailure(statusMessage, capabilities);

  const secret = assistantGatewaySecret();
  if (!secret || !statusMessage.trim()) {
    return NextResponse.json({ explanation: heuristic, source: "heuristic" });
  }

  try {
    const upstream = await fetch(`${assistantGatewayUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: assistantGatewayHeaders(orgId, {
        "X-OpenDoor-House-Chat": "1",
        "X-OpenDoor-House-Chat-Mode": "auto",
        "X-OpenDoor-User-Id": session.userId,
      }),
      body: JSON.stringify({
        model: houseChatModelForMode("auto") || HOUSE_CHAT_MODEL_ID,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              'Explain a fine-tune failure in plain language. Return JSON {"headline","detail","nextAction"} only. Do not invent GPU clusters. Next action must be something the user can do in OpenDoor Training (upload data, pick Gemini SFT, set Vertex/Together, retry).',
          },
          {
            role: "user",
            content: `Status: ${statusMessage}\nHeuristic: ${heuristic.headline} — ${heuristic.nextAction.label}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ explanation: heuristic, source: "heuristic" });
    }
    const json = (await upstream.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    const parsed = extractJsonObject(json?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return NextResponse.json({ explanation: heuristic, source: "heuristic" });
    }
    return NextResponse.json({
      explanation: {
        ...heuristic,
        headline: typeof parsed.headline === "string" ? parsed.headline : heuristic.headline,
        detail: typeof parsed.detail === "string" ? parsed.detail : heuristic.detail,
        nextAction: {
          ...heuristic.nextAction,
          label:
            typeof parsed.nextAction === "string"
              ? parsed.nextAction
              : heuristic.nextAction.label,
        },
      },
      source: "ai",
    });
  } catch {
    return NextResponse.json({ explanation: heuristic, source: "heuristic" });
  }
}
