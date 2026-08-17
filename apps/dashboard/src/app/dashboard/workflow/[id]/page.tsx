"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ArrowRight, Bot, Wrench, GitBranch, Shuffle,
  CheckSquare, UserCheck, ChevronLeft, Loader2,
  Trash2, Plus, Save, Check,
} from "lucide-react";

// ── Node type config ──────────────────────────────────────────────────────────

const NODE_META: Record<string, {
  label: string; color: string; bg: string;
  icon: React.ElementType; description: string;
}> = {
  input:        { label: "Input",        color: "#fff", bg: "#1A73E8", icon: ArrowRight, description: "Workflow entry point" },
  llm:          { label: "LLM Call",     color: "#fff", bg: "#1E6E4F", icon: Bot,        description: "Call a language model" },
  tool:         { label: "Tool",         color: "#fff", bg: "#7A5700", icon: Wrench,     description: "Invoke an external tool" },
  condition:    { label: "Condition",    color: "#fff", bg: "#4B5FBF", icon: GitBranch,  description: "Branch based on output" },
  transform:    { label: "Transform",    color: "#fff", bg: "#006064", icon: Shuffle,    description: "Reshape or extract data" },
  output:       { label: "Output",       color: "#fff", bg: "#B3261E", icon: CheckSquare,description: "Workflow result" },
  human_review: { label: "Human Review", color: "#fff", bg: "#E65100", icon: UserCheck,  description: "Pause for human approval" },
};

const TOOLS = [
  { value: "web_search",        label: "Web Search" },
  { value: "code_execution",    label: "Code Execution" },
  { value: "document_analysis", label: "Document Analysis" },
  { value: "image_generation",  label: "Image Generation" },
  { value: "data_extraction",   label: "Data Extraction" },
];

// ── Custom node component ─────────────────────────────────────────────────────

function WorkflowNodeComponent({ id, data, selected }: { id: string; data: any; selected: boolean }) {
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
        ? `0 0 0 2px ${meta.bg}, 0 4px 16px rgba(0,0,0,0.15)`
        : "0 2px 8px rgba(0,0,0,0.12)",
      background: "#fff",
      border: "1px solid #e0e0e0",
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
        <div style={{ fontSize: 12, fontWeight: 600, color: "#191C20", marginBottom: 2 }}>
          {data.label || meta.label}
        </div>
        {data.modelId && (
          <div style={{ fontSize: 11, color: "#73777F", fontFamily: "monospace" }}>{data.modelId}</div>
        )}
        {data.toolType && (
          <div style={{ fontSize: 11, color: "#73777F" }}>
            {TOOLS.find((t) => t.value === data.toolType)?.label ?? data.toolType}
          </div>
        )}
        {data.systemPrompt && (
          <div style={{
            fontSize: 10, color: "#73777F", marginTop: 4,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {data.systemPrompt}
          </div>
        )}
        {data.condition && (
          <div style={{ fontSize: 11, color: "#73777F", fontStyle: "italic" }}>{data.condition}</div>
        )}
        {data.description && !data.modelId && !data.toolType && (
          <div style={{ fontSize: 11, color: "#73777F" }}>{data.description}</div>
        )}
      </div>
      {/* Handles */}
      {hasTarget && (
        <Handle type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: meta.bg, border: "2px solid #fff" }} />
      )}
      {hasSource && (
        <Handle type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: meta.bg, border: "2px solid #fff" }} />
      )}
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
        style={{ borderColor: "var(--line-soft)", background: meta.bg }}>
        <meta.icon size={14} color="#fff" />
        <span className="text-xs font-semibold uppercase tracking-wider text-white">{meta.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Label</label>
          <input value={data.label ?? ""} onChange={(e) => set("label", e.target.value)}
            className="input w-full text-sm" placeholder="Node label" />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Description</label>
          <textarea value={data.description ?? ""} onChange={(e) => set("description", e.target.value)}
            className="input w-full text-sm" rows={2} placeholder="What does this node do?" />
        </div>

        {/* LLM fields */}
        {data.nodeType === "llm" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Model</label>
              <select value={data.modelId ?? ""} onChange={(e) => set("modelId", e.target.value)}
                className="input w-full text-sm">
                <option value="">— select model —</option>
                {models.map((m) => (
                  <option key={m.modelId} value={m.modelId}>{m.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>System Prompt</label>
              <textarea value={data.systemPrompt ?? ""} onChange={(e) => set("systemPrompt", e.target.value)}
                className="input w-full text-sm" rows={5} placeholder="You are a helpful assistant…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                Temperature — {(data.temperature ?? 0.7).toFixed(1)}
              </label>
              <input type="range" min={0} max={1} step={0.1} value={data.temperature ?? 0.7}
                onChange={(e) => set("temperature", parseFloat(e.target.value))}
                className="w-full accent-indigo-600" />
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--ink-4)" }}>
                <span>Precise</span><span>Creative</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Max Tokens</label>
              <input type="number" value={data.maxTokens ?? ""} onChange={(e) => set("maxTokens", parseInt(e.target.value))}
                className="input w-full text-sm" placeholder="e.g. 2048" min={1} max={128000} />
            </div>
          </>
        )}

        {/* Tool fields */}
        {data.nodeType === "tool" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Tool Type</label>
            <select value={data.toolType ?? ""} onChange={(e) => set("toolType", e.target.value)}
              className="input w-full text-sm">
              <option value="">— select tool —</option>
              {TOOLS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Condition fields */}
        {data.nodeType === "condition" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Condition</label>
            <input value={data.condition ?? ""} onChange={(e) => set("condition", e.target.value)}
              className="input w-full text-sm" placeholder='e.g. output.includes("error")' />
          </div>
        )}

        {/* Human review fields */}
        {data.nodeType === "human_review" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Reviewer Note</label>
            <textarea value={data.reviewNote ?? ""} onChange={(e) => set("reviewNote", e.target.value)}
              className="input w-full text-sm" rows={3} placeholder="Instructions for the human reviewer…" />
          </div>
        )}

        {/* Output fields */}
        {data.nodeType === "output" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>Output Format</label>
            <select value={data.outputFormat ?? "text"} onChange={(e) => set("outputFormat", e.target.value)}
              className="input w-full text-sm">
              <option value="text">Plain text</option>
              <option value="json">JSON object</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="border-t p-3" style={{ borderColor: "var(--line-soft)" }}>
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
    ]).then(([wfData, mData]) => {
      if (wfData.workflow) {
        const wf = wfData.workflow;
        setWorkflow(wf);
        setName(wf.name);
        setStatus(wf.status);
        const rfNodes = toRFNodes(wf.graph?.nodes ?? []);
        const rfEdges = toRFEdges(wf.graph?.edges ?? []);
        setNodes(rfNodes);
        setEdges(rfEdges);
        latestGraph.current = { nodes: wf.graph?.nodes ?? [], edges: wf.graph?.edges ?? [] };
      }
      setModels(
        (mData.models ?? []).map((m: { id?: string; label?: string; modelId?: string; displayName?: string }) => ({
          modelId: m.id || m.modelId || "",
          displayName: m.label || m.displayName || m.id || "",
        }))
      );
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

  async function doSave(
    graph: { nodes: any[]; edges: any[] },
    wfName: string,
    wfStatus: string
  ) {
    setSaveState("saving");
    await fetch(`/api/workflows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: wfName, status: wfStatus, graph }),
    });
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  const PALETTE = Object.entries(NODE_META);

  return (
    <div style={{ margin: "-40px -56px -80px", height: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5 shrink-0"
        style={{ background: "var(--paper-2)", borderColor: "var(--line-soft)", zIndex: 10 }}>
        <button type="button" onClick={() => router.push("/dashboard/workflow")}
          className="md-icon-btn flex items-center gap-1 pr-2 text-sm" style={{ color: "var(--ink-3)" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="h-4 w-px" style={{ background: "var(--line-soft)" }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none"
          style={{ color: "var(--ink)" }}
        />
        <select value={status} onChange={(e) => handleStatusChange(e.target.value)}
          className="input w-auto text-xs py-1">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
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
          style={{ width: 168, background: "var(--paper)", borderColor: "var(--line-soft)" }}>
          <div className="px-3 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
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
          <div className="border-t px-3 py-3" style={{ borderColor: "var(--line-soft)" }}>
            <p className="text-[10px]" style={{ color: "var(--ink-4)" }}>
              Click a node type to add it to the canvas, then drag to position and connect with handles.
            </p>
          </div>
        </div>

        {/* Center: React Flow canvas */}
        <div className="flex-1" style={{ background: "#F8F9FC" }}>
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
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#D1D5DB" />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const nt = (n.data as any)?.nodeType ?? "llm";
                return NODE_META[nt]?.bg ?? "#888";
              }}
              style={{ background: "var(--paper-2)" }}
            />
          </ReactFlow>
        </div>

        {/* Right: Config panel */}
        <div className="shrink-0 border-l"
          style={{ width: 272, background: "var(--paper)", borderColor: "var(--line-soft)" }}>
          {selectedNode ? (
            <ConfigPanel
              node={selectedNode}
              models={models}
              onUpdate={updateNodeData}
              onDelete={deleteNode}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl"
                style={{ background: "var(--paper-3)" }}>
                <GitBranch className="h-6 w-6" style={{ color: "var(--ink-4)" }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>No node selected</p>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-4)" }}>
                  Click any node on the canvas to configure it here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
