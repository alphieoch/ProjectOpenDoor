"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  GitBranch, ChevronLeft, Loader2,
  Trash2, Plus, Save, Check, Play, Upload,
} from "lucide-react";
import { ConfirmDialog } from "@/components/workflow/confirm-dialog";
import { NODE_META, TRIGGER_LABELS } from "@/components/workflow/node-meta";

const TOOLS = [
  { value: "search",            label: "OpenDoor Search" },
  { value: "web_search",        label: "Web Search" },
  { value: "code_execution",    label: "Code Execution" },
  { value: "document_analysis", label: "Document Analysis" },
  { value: "image_generation",  label: "Image Generation" },
  { value: "data_extraction",   label: "Data Extraction" },
];

// ── Custom node component ─────────────────────────────────────────────────────

function WorkflowNodeComponent({ data, selected }: { id: string; data: any; selected: boolean }) {
  const meta = NODE_META[data.nodeType ?? "llm"] ?? NODE_META.llm;
  const Icon = meta.icon;
  const hasTarget = data.nodeType !== "input";
  const hasSource = data.nodeType !== "output";

  return (
    <div style={{
      width: 190,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: selected
        ? `0 0 0 2px ${meta.bg}, 0 4px 16px hsl(var(--foreground) / 0.12)`
        : "0 2px 8px hsl(var(--foreground) / 0.08)",
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
    }}>
      {/* Header */}
      <div style={{ background: meta.bg, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={14} color={meta.color} />
        <span style={{ color: meta.color, fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
          {meta.label}
        </span>
      </div>
      {/* Body */}
      <div style={{ padding: "8px 12px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--card-foreground))", marginBottom: 2 }}>
          {data.label || meta.label}
        </div>
        {data.modelId && (
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>{data.modelId}</div>
        )}
        {data.toolType && (
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {TOOLS.find((t) => t.value === data.toolType)?.label ?? data.toolType}
            {(data.toolType === "web_search" || data.toolType === "search") && data.query ? ` · ${data.query}` : ""}
            {data.toolType === "image_generation" && data.prompt ? ` · ${data.prompt}` : ""}
            {data.toolType === "document_analysis" && data.fileId ? ` · ${data.fileId}` : ""}
            {data.toolType === "code_execution" ? ` · ${data.language === "python" ? "python" : "js"}` : ""}
          </div>
        )}
        {data.systemPrompt && (
          <div style={{
            fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 4,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {data.systemPrompt}
          </div>
        )}
        {data.condition && (
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>{data.condition}</div>
        )}
        {data.description && !data.modelId && !data.toolType && (
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{data.description}</div>
        )}
      </div>
      {/* Handles */}
      {hasTarget && (
        <Handle type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: meta.bg, border: "2px solid hsl(var(--card))" }} />
      )}
      {data.nodeType === "condition" ? (
        <>
          <Handle type="source" id="true" position={Position.Right}
            style={{ width: 10, height: 10, top: "38%", background: meta.bg, border: "2px solid hsl(var(--card))" }}
            title="True" />
          <Handle type="source" id="false" position={Position.Right}
            style={{ width: 10, height: 10, top: "68%", background: meta.bg, border: "2px solid hsl(var(--card))" }}
            title="False" />
        </>
      ) : hasSource ? (
        <Handle type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: meta.bg, border: "2px solid hsl(var(--card))" }} />
      ) : null}
    </div>
  );
}

const nodeTypes: NodeTypes = { workflowNode: WorkflowNodeComponent };

// ── Config panel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  node,
  models,
  onUpdate,
  onDelete,
}: {
  node: Node;
  models: { modelId: string; displayName: string }[];
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const data = node.data as any;
  const meta = NODE_META[data.nodeType ?? "llm"] ?? NODE_META.llm;

  function set(key: string, value: unknown) {
    onUpdate(node.id, { ...data, [key]: value });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "hsl(var(--border))", background: meta.bg }}>
        <meta.icon size={14} color={meta.color} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Label</label>
          <input value={data.label ?? ""} onChange={(e) => set("label", e.target.value)}
            className="input w-full text-sm" placeholder="Node label" />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Description</label>
          <textarea value={data.description ?? ""} onChange={(e) => set("description", e.target.value)}
            className="input w-full text-sm" rows={2} placeholder="What does this node do?" />
        </div>

        {/* LLM fields */}
        {data.nodeType === "llm" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Model</label>
              <select value={data.modelId ?? ""} onChange={(e) => set("modelId", e.target.value)}
                className="input w-full text-sm">
                <option value="">— select model —</option>
                {models.map((m) => (
                  <option key={m.modelId} value={m.modelId}>{m.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>System Prompt</label>
              <textarea value={data.systemPrompt ?? ""} onChange={(e) => set("systemPrompt", e.target.value)}
                className="input w-full text-sm" rows={5} placeholder="You are a helpful assistant…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Temperature — {(data.temperature ?? 0.7).toFixed(1)}
              </label>
              <input type="range" min={0} max={1} step={0.1} value={data.temperature ?? 0.7}
                onChange={(e) => set("temperature", parseFloat(e.target.value))}
                className="w-full accent-indigo-600" />
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                <span>Precise</span><span>Creative</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Max Tokens</label>
              <input type="number" value={data.maxTokens ?? ""} onChange={(e) => set("maxTokens", parseInt(e.target.value))}
                className="input w-full text-sm" placeholder="e.g. 2048" min={1} max={128000} />
            </div>
          </>
        )}

        {/* Tool fields */}
        {data.nodeType === "tool" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Tool Type</label>
              <select value={data.toolType ?? ""} onChange={(e) => set("toolType", e.target.value)}
                className="input w-full text-sm">
                <option value="">— select tool —</option>
                {TOOLS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {(data.toolType === "web_search" || data.toolType === "search") && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Query</label>
                  <textarea
                    value={data.query ?? ""}
                    onChange={(e) => set("query", e.target.value)}
                    className="input w-full text-sm"
                    rows={3}
                    placeholder="Search query, or leave blank to use the Run prompt"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Max results</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={data.maxResults ?? 5}
                    onChange={(e) => set("maxResults", parseInt(e.target.value, 10))}
                    className="input w-full text-sm"
                  />
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {data.toolType === "search"
                    ? "OpenDoor Search synthesizes an answer with citations on our GCP Vertex stack. Enable it on Tools or cover it with the existing search add-on. Billed on org credits."
                    : "Requires the Web Search add-on (or Enterprise). Production uses Vertex AI Google Search grounding on OpenDoor’s GCP project."}{" "}
                  <Link href="/dashboard/billing" className="underline" style={{ color: "hsl(var(--foreground))" }}>
                    Billing
                  </Link>
                </p>
              </>
            )}
            {data.toolType === "image_generation" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Prompt</label>
                  <textarea
                    value={data.prompt ?? ""}
                    onChange={(e) => set("prompt", e.target.value)}
                    className="input w-full text-sm"
                    rows={3}
                    placeholder="Image prompt, or leave blank to use the Run input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Model</label>
                  <input
                    value={data.model ?? data.modelId ?? "dall-e-3"}
                    onChange={(e) => set("model", e.target.value)}
                    className="input w-full text-sm"
                    placeholder="dall-e-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Size</label>
                  <select value={data.size ?? "1024x1024"} onChange={(e) => set("size", e.target.value)}
                    className="input w-full text-sm">
                    <option value="1024x1024">1024×1024</option>
                    <option value="1792x1024">1792×1024</option>
                    <option value="1024x1792">1024×1792</option>
                  </select>
                </div>
              </>
            )}
            {data.toolType === "code_execution" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Language</label>
                  <select
                    value={data.language === "python" ? "python" : "javascript"}
                    onChange={(e) => set("language", e.target.value)}
                    className="input w-full text-sm"
                  >
                    <option value="javascript">JavaScript (Node)</option>
                    <option value="python">Python</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Code</label>
                  <textarea
                    value={data.code ?? ""}
                    onChange={(e) => set("code", e.target.value)}
                    className="input w-full text-sm font-mono"
                    rows={5}
                    placeholder={data.language === "python" ? "print(open('input.txt').read())" : "console.log(require('fs').readFileSync('input.txt','utf8'))"}
                  />
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Constrained subprocess (tmpdir cwd, 5s timeout, no shell) — not Firecracker.
                  Prior step output is stdin and input.txt. JavaScript uses Node&apos;s permission model when available (no network).
                </p>
              </>
            )}
            {data.toolType === "document_analysis" && (
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>File ID</label>
                <input
                  value={data.fileId ?? ""}
                  onChange={(e) => set("fileId", e.target.value)}
                  className="input w-full text-sm"
                  placeholder="file-… from POST /v1/files"
                />
              </div>
            )}
            {data.toolType === "data_extraction" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Text</label>
                  <textarea
                    value={data.prompt ?? ""}
                    onChange={(e) => set("prompt", e.target.value)}
                    className="input w-full text-sm"
                    rows={3}
                    placeholder="Text to embed, or leave blank to use the prior step"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Embedding model</label>
                  <input
                    value={data.model ?? data.modelId ?? "text-embedding-3-small"}
                    onChange={(e) => set("model", e.target.value)}
                    className="input w-full text-sm"
                    placeholder="text-embedding-3-small"
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* Condition fields */}
        {data.nodeType === "condition" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Condition</label>
            <input value={data.condition ?? ""} onChange={(e) => set("condition", e.target.value)}
              className="input w-full text-sm" placeholder='e.g. includes("error")' />
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              Safe check against the prior step output — no eval. includes/equals/startsWith/endsWith, length &gt; N, or true/false.
              Connect the True / False handles to branch.
            </p>
          </div>
        )}

        {/* Human review fields */}
        {data.nodeType === "human_review" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Reviewer Note</label>
              <textarea value={data.reviewNote ?? ""} onChange={(e) => set("reviewNote", e.target.value)}
                className="input w-full text-sm" rows={3} placeholder="Instructions for the human reviewer…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Assignee / queue</label>
              <input value={data.assignee ?? data.queue ?? ""} onChange={(e) => set("assignee", e.target.value)}
                className="input w-full text-sm" placeholder="lee@org or billing-queue" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>SLA minutes</label>
              <input type="number" min={1} value={data.dueMinutes ?? ""} onChange={(e) => set("dueMinutes", parseInt(e.target.value, 10) || "")}
                className="input w-full text-sm" placeholder="e.g. 60" />
            </div>
          </div>
        )}

        {data.nodeType === "wait" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Wait seconds</label>
              <input type="number" min={0} value={data.waitSeconds ?? 0} onChange={(e) => set("waitSeconds", parseInt(e.target.value, 10) || 0)}
                className="input w-full text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Wait minutes</label>
              <input type="number" min={0} value={data.waitMinutes ?? 0} onChange={(e) => set("waitMinutes", parseInt(e.target.value, 10) || 0)}
                className="input w-full text-sm" />
              <p className="mt-1 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                Under 8 seconds runs inline. Longer waits pause the run until due.
              </p>
            </div>
          </div>
        )}

        {data.nodeType === "loop" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Items</label>
              <textarea value={data.items ?? ""} onChange={(e) => set("items", e.target.value)}
                className="input w-full text-sm" rows={3} placeholder={'JSON array or one item per line. {{input}} works.'} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Item template</label>
              <input value={data.template ?? "{{item}}"} onChange={(e) => set("template", e.target.value)}
                className="input w-full text-sm" placeholder="{{item}}" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Max items</label>
              <input type="number" min={1} max={20} value={data.maxIterations ?? 20}
                onChange={(e) => set("maxIterations", parseInt(e.target.value, 10))}
                className="input w-full text-sm" />
            </div>
          </div>
        )}

        {data.nodeType === "assign" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Assignee</label>
              <input value={data.assignee ?? ""} onChange={(e) => set("assignee", e.target.value)}
                className="input w-full text-sm" placeholder="user or {{vars.owner}}" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Queue</label>
              <input value={data.queue ?? ""} onChange={(e) => set("queue", e.target.value)}
                className="input w-full text-sm" placeholder="support" />
            </div>
          </div>
        )}

        {data.nodeType === "http" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Method</label>
              <select value={data.method ?? "POST"} onChange={(e) => set("method", e.target.value)} className="input w-full text-sm">
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>HTTPS URL</label>
              <input value={data.url ?? ""} onChange={(e) => set("url", e.target.value)}
                className="input w-full text-sm" placeholder="https://example.com/hook" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Body</label>
              <textarea value={data.body ?? ""} onChange={(e) => set("body", e.target.value)}
                className="input w-full text-sm" rows={3} placeholder='{"text":"{{input}}"}' />
            </div>
          </div>
        )}

        {data.nodeType === "set_variable" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Name</label>
              <input value={data.name ?? ""} onChange={(e) => set("name", e.target.value)}
                className="input w-full text-sm" placeholder="summary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Value</label>
              <textarea value={data.value ?? ""} onChange={(e) => set("value", e.target.value)}
                className="input w-full text-sm" rows={3} placeholder="{{input}} or {{steps.llm1.text}}" />
            </div>
          </div>
        )}

        {data.nodeType === "subflow" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Published workflow ID</label>
            <input value={data.workflowId ?? ""} onChange={(e) => set("workflowId", e.target.value)}
              className="input w-full text-sm" placeholder="uuid of another workflow" />
          </div>
        )}

        {data.nodeType === "transform" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Template</label>
            <textarea value={data.template ?? "{{input}}"} onChange={(e) => set("template", e.target.value)}
              className="input w-full text-sm" rows={3} placeholder="{{vars.dept}}: {{input}}" />
          </div>
        )}

        {/* Output fields */}
        {data.nodeType === "output" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Output Format</label>
              <select value={data.outputFormat ?? "text"} onChange={(e) => set("outputFormat", e.target.value)}
                className="input w-full text-sm">
                <option value="text">Plain text</option>
                <option value="json">JSON object</option>
                <option value="markdown">Markdown</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Template</label>
              <input value={data.template ?? ""} onChange={(e) => set("template", e.target.value)}
                className="input w-full text-sm" placeholder="optional {{vars.x}}" />
            </div>
          </div>
        )}

        {["llm", "tool", "http", "assign", "subflow"].includes(data.nodeType) && (
          <div className="space-y-3 border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>Error handling</p>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>On error</label>
              <select value={data.onError ?? "continue"} onChange={(e) => set("onError", e.target.value)} className="input w-full text-sm">
                <option value="continue">Continue</option>
                <option value="fail">Halt run</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Retries</label>
              <input type="number" min={0} max={3} value={data.retryCount ?? 0}
                onChange={(e) => set("retryCount", parseInt(e.target.value, 10) || 0)}
                className="input w-full text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="border-t p-3" style={{ borderColor: "hsl(var(--border))" }}>
        <button type="button" onClick={() => onDelete(node.id)}
          className="md-btn-outlined w-full flex items-center justify-center gap-2 py-2 text-sm"
          style={{ color: "var(--red)", borderColor: "var(--red)" }}>
          <Trash2 className="h-3.5 w-3.5" /> Delete node
        </button>
      </div>
    </div>
  );
}

// ── Editor page ───────────────────────────────────────────────────────────────

function toRFNodes(raw: any[]): Node[] {
  return (raw ?? []).map((n) => ({
    id: n.id,
    type: "workflowNode",
    position: n.position ?? { x: 0, y: 0 },
    data: { nodeType: n.type, ...n.data },
  }));
}

function toRFEdges(raw: any[]): Edge[] {
  return (raw ?? []).map((e) => ({
    ...e,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#73777F" },
    style: { stroke: "#73777F", strokeWidth: 1.5 },
  }));
}

function fromRFNodes(nodes: Node[]): any[] {
  return nodes.map((n) => ({
    id: n.id,
    type: (n.data as any).nodeType ?? "llm",
    position: n.position,
    data: (() => { const { nodeType, ...rest } = n.data as any; return rest; })(),
  }));
}

function fromRFEdges(edges: Edge[]): any[] {
  return edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({
    id, source, target, sourceHandle, targetHandle, label,
  }));
}

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [workflow, setWorkflow] = useState<any>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [models, setModels] = useState<{ modelId: string; displayName: string }[]>([]);
  const [runQuery, setRunQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runAddonRequired, setRunAddonRequired] = useState(false);
  type RunStep = {
    nodeId: string;
    type: string;
    toolType?: string;
    status: string;
    code?: string;
    query?: string;
    provider?: string;
    error?: string;
    text?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    passed?: boolean;
    results?: Array<{ title: string; url: string; snippet: string }>;
    images?: Array<{ url?: string; b64_json?: string }>;
    embedding?: { model: string; dimensions: number };
  };
  type SavedRun = {
    id: string;
    status: string;
    error?: string | null;
    createdAt?: string;
    stepOutputs?: RunStep[];
  };
  const [runResult, setRunResult] = useState<{
    runId?: string;
    status?: string;
    awaitingReview?: boolean;
    provider?: string;
    query?: string;
    results?: Array<{ title: string; url: string; snippet: string }>;
    steps?: RunStep[];
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [recentRuns, setRecentRuns] = useState<SavedRun[]>([]);
  const [triggerType, setTriggerType] = useState("manual");
  const [triggerCron, setTriggerCron] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("");
  const [triggerRecordAction, setTriggerRecordAction] = useState("");
  const [variablesText, setVariablesText] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publishedVersion, setPublishedVersion] = useState(0);
  const [versions, setVersions] = useState<Array<{ id: string; version: number; note?: string | null; publishedAt?: string }>>([]);
  const [showPublish, setShowPublish] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [runPublished, setRunPublished] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestGraph = useRef({ nodes: [] as any[], edges: [] as any[] });

  // Load workflow + models
  useEffect(() => {
    Promise.all([
      fetch(`/api/workflows/${id}`).then((r) => r.json()),
      fetch("/api/models/available", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { models: [] }))
        .catch(() => ({ models: [] })),
      fetch(`/api/workflows/${id}/run`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { runs: [] }))
        .catch(() => ({ runs: [] })),
      fetch(`/api/workflows/${id}/versions`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { versions: [] }))
        .catch(() => ({ versions: [] })),
      fetch("/api/workflows/tick", { method: "POST", credentials: "include" }).catch(() => undefined),
    ]).then(([wfData, mData, runData, versionData]) => {
      if (wfData.workflow) {
        const wf = wfData.workflow;
        setWorkflow(wf);
        setName(wf.name);
        setStatus(wf.status);
        setTriggerType(wf.trigger?.type || "manual");
        setTriggerCron(wf.trigger?.cron || "");
        setTriggerEvent(wf.trigger?.event || "");
        setTriggerRecordAction(wf.trigger?.recordAction || "");
        setVariablesText(
          Object.entries(wf.variables || {}).map(([k, v]) => `${k}=${v}`).join("\n")
        );
        setWebhookSecret(wf.webhookSecret || "");
        setPublishedVersion(wf.publishedVersion || 0);
        const rfNodes = toRFNodes(wf.graph?.nodes ?? []);
        const rfEdges = toRFEdges(wf.graph?.edges ?? []);
        setNodes(rfNodes);
        setEdges(rfEdges);
        latestGraph.current = { nodes: wf.graph?.nodes ?? [], edges: wf.graph?.edges ?? [] };
      }
      setVersions(Array.isArray(versionData?.versions) ? versionData.versions : []);
      setModels(
        (mData.models ?? []).map((m: { id?: string; label?: string; modelId?: string; displayName?: string }) => ({
          modelId: m.id || m.modelId || "",
          displayName: m.label || m.displayName || m.id || "",
        }))
      );
      setRecentRuns(Array.isArray(runData.runs) ? runData.runs : []);
      setLoading(false);
    });
  }, [id]);

  // Sync selectedNode when nodes change
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.id === selectedNode.id);
      if (updated) setSelectedNode(updated);
      else setSelectedNode(null);
    }
  }, [nodes]);

  // Auto-save
  function scheduleSave(newNodes: Node[], newEdges: Edge[]) {
    latestGraph.current = { nodes: fromRFNodes(newNodes), edges: fromRFEdges(newEdges) };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(latestGraph.current, name, status), 2000);
  }

  function parsedVariables() {
    const vars: Record<string, string> = {};
    for (const line of variablesText.split("\n")) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (key) vars[key] = line.slice(idx + 1).trim();
    }
    return vars;
  }

  function currentTrigger() {
    return {
      type: triggerType,
      cron: triggerCron,
      event: triggerEvent,
      recordAction: triggerRecordAction,
    };
  }

  async function doSave(
    graph: { nodes: any[]; edges: any[] },
    wfName: string,
    wfStatus: string
  ) {
    setSaveState("saving");
    const res = await fetch(`/api/workflows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: wfName,
        status: wfStatus,
        graph,
        trigger: currentTrigger(),
        variables: parsedVariables(),
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.workflow?.webhookSecret) setWebhookSecret(data.workflow.webhookSecret);
      if (data.workflow) setWorkflow(data.workflow);
    }
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2500);
  }

  function saveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    doSave(latestGraph.current, name, status);
  }

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdges = addEdge({
        ...params,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#73777F" },
        style: { stroke: "#73777F", strokeWidth: 1.5 },
      }, edges);
      setEdges(newEdges);
      scheduleSave(nodes, newEdges);
    },
    [edges, nodes, name, status]
  );

  function handleNodesChange(changes: any) {
    onNodesChange(changes);
    // schedule save after position changes settle
    if (changes.some((c: any) => c.type === "position" && !c.dragging)) {
      scheduleSave(nodes, edges);
    }
  }

  function addNode(type: string) {
    const meta = NODE_META[type] ?? NODE_META.llm;
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: "workflowNode",
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { nodeType: type, label: meta.label },
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    scheduleSave(newNodes, edges);
    setSelectedNode(newNode);
  }

  function updateNodeData(nodeId: string, newData: Record<string, unknown>) {
    const newNodes = nodes.map((n) =>
      n.id === nodeId ? { ...n, data: newData } : n
    );
    setNodes(newNodes);
    scheduleSave(newNodes, edges);
  }

  function deleteNode(nodeId: string) {
    const newNodes = nodes.filter((n) => n.id !== nodeId);
    const newEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNode(null);
    scheduleSave(newNodes, newEdges);
  }

  function handleNameBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    doSave(latestGraph.current, name, status);
  }

  function handleStatusChange(s: string) {
    setStatus(s);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    doSave(latestGraph.current, name, s);
  }

  async function runWorkflow() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await doSave(latestGraph.current, name, status);
    }
    setRunning(true);
    setRunError(null);
    setRunAddonRequired(false);
    setRunResult(null);
    try {
      const res = await fetch(`/api/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: runQuery.trim() || undefined,
          published: runPublished || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunAddonRequired(data.code === "addon_required" || data.addon === "web_search");
        setRunError(typeof data.error === "string" ? data.error : `Run failed (${res.status})`);
        return;
      }
      if (data.error && !data.search && !data.awaitingReview) {
        setRunError(data.error);
      }
      setRunResult({
        runId: data.runId,
        status: data.status,
        awaitingReview: Boolean(data.awaitingReview),
        provider: data.search?.provider,
        query: data.search?.query,
        results: data.search?.results,
        steps: data.steps,
      });
      fetch(`/api/workflows/${id}/run`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { runs: [] }))
        .then((runData) => setRecentRuns(Array.isArray(runData.runs) ? runData.runs : []))
        .catch(() => undefined);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function reviewRun(runId: string, decision: "approve" | "reject") {
    setReviewing(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunError(typeof data.error === "string" ? data.error : `Review failed (${res.status})`);
        return;
      }
      if (data.error && !data.awaitingReview) {
        setRunError(data.error);
      }
      setRunResult({
        runId: data.runId,
        status: data.status,
        awaitingReview: Boolean(data.awaitingReview),
        provider: data.search?.provider,
        query: data.search?.query,
        results: data.search?.results,
        steps: data.steps,
      });
      fetch(`/api/workflows/${id}/run`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { runs: [] }))
        .then((runData) => setRecentRuns(Array.isArray(runData.runs) ? runData.runs : []))
        .catch(() => undefined);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  }

  async function publishWorkflow() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await doSave(latestGraph.current, name, status);
    }
    setPublishing(true);
    const res = await fetch(`/api/workflows/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: publishNote }),
    });
    const data = await res.json().catch(() => ({}));
    setPublishing(false);
    if (!res.ok) {
      setRunError(typeof data.error === "string" ? data.error : "Publish failed");
      return;
    }
    setShowPublish(false);
    setPublishNote("");
    if (data.workflow) {
      setWorkflow(data.workflow);
      setStatus(data.workflow.status);
      setPublishedVersion(data.workflow.publishedVersion || 0);
    }
    fetch(`/api/workflows/${id}/versions`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((v) => setVersions(Array.isArray(v.versions) ? v.versions : []))
      .catch(() => undefined);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  const pendingReviewId =
    runResult?.awaitingReview && runResult.runId
      ? runResult.runId
      : recentRuns.find((r) => r.status === "awaiting_review")?.id;

  const PALETTE = Object.entries(NODE_META);

  return (
    <div style={{ margin: "-40px -56px -80px", height: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5 shrink-0"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", zIndex: 10 }}>
        <button type="button" onClick={() => router.push("/dashboard/workflow")}
          className="md-icon-btn flex items-center gap-1 pr-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="h-4 w-px" style={{ background: "hsl(var(--border))" }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none"
          style={{ color: "hsl(var(--foreground))" }}
        />
        <select value={status} onChange={(e) => handleStatusChange(e.target.value)}
          className="input w-auto text-xs py-1">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        {publishedVersion > 0 && (
          <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>v{publishedVersion}</span>
        )}
        <input
          value={runQuery}
          onChange={(e) => setRunQuery(e.target.value)}
          className="input w-52 text-xs py-1"
          placeholder="Run input (optional)"
        />
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          <input type="checkbox" checked={runPublished} onChange={(e) => setRunPublished(e.target.checked)} />
          Published
        </label>
        <button type="button" onClick={runWorkflow} disabled={running}
          className="md-btn-outlined flex items-center gap-1.5 px-3 py-1.5 text-xs">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Running…" : "Run"}
        </button>
        <button type="button" onClick={() => setShowPublish(true)}
          className="md-btn-outlined flex items-center gap-1.5 px-3 py-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" /> Publish
        </button>
        <button type="button" onClick={saveNow}
          className="md-btn-filled flex items-center gap-1.5 px-3 py-1.5 text-xs">
          {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : saveState === "saved" ? <Check className="h-3.5 w-3.5" />
            : <Save className="h-3.5 w-3.5" />}
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
        </button>
      </div>

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Node palette */}
        <div className="shrink-0 overflow-y-auto border-r"
          style={{ width: 168, background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}>
          <div className="px-3 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
              Add nodes
            </p>
            <div className="space-y-1.5">
              {PALETTE.map(([type, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addNode(type)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all hover:opacity-90"
                    style={{ background: meta.bg, color: meta.color }}
                    title={meta.description}
                  >
                    <Icon size={13} />
                    {meta.label}
                    <Plus size={11} className="ml-auto opacity-70" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t px-3 py-3" style={{ borderColor: "hsl(var(--border))" }}>
            <p className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              Click a node type to add it to the canvas, then drag to position and connect with handles.
            </p>
          </div>
        </div>

        {/* Center: React Flow canvas */}
        <div className="flex-1" style={{ background: "hsl(var(--background))" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              scheduleSave(nodes, edges);
            }}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={["Backspace", "Delete"]}
            snapToGrid
            snapGrid={[16, 16]}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--border))" />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const nt = (n.data as any)?.nodeType ?? "llm";
                return NODE_META[nt]?.bg ?? "#888";
              }}
              style={{ background: "hsl(var(--card))" }}
            />
          </ReactFlow>
        </div>

        {/* Right: Config panel */}
        <div className="shrink-0 border-l"
          style={{ width: 272, background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}>
          {selectedNode ? (
            <ConfigPanel
              node={selectedNode}
              models={models}
              onUpdate={updateNodeData}
              onDelete={deleteNode}
            />
          ) : (
            <div className="flex h-full flex-col overflow-y-auto p-4 space-y-4">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Trigger
                </p>
                <select
                  value={triggerType}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTriggerType(next);
                    setSaveState("saving");
                    fetch(`/api/workflows/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        trigger: { type: next, cron: triggerCron, event: triggerEvent, recordAction: triggerRecordAction },
                        variables: parsedVariables(),
                      }),
                    }).then((res) => res.json().then((data) => {
                      if (data.workflow?.webhookSecret) setWebhookSecret(data.workflow.webhookSecret);
                      setSaveState("saved");
                      setTimeout(() => setSaveState("idle"), 2500);
                    }).catch(() => setSaveState("idle")));
                  }}
                  className="input w-full text-sm"
                >
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {triggerType === "schedule" && (
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Cron (UTC)</label>
                  <input value={triggerCron} onChange={(e) => setTriggerCron(e.target.value)} onBlur={() => doSave(latestGraph.current, name, status)}
                    className="input w-full text-sm" placeholder="0 9 * * 1-5" />
                </div>
              )}
              {triggerType === "agent_event" && (
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Event name</label>
                  <input value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} onBlur={() => doSave(latestGraph.current, name, status)}
                    className="input w-full text-sm" placeholder="agent.completed" />
                </div>
              )}
              {triggerType === "record" && (
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Record action</label>
                  <input value={triggerRecordAction} onChange={(e) => setTriggerRecordAction(e.target.value)} onBlur={() => doSave(latestGraph.current, name, status)}
                    className="input w-full text-sm" placeholder="update" />
                </div>
              )}
              {["webhook", "inbound", "agent_event", "record"].includes(triggerType) && (
                <div className="space-y-2">
                  <p className="text-[11px] break-all" style={{ color: "hsl(var(--muted-foreground))" }}>
                    POST /api/public/workflows/{id}/hook
                  </p>
                  {webhookSecret ? (
                    <p className="text-[11px] break-all font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                      x-workflow-secret: {webhookSecret}
                    </p>
                  ) : (
                    <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Save to mint a webhook secret.
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Variables (name=value)</label>
                <textarea
                  value={variablesText}
                  onChange={(e) => setVariablesText(e.target.value)}
                  onBlur={() => doSave(latestGraph.current, name, status)}
                  className="input w-full text-sm font-mono"
                  rows={4}
                  placeholder={"dept=support\nowner=lee"}
                />
                <p className="mt-2 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Use {"{{input}}"}, {"{{vars.name}}"}, or {"{{steps.nodeId.text}}"} in node fields.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {(runError || runResult || recentRuns.length > 0) && (
        <div className="shrink-0 border-t px-4 py-3 max-h-72 overflow-y-auto"
          style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
          {runError && (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {runError}
              {runAddonRequired ? (
                <>
                  {" "}
                  <Link href="/dashboard/billing" className="underline" style={{ color: "hsl(var(--foreground))" }}>
                    Subscribe on Billing
                  </Link>
                </>
              ) : null}
            </p>
          )}
          {pendingReviewId && (
            <div className="mb-3 flex items-center gap-2">
              <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>Awaiting review</p>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => reviewRun(pendingReviewId, "approve")}
                className="md-btn-filled px-2 py-1 text-[11px]"
              >
                {reviewing ? "…" : "Approve"}
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => reviewRun(pendingReviewId, "reject")}
                className="md-btn-outlined px-2 py-1 text-[11px]"
              >
                Reject
              </button>
            </div>
          )}
          {runResult?.steps?.length ? (
            <div className="space-y-3">
              {runResult.steps.map((step) => (
                <div key={step.nodeId}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {step.toolType || step.type} · {step.status}
                    {step.provider ? ` · ${step.provider}` : ""}
                    {step.query ? ` · ${step.query}` : ""}
                    {step.passed === true ? " · true" : step.passed === false ? " · false" : ""}
                  </p>
                  {step.error && (
                    <p className="text-[11px]" style={{ color: step.status === "error" ? "var(--red)" : "hsl(var(--muted-foreground))" }}>
                      {step.error}
                    </p>
                  )}
                  {step.stdout ? (
                    <p className="text-[11px] whitespace-pre-wrap font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {step.stdout.length > 800 ? `${step.stdout.slice(0, 800)}…` : step.stdout}
                    </p>
                  ) : null}
                  {step.stderr ? (
                    <p className="text-[11px] whitespace-pre-wrap font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                      stderr: {step.stderr.length > 400 ? `${step.stderr.slice(0, 400)}…` : step.stderr}
                    </p>
                  ) : null}
                  {step.results?.map((hit) => (
                    <div key={hit.url}>
                      <a href={hit.url} target="_blank" rel="noreferrer"
                        className="text-xs font-medium hover:underline" style={{ color: "hsl(var(--foreground))" }}>
                        {hit.title || hit.url}
                      </a>
                      {hit.snippet && (
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>{hit.snippet}</p>
                      )}
                    </div>
                  ))}
                  {step.images?.map((img, i) => {
                    const src = img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : "");
                    if (!src) return null;
                    return (
                      <a key={`${step.nodeId}-img-${i}`} href={src} target="_blank" rel="noreferrer">
                        <img src={src} alt="" className="mt-1 max-h-28 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                      </a>
                    );
                  })}
                  {step.embedding && (
                    <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {step.embedding.model} · {step.embedding.dimensions}d embedding
                    </p>
                  )}
                  {step.text && !step.stdout && !step.results?.length && !step.images?.length && (
                    <p className="text-[11px] whitespace-pre-wrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {step.text.length > 800 ? `${step.text.slice(0, 800)}…` : step.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : runResult?.results?.length ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
                {runResult.provider} · {runResult.query}
              </p>
              {runResult.results.map((hit) => (
                <div key={hit.url}>
                  <a href={hit.url} target="_blank" rel="noreferrer"
                    className="text-xs font-medium hover:underline" style={{ color: "hsl(var(--foreground))" }}>
                    {hit.title || hit.url}
                  </a>
                  {hit.snippet && (
                    <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>{hit.snippet}</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {recentRuns.length > 0 && (
            <div className="mt-3 pt-2 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
                Run history
              </p>
              <div className="space-y-1">
                {recentRuns.slice(0, 12).map((run) => (
                  <p key={run.id} className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {run.status}
                    {run.createdAt ? ` · ${new Date(run.createdAt).toLocaleString()}` : ""}
                    {run.error ? ` · ${run.error}` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}
          {versions.length > 0 && (
            <div className="mt-3 pt-2 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
                Published versions
              </p>
              {versions.slice(0, 6).map((version) => (
                <p key={version.id} className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  v{version.version}
                  {version.publishedAt ? ` · ${new Date(version.publishedAt).toLocaleString()}` : ""}
                  {version.note ? ` · ${version.note}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={showPublish}
        title="Publish this version?"
        description="Live webhook, schedule, inbound, and agent-event triggers will run this snapshot. Draft edits stay editable."
        confirmLabel="Publish"
        busy={publishing}
        onClose={() => setShowPublish(false)}
        onConfirm={publishWorkflow}
        extra={
          <input
            value={publishNote}
            onChange={(e) => setPublishNote(e.target.value)}
            className="input w-full text-sm"
            placeholder="Optional version note"
          />
        }
      />
    </div>
  );
}
