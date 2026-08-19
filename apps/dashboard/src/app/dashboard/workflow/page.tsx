"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  GitBranch, Plus, Loader2, MoreVertical,
  Archive, Trash2, Copy, ArrowRight, Bot, Wrench,
  CheckSquare, UserCheck, Shuffle,
} from "lucide-react";

interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; modelId?: string; systemPrompt?: string; toolType?: string };
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  graph: { nodes: WorkflowNode[]; edges: unknown[] };
  tags: string[];
  updatedAt: string;
  createdAt: string;
}

const CATEGORIES = ["all", "general", "content", "research", "coding", "analysis", "support"];
const CATEGORY_LABELS: Record<string, string> = {
  all: "All", general: "General", content: "Content",
  research: "Research", coding: "Coding", analysis: "Analysis", support: "Support",
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:    { bg: "hsl(var(--accent))",    color: "hsl(var(--muted-foreground))",  label: "Draft"    },
  active:   { bg: "var(--green-soft)", color: "var(--green)",  label: "Active"   },
  archived: { bg: "#E9EBF2",           color: "#43474E",       label: "Archived" },
};

const NODE_TYPE_ICONS: Record<string, React.ElementType> = {
  input: ArrowRight, llm: Bot, tool: Wrench,
  condition: GitBranch, transform: Shuffle,
  output: CheckSquare, human_review: UserCheck,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function primaryModel(graph: Workflow["graph"]) {
  const llm = graph?.nodes?.find((n) => n.type === "llm");
  return llm?.data?.modelId ?? null;
}

function nodeTypeCount(graph: Workflow["graph"], type: string) {
  return graph?.nodes?.filter((n) => n.type === type).length ?? 0;
}

// ── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description, category }),
    });
    if (res.ok) {
      const data = await res.json();
      onCreate(data.workflow.id);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <form onSubmit={submit} className="card w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "hsl(var(--border))" }}>
          <h2 className="section-title">New Workflow</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              Name <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="input w-full" placeholder="e.g. Document Summarisation" autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="input w-full" rows={2} placeholder="What does this workflow do?" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input w-full">
              {CATEGORIES.filter((c) => c !== "all").map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4"
          style={{ borderColor: "hsl(var(--border))" }}>
          <button type="button" onClick={onClose} className="md-btn-outlined px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !name.trim()}
            className="md-btn-filled flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create &amp; Open Editor
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Workflow card ─────────────────────────────────────────────────────────────

function WorkflowCard({
  wf,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  wf: Workflow;
  onOpen: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const st = STATUS_STYLE[wf.status] ?? STATUS_STYLE.draft;
  const nodeCount = wf.graph?.nodes?.length ?? 0;
  const model = primaryModel(wf.graph);

  // Node type summary
  const nodeTypes = ["llm", "tool", "condition", "human_review"];
  const typeCounts = nodeTypes.map((t) => ({ type: t, n: nodeTypeCount(wf.graph, t) })).filter((x) => x.n > 0);

  return (
    <div className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
              style={{ background: st.bg, color: st.color }}>{st.label}</span>
            <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
              style={{ background: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))" }}>{CATEGORY_LABELS[wf.category] ?? wf.category}</span>
          </div>
          <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>{wf.name}</h3>
          {wf.description && (
            <p className="mt-1 text-xs leading-snug line-clamp-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              {wf.description}
            </p>
          )}
        </div>
        <div className="relative shrink-0">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="md-icon-btn h-7 w-7" aria-label="More">
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 rounded-xl border py-1 shadow-lg w-36"
                style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
                {[
                  { icon: Copy,    label: "Duplicate", fn: onDuplicate },
                  { icon: Archive, label: wf.status === "archived" ? "Unarchive" : "Archive", fn: onArchive },
                  { icon: Trash2,  label: "Delete",    fn: onDelete,   red: true },
                ].map(({ icon: Icon, label, fn, red }) => (
                  <button key={label} onClick={() => { setMenuOpen(false); fn(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
                    style={{ color: red ? "var(--red)" : "hsl(var(--muted-foreground))" }}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Node summary */}
      <div className="px-5 pb-3">
        <div className="flex flex-wrap gap-1">
          {typeCounts.map(({ type, n }) => {
            const Icon = NODE_TYPE_ICONS[type] ?? Bot;
            return (
              <span key={type} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))" }}>
                <Icon className="h-3 w-3" />
                {n} {type.replace("_", " ")}
              </span>
            );
          })}
          {nodeCount === 0 && (
            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>No nodes yet</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t px-5 py-3 flex items-center justify-between gap-2"
        style={{ borderColor: "hsl(var(--border))" }}>
        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {nodeCount} node{nodeCount !== 1 ? "s" : ""}
          {model && <> · <code className="text-[11px]">{model}</code></>}
          {" · "}{timeAgo(wf.updatedAt)}
        </div>
        <button onClick={onOpen}
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: "hsl(var(--muted-foreground))" }}>
          Open Editor <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [category, setCategory] = useState("all");

  async function load() {
    const res = await fetch("/api/workflows");
    const data = await res.json();
    setWorkflows(data.workflows ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function duplicate(wf: Workflow) {
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${wf.name} (copy)`,
        description: wf.description,
        category: wf.category,
        graph: wf.graph,
      }),
    });
    load();
  }

  async function archive(wf: Workflow) {
    await fetch(`/api/workflows/${wf.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: wf.status === "archived" ? "draft" : "archived" }),
    });
    load();
  }

  async function deleteWorkflow(id: string) {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    load();
  }

  const filtered = useMemo(() =>
    category === "all" ? workflows : workflows.filter((w) => w.category === category),
    [workflows, category]
  );

  const stats = useMemo(() => ({
    total:    workflows.length,
    active:   workflows.filter((w) => w.status === "active").length,
    draft:    workflows.filter((w) => w.status === "draft").length,
  }), [workflows]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="Workflows"
        description="Design and manage node-based LLM pipelines with models, tools, and approvals."
        actions={
          <button onClick={() => setShowCreate(true)}
            className="md-btn-filled shrink-0 flex items-center gap-2 px-4 py-2">
            <Plus className="h-4 w-4" /> New Workflow
          </button>
        }
      />

      {/* Stats */}
      {workflows.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: "Total",  value: stats.total,  color: "hsl(var(--foreground))"   },
            { label: "Active", value: stats.active, color: "var(--green)" },
            { label: "Draft",  value: stats.draft,  color: "var(--yellow)"},
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 text-center">
              <p className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</p>
              <p className="mt-0.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Category filter */}
      {workflows.length > 0 && (
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map((c) => {
            const count = c === "all" ? workflows.length : workflows.filter((w) => w.category === c).length;
            if (c !== "all" && count === 0) return null;
            return (
              <button key={c} onClick={() => setCategory(c)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: category === c ? "hsl(var(--foreground))" : "hsl(var(--accent))",
                  color: category === c ? "#fff" : "hsl(var(--muted-foreground))",
                }}>
                {CATEGORY_LABELS[c]}
                <span className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                  style={{
                    background: category === c ? "rgba(255,255,255,0.2)" : "hsl(var(--card))",
                    color: category === c ? "#fff" : "hsl(var(--muted-foreground))",
                  }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {workflows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-5 py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl"
            style={{ background: "hsl(var(--accent))" }}>
            <GitBranch className="h-8 w-8" style={{ color: "hsl(var(--muted-foreground))" }} />
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>No workflows yet</p>
            <p className="mt-1 max-w-sm text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Build node-based LLM pipelines — chain models, tools, conditions, and human review steps visually.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="md-btn-filled flex items-center gap-2 px-6 py-2.5 text-sm">
            <Plus className="h-4 w-4" /> Create your first workflow
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-32 items-center justify-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          No workflows in this category.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              onOpen={() => router.push(`/dashboard/workflow/${wf.id}`)}
              onDuplicate={() => duplicate(wf)}
              onArchive={() => archive(wf)}
              onDelete={() => deleteWorkflow(wf.id)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(id) => router.push(`/dashboard/workflow/${id}`)}
        />
      )}
    </div>
  );
}
