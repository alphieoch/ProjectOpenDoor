// @ts-nocheck
import type { Context, Next } from "hono";
import { flattenMessageText, mapMessageText } from "@opendoor/shared";
import { checkPolicy, redactPrompt, type DataClass } from "../lib/policy-engine.js";

export async function policyMiddleware(c: Context, next: Next) {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");

  if (!apiKey || !organization) {
    return c.json({ error: "Authentication required before policy check" }, 401);
  }

  // Only enforce on chat completions for now
  if (!c.req.path.endsWith("/completions")) {
    return await next();
  }

  // Parse body early to get model and check data class header
  let body: Record<string, any>;
  try {
    body = await c.req.json();
  } catch {
    return await next();
  }

  const modelId = body.model;
  if (!modelId) {
    return c.json({ error: "Model is required" }, 400);
  }

  // Read enterprise headers
  const dataClassHeader = c.req.header("X-Data-Class") as DataClass | undefined;
  const dataClass = dataClassHeader || "internal";
  const businessUnit = c.req.header("X-Business-Unit") || undefined;
  const clientId = c.req.header("X-Client-Id") || undefined;

  // Run policy check
  const policyResult = await checkPolicy({
    organizationId: organization.id,
    apiKeyId: apiKey.id,
    modelId,
    dataClass,
    userRole: apiKey.role || "member",
    businessUnit,
    clientId,
    prompt:
      body.messages?.map((m: any) => flattenMessageText(m.content)).join(" ") ||
      (typeof body.prompt === "string" ? body.prompt : "") ||
      "",
    metadata: { headers: Object.fromEntries(c.req.raw.headers) },
  });

  // Store result in context for downstream use
  c.set("policyResult", policyResult);
  c.set("dataClass", dataClass);
  c.set("businessUnit", businessUnit);
  c.set("clientId", clientId);

  if (!policyResult.allowed) {
    // Example 403 response body:
    // {
    //   "error": "Model 'deepseek-chat' is not approved for data class 'confidential'.",
    //   "policy_action": "deny",
    //   "violation_id": "pv_123",
    //   "data_class": "confidential",
    //   "original_model": "deepseek-chat",
    //   "required_action": "request_approval_or_use_fallback",
    //   "guardrails": [...]
    // }
    return c.json(
      {
        error: policyResult.reason,
        policy_action: policyResult.action,
        violation_id: policyResult.violationId,
        data_class: dataClass,
        original_model: modelId,
        required_action: policyResult.action === "require_approval" ? "human_approval_required" : "request_approval_or_use_fallback",
        guardrails: policyResult.guardrailResults,
      },
      403
    );
  }

  // Apply redaction to messages if PII or secrets were detected
  const needsRedaction = policyResult.guardrailResults.some(
    (g) =>
      g.triggered &&
      (g.type === "pii_detection" || g.type === "secret_scanning")
  );
  if (needsRedaction && Array.isArray(body.messages)) {
    body.messages = body.messages.map((m: any) => {
      if (m?.content == null) return m;
      return {
        ...m,
        content: mapMessageText(m.content, (text) =>
          redactPrompt(text, policyResult.guardrailResults)
        ),
      };
    });
    c.set("chatRequestBody", body);
  }

  // If fallback routing is required, override the model.
  // Example fallback outcome (logged in metadata):
  // {
  //   "model": "mistral-large-latest",
  //   "routed_from": "deepseek-chat",
  //   "policy_id": "pol_456",
  //   "guardrails_applied": ["pii_detection", "prompt_injection"]
  // }
  if (policyResult.action === "route_fallback" && policyResult.fallbackModelId) {
    c.set("originalModel", modelId);
    body.model = policyResult.fallbackModelId;
    c.set("overrideModel", policyResult.fallbackModelId);
  }

  await next();
}
