import { z } from "zod";
import { tool, zodSchema } from "ai";
import { decryptSecret } from "./crypto";

export interface ApiEndpoint {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  enabled: boolean;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    location: "query" | "path" | "body";
  }[];
}

export interface ApiConnection {
  id: string;
  name: string;
  baseUrl: string;
  authType: "bearer" | "api_key" | "header";
  secretId: string;
  apiKeyHeader: string;
  docsUrl: string;
  enabled: boolean;
  endpoints?: ApiEndpoint[];
}

export interface SecretRecord {
  id: string;
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
}

function buildParameterSchema(params?: ApiEndpoint["parameters"]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  if (!params) return z.object(shape);
  for (const p of params) {
    let field: z.ZodTypeAny;
    switch (p.type) {
      case "number":
      case "integer":
      case "float":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.any());
        break;
      case "object":
        field = z.record(z.string(), z.any());
        break;
      default:
        field = z.string();
    }
    if (!p.required) {
      field = field.optional();
    }
    shape[p.name] = field;
  }
  return z.object(shape);
}

function interpolatePath(path: string, args: Record<string, unknown>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name) => {
    const val = args[name];
    if (val === undefined || val === null) throw new Error(`Missing required path parameter: ${name}`);
    return encodeURIComponent(String(val));
  });
}

function buildQueryString(args: Record<string, unknown>, queryParams: string[]): string {
  const qs = new URLSearchParams();
  for (const key of queryParams) {
    const val = args[key];
    if (val !== undefined && val !== null) {
      qs.set(key, String(val));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export async function buildApiConnectionTools(
  connections: ApiConnection[],
  secrets: SecretRecord[]
): Promise<Record<string, any>> {
  const tools: Record<string, any> = {};

  const secretMap = new Map<string, string>();
  for (const s of secrets) {
    try {
      secretMap.set(
        s.id,
        decryptSecret({
          ciphertext: s.secretCiphertext,
          iv: s.secretIv,
          tag: s.secretTag,
        })
      );
    } catch (err) {
      console.error(`Failed to decrypt secret ${s.id}:`, err);
    }
  }

  for (const conn of connections) {
    if (!conn.enabled) continue;
    const apiKey = secretMap.get(conn.secretId);
    if (!apiKey) {
      console.warn(`No secret found for API connection ${conn.name} (${conn.id})`);
      continue;
    }

    for (const ep of conn.endpoints ?? []) {
      if (ep.enabled === false) continue;
      const toolName = `${conn.name.replace(/\s+/g, "_")}_${ep.name.replace(/\s+/g, "_")}`;
      const parameters = buildParameterSchema(ep.parameters);

      const queryParamNames = ep.parameters?.filter((p) => p.location === "query").map((p) => p.name) ?? [];
      const bodyParamNames = ep.parameters?.filter((p) => p.location === "body").map((p) => p.name) ?? [];

      (tools as any)[toolName] = (tool as any)({
        description: `${ep.description} (via ${conn.name})`,
        parameters: zodSchema(parameters) as any,
        execute: async (args: Record<string, unknown>) => {
          const url = new URL(
            interpolatePath(ep.path, args) + buildQueryString(args, queryParamNames),
            conn.baseUrl.replace(/\/$/, "")
          );

          const headers: Record<string, string> = {
            Accept: "application/json",
            "Content-Type": "application/json",
          };

          if (conn.authType === "bearer") {
            headers.Authorization = `Bearer ${apiKey}`;
          } else if (conn.authType === "api_key") {
            headers[conn.apiKeyHeader || "X-Api-Key"] = apiKey;
          } else if (conn.authType === "header") {
            headers[conn.apiKeyHeader || "X-Api-Key"] = apiKey;
          }

          const body =
            ep.method !== "GET" && bodyParamNames.length > 0
              ? JSON.stringify(
                  Object.fromEntries(
                    bodyParamNames
                      .filter((k) => args[k] !== undefined)
                      .map((k) => [k, args[k]])
                  )
                )
              : undefined;

          const res = await fetch(url.toString(), {
            method: ep.method,
            headers,
            body,
          });

          const contentType = res.headers.get("content-type") ?? "";
          let result: unknown;
          if (contentType.includes("application/json")) {
            result = await res.json();
          } else {
            result = await res.text();
          }

          if (!res.ok) {
            return {
              success: false,
              status: res.status,
              statusText: res.statusText,
              data: result,
            };
          }

          return {
            success: true,
            status: res.status,
            data: result,
          };
        },
      });
    }
  }

  return tools;
}
