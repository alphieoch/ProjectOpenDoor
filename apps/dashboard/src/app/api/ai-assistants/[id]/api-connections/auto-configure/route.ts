import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants, assistantApiSecrets } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { encryptSecret } from "@/lib/api-connections/crypto";
import { assistantGatewayHeaders, assistantGatewayUrl } from "@/lib/assistant-gateway";
import crypto from "crypto";

async function fetchDocsContent(docsUrl: string): Promise<string> {
  const res = await fetch(docsUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; OpenDoorDocsBot/1.0)",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch docs: ${res.status} ${res.statusText}`);
  return res.text();
}

async function parseDocsWithLLM(docsContent: string, baseUrl: string, orgId: string): Promise<{
  endpoints: Array<{
    name: string;
    method: string;
    path: string;
    description: string;
    parameters?: Array<{
      name: string;
      type: string;
      required: boolean;
      location: "query" | "path" | "body";
    }>;
  }>;
}> {
  const prompt = `You are an API documentation parser. Given raw HTML or markdown API documentation, extract all REST API endpoints.

Return ONLY a JSON object with this exact shape:
{
  "endpoints": [
    {
      "name": "human_readable_name",
      "method": "GET|POST|PUT|DELETE|PATCH",
      "path": "/api/v1/resource/{id}",
      "description": "What this endpoint does",
      "parameters": [
        { "name": "paramName", "type": "string|number|boolean|array|object", "required": true|false, "location": "query|path|body" }
      ]
    }
  ]
}

Rules:
- Extract every endpoint you can find in the docs.
- Use relative paths (not full URLs). Base URL is ${baseUrl}
- Infer parameter types from examples or descriptions.
- Mark path parameters as location "path" and required true.
- If a parameter is in the query string, mark location "query".
- If a parameter is in the request body, mark location "body".
- Keep descriptions concise (1-2 sentences).

Documentation content:
---
${docsContent.slice(0, 30000)}
---`;

  const res = await fetch(`${assistantGatewayUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: assistantGatewayHeaders(orgId),
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful API documentation parser. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`LLM parse failed: ${text}`);
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "";

  // Try to extract JSON from markdown code blocks or raw text
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed.endpoints || !Array.isArray(parsed.endpoints)) {
      throw new Error("Invalid response shape: missing endpoints array");
    }
    // Normalize method casing
    for (const ep of parsed.endpoints) {
      ep.method = String(ep.method).toUpperCase();
    }
    return parsed;
  } catch (err: any) {
    throw new Error(`Failed to parse LLM response as JSON: ${err.message}`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));

  if (!assistant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name,
    baseUrl,
    authType,
    apiKey,
    apiKeyHeader,
    docsUrl,
  } = body;

  if (!name || !baseUrl || !authType || !apiKey || !docsUrl) {
    return NextResponse.json(
      { error: "name, baseUrl, authType, apiKey, and docsUrl are required" },
      { status: 400 }
    );
  }

  // Validate authType
  if (!["bearer", "api_key", "header"].includes(authType)) {
    return NextResponse.json({ error: "authType must be bearer, api_key, or header" }, { status: 400 });
  }

  let docsContent: string;
  try {
    docsContent = await fetchDocsContent(docsUrl);
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to fetch docs: ${err.message}` }, { status: 400 });
  }

  let parsed: { endpoints: any[] };
  try {
    parsed = await parseDocsWithLLM(docsContent, baseUrl, session.orgId);
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to parse docs: ${err.message}` }, { status: 500 });
  }

  // Encrypt the API key
  const encrypted = encryptSecret(apiKey);

  // Store the secret
  const [secretRecord] = await db
    .insert(assistantApiSecrets)
    .values({
      assistantId: id,
      organizationId: session.orgId,
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretTag: encrypted.tag,
    })
    .returning();

  const connectionId = crypto.randomUUID();
  const newConnection = {
    id: connectionId,
    name: name.trim(),
    baseUrl: baseUrl.trim().replace(/\/$/, ""),
    authType,
    secretId: secretRecord.id,
    apiKeyHeader: apiKeyHeader || "",
    docsUrl: docsUrl.trim(),
    enabled: true,
    endpoints: parsed.endpoints.map((ep) => {
      let path = ep.path;
      // Strip base URL if LLM accidentally included it
      if (path.startsWith(baseUrl)) {
        path = path.slice(baseUrl.length);
      }
      return {
        name: ep.name,
        method: ep.method,
        path: path.startsWith("/") ? path : "/" + path,
        description: ep.description,
        enabled: true,
        parameters: ep.parameters ?? [],
      };
    }),
  };

  const currentConnections = (assistant.apiConnections ?? []) as any[];
  const updatedConnections = [...currentConnections, newConnection];

  await db
    .update(aiAssistants)
    .set({ apiConnections: updatedConnections, updatedAt: new Date() })
    .where(eq(aiAssistants.id, id));

  return NextResponse.json({ connection: newConnection });
}
