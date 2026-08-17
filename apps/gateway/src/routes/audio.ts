import { Hono } from "hono";
import OpenAI from "openai";
import { loadOrgProviderKeys, touchOrgProviderKeyUsed } from "../lib/byok.js";
import { logGatewayRequest } from "../lib/request-log.js";

const audioRouter = new Hono();

function resolveOpenAIKey(byokKey?: string) {
  return byokKey || process.env.OPENAI_API_KEY || null;
}

audioRouter.post("/transcriptions", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const byok = await loadOrgProviderKeys(organization.id);
  const openaiByok = byok.get("openai");
  const openaiKey = resolveOpenAIKey(openaiByok?.plaintext);
  if (!openaiKey) {
    return c.json(
      {
        error: "Audio transcription is not configured",
        message: "Set OPENAI_API_KEY or add an org BYOK key for provider 'openai'.",
      },
      503
    );
  }
  if (openaiByok) touchOrgProviderKeyUsed(openaiByok.id);

  const form = await c.req.parseBody({ all: true });
  const file = form.file;
  if (!file || typeof file === "string") {
    return c.json({ error: "file is required (multipart)" }, 400);
  }

  const model = String(form.model || "whisper-1");
  const started = Date.now();
  try {
    const client = new OpenAI({ apiKey: openaiKey });
    const result = await client.audio.transcriptions.create({
      file: file as any,
      model,
      language: form.language ? String(form.language) : undefined,
      prompt: form.prompt ? String(form.prompt) : undefined,
      response_format: (form.response_format as any) || "json",
    });

    await logGatewayRequest({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerSlug: "openai",
      modelId: model,
      requestType: "completion",
      promptTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err?.message || "Transcription failed" }, 502);
  }
});

audioRouter.post("/speech", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const byok = await loadOrgProviderKeys(organization.id);
  const openaiByok = byok.get("openai");
  const openaiKey = resolveOpenAIKey(openaiByok?.plaintext);
  if (!openaiKey) {
    return c.json(
      {
        error: "Speech synthesis is not configured",
        message: "Set OPENAI_API_KEY or add an org BYOK key for provider 'openai'.",
      },
      503
    );
  }
  if (openaiByok) touchOrgProviderKeyUsed(openaiByok.id);

  const body = await c.req.json();
  const input = typeof body.input === "string" ? body.input : "";
  if (!input) return c.json({ error: "input is required" }, 400);

  const model = body.model || "tts-1";
  const voice = body.voice || "alloy";
  const started = Date.now();
  try {
    const client = new OpenAI({ apiKey: openaiKey });
    const speech = await client.audio.speech.create({
      model,
      voice,
      input,
      response_format: body.response_format || "mp3",
    });
    const buf = Buffer.from(await speech.arrayBuffer());

    await logGatewayRequest({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerSlug: "openai",
      modelId: model,
      requestType: "completion",
      promptTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
    });

    return new Response(buf, {
      headers: {
        "Content-Type": body.response_format === "opus" ? "audio/opus" : "audio/mpeg",
      },
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Speech failed" }, 502);
  }
});

export default audioRouter;
