"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Play,
  Square,
  Cpu,
  Zap,
  Check,
  Activity,
  ArrowUpRight,
  ExternalLink,
  Clock,
  Info,
  X,
  Gauge,
  ShieldCheck,
  Moon,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Compute Execution Modes ── */
export type ExecutionMode = "on-demand" | "off-peak" | "batch";

interface ExecutionModeConfig {
  id: ExecutionMode;
  label: string;
  badge: string;
  discountText: string;
  description: string;
  availabilityNote: string;
  sla: string;
}

const EXECUTION_MODES: ExecutionModeConfig[] = [
  {
    id: "on-demand",
    label: "On-Demand Dedicated",
    badge: "Instant Real-Time",
    discountText: "Full Price",
    description: "Immediate dedicated GPU instance with zero cold starts, zero queue, and guaranteed non-interrupted runtime.",
    availabilityNote: "Instant launch · 100% Dedicated VRAM",
    sla: "Interactive Sub-Second",
  },
  {
    id: "off-peak",
    label: "Off-Peak Scheduled",
    badge: "10 PM – 8 AM UK & Weekends",
    discountText: "~40% Discount",
    description: "Scheduled compute during predictable low-demand hours (10:00 PM – 8:00 AM UK time & all weekend). Uninterrupted once started.",
    availabilityNote: "Low-demand window · Uninterrupted once provisioned",
    sla: "Scheduled Dedicated",
  },
  {
    id: "batch",
    label: "Flexible Batch Queue",
    badge: "Async Queue (~60% Off)",
    discountText: "Cheapest Rate",
    description: "Cheaper, asynchronous batch processing for bulk image generation and long video diffusion. Jobs queue and process with auto-checkpointing.",
    availabilityNote: "Queue-based · Auto-resumes on spare capacity",
    sla: "Asynchronous Batch (Slower, High Throughput)",
  },
];

/* ── GPU Fleet Tier Specifications ── */
interface GpuTier {
  id: "standard" | "pro" | "max" | "ultra" | "enterprise";
  name: string;
  classEquivalent: string;
  subtitle: string;
  vram: string;
  coreSpeed: string;
  bandwidth: string;
  onDemandHourly: number;
  offPeakHourly: number;
  batchHourly: number;
  recommendedFor: string;
  benchmarks: {
    fluxDev: string;
    imagen3: string;
    veoVideo: string;
  };
  badge?: string;
  popular?: boolean;
  totalAllocations: number;
  availableAllocations: number;
}

const GPU_TIERS: GpuTier[] = [
  {
    id: "standard",
    name: "Standard GPU",
    classEquivalent: "L4 / Metal Class",
    subtitle: "24GB Dedicated VRAM",
    vram: "24 GB High-Speed VRAM",
    coreSpeed: "120 TFLOPS Core Speed",
    bandwidth: "300 GB/s Memory Bandwidth",
    onDemandHourly: 0.79,
    offPeakHourly: 0.47,
    batchHourly: 0.29,
    recommendedFor: "Fast SDXL, Flux Schnell 1024px, LoRA testing & low-latency prototyping.",
    benchmarks: {
      fluxDev: "2.1s / step",
      imagen3: "1.9s (1024px)",
      veoVideo: "Standard Queue",
    },
    badge: "Entry",
    totalAllocations: 16,
    availableAllocations: 11,
  },
  {
    id: "pro",
    name: "Pro GPU",
    classEquivalent: "RTX 4090 / A10G Class",
    subtitle: "24GB Ultra-Fast VRAM",
    vram: "24 GB Ultra-Fast VRAM",
    coreSpeed: "250 TFLOPS Core Speed",
    bandwidth: "600 GB/s Memory Bandwidth",
    onDemandHourly: 1.49,
    offPeakHourly: 0.89,
    batchHourly: 0.59,
    recommendedFor: "Real-time Flux Dev Canvas, ComfyUI node workflows, image-to-video SDV.",
    badge: "Popular",
    popular: true,
    benchmarks: {
      fluxDev: "0.85s / step",
      imagen3: "1.1s (1024px)",
      veoVideo: "6.2s (720p)",
    },
    totalAllocations: 12,
    availableAllocations: 5,
  },
  {
    id: "max",
    name: "Max GPU",
    classEquivalent: "A100 80GB SXM4 Class",
    subtitle: "80GB High-Bandwidth VRAM",
    vram: "80 GB High-Bandwidth VRAM",
    coreSpeed: "312 TFLOPS Core Speed",
    bandwidth: "1,935 GB/s Memory Bandwidth",
    onDemandHourly: 3.29,
    offPeakHourly: 1.98,
    batchHourly: 1.29,
    recommendedFor: "High-res Flux 1.1 Pro, multi-modal video synthesis, full-batch LoRA training.",
    badge: "80GB VRAM",
    benchmarks: {
      fluxDev: "0.48s / step",
      imagen3: "0.72s (1024px)",
      veoVideo: "3.8s (1080p)",
    },
    totalAllocations: 8,
    availableAllocations: 3,
  },
  {
    id: "ultra",
    name: "Ultra GPU",
    classEquivalent: "H100 80GB SXM5 Class",
    subtitle: "80GB Ultra-Bandwidth VRAM",
    vram: "80 GB Ultra-Bandwidth VRAM",
    coreSpeed: "750 TFLOPS Core Speed",
    bandwidth: "3,350 GB/s Memory Bandwidth",
    onDemandHourly: 5.95,
    offPeakHourly: 3.57,
    batchHourly: 2.38,
    recommendedFor: "Cinematic Veo 2 / Wan 2.1 video generation, 4K rendering pipelines, LLM fine-tuning.",
    badge: "Ultra Fast",
    benchmarks: {
      fluxDev: "0.19s / step",
      imagen3: "0.35s (1024px)",
      veoVideo: "1.9s (1080p 60fps)",
    },
    totalAllocations: 6,
    availableAllocations: 2,
  },
  {
    id: "enterprise",
    name: "Enterprise GPUs",
    classEquivalent: "8x H100 640GB Cluster",
    subtitle: "640GB Clustered VRAM",
    vram: "640 GB Clustered VRAM",
    coreSpeed: "6,000 TFLOPS Cluster Compute",
    bandwidth: "3.2 Tbps Ultra Interconnect",
    onDemandHourly: 39.50,
    offPeakHourly: 23.70,
    batchHourly: 18.50,
    recommendedFor: "Production-scale video generation pipelines, high-concurrency enterprise studio endpoints.",
    badge: "Cluster Power",
    benchmarks: {
      fluxDev: "< 0.05s / batch",
      imagen3: "0.12s (4K Ultra)",
      veoVideo: "0.65s (4K Cinema)",
    },
    totalAllocations: 4,
    availableAllocations: 1,
  },
];

type Rental = {
  id: string;
  model: string;
  customModel: string | null;
  deploymentId: string | null;
  sku: string;
  gpuTierName?: string;
  status: string;
  hourlyRate: number;
  hours: number | null;
  modelId: string | null;
  weightsUri: string | null;
  startedAt: string | null;
  endedAt: string | null;
  executionMode: ExecutionMode;
  deployment: {
    id: string;
    name: string;
    target: string;
    status: string;
    fqdn: string | null;
  } | null;
};

export default function PremiumGpuPage() {
  const [selectedTier, setSelectedTier] = useState<GpuTier["id"]>("pro");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("off-peak");
  const [inspectModalTier, setInspectModalTier] = useState<GpuTier | null>(null);
  const [durationHours, setDurationHours] = useState<number>(12);
  const [selectedModel, setSelectedModel] = useState("flux-1-dev");
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<"configure" | "active">("configure");

  const [rentals, setRentals] = useState<Rental[]>([
    {
      id: "rent-1",
      model: "premium:flux-1-dev-pro",
      customModel: null,
      deploymentId: "dep-1",
      sku: "pro-gpu-24gb",
      gpuTierName: "Pro GPU (24GB Ultra-Fast · RTX 4090 Class)",
      status: "active",
      hourlyRate: 0.89,
      hours: 12,
      executionMode: "off-peak",
      modelId: "flux-1-dev",
      weightsUri: "black-forest-labs/FLUX.1-dev",
      startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      endedAt: null,
      deployment: {
        id: "dep-1",
        name: "Dedicated Pro GPU Node",
        target: "cloud",
        status: "running",
        fqdn: "gpu-node-us-central1.opendoor.ai",
      },
    },
  ]);

  const activeTier = GPU_TIERS.find((t) => t.id === selectedTier) || GPU_TIERS[1];
  const activeModeConfig = EXECUTION_MODES.find((m) => m.id === executionMode) || EXECUTION_MODES[1];

  const effectiveHourlyRate =
    executionMode === "batch"
      ? activeTier.batchHourly
      : executionMode === "off-peak"
        ? activeTier.offPeakHourly
        : activeTier.onDemandHourly;

  const totalCost = (effectiveHourlyRate * durationHours).toFixed(2);
  const standardCost = (activeTier.onDemandHourly * durationHours).toFixed(2);
  const savings = (Number(standardCost) - Number(totalCost)).toFixed(2);

  async function startGpuRental(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);

    try {
      const newRental: Rental = {
        id: `rent-${Date.now()}`,
        model: `premium:${selectedModel}`,
        customModel: null,
        deploymentId: null,
        sku: activeTier.id,
        gpuTierName: `${activeTier.name} (${activeTier.classEquivalent})`,
        status: "active",
        hourlyRate: effectiveHourlyRate,
        hours: durationHours,
        executionMode: executionMode,
        modelId: selectedModel,
        weightsUri: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        deployment: {
          id: `dep-${Date.now()}`,
          name: `${activeTier.name} Node`,
          target: "cloud",
          status: "running",
          fqdn: `gpu-${activeTier.id}.opendoor.ai`,
        },
      };
      setRentals((prev) => [newRental, ...prev]);
      setActiveTab("active");
    } finally {
      setStarting(false);
    }
  }

  async function stopGpuRental(id: string) {
    setRentals((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] overflow-hidden space-y-3">
      {/* ── Compact Header Bar with Transparent Policy Definition ── */}
      <div className="flex items-center justify-between shrink-0 bg-card text-card-foreground border border-border rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span>GPU Rental Hub</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                executionMode === "batch"
                  ? "bg-warning-soft text-warning border-warning/30"
                  : executionMode === "off-peak"
                    ? "bg-success-soft text-success border-success/20"
                    : "bg-primary/10 text-primary border-primary/20"
              )}>
                {executionMode === "batch"
                  ? "📦 BATCH QUEUE (~60% OFF)"
                  : executionMode === "off-peak"
                    ? "🌙 OFF-PEAK HOURS (10 PM–8 AM UK)"
                    : "⚡ ON-DEMAND DEDICATED"}
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground font-mono">
              Off-peak: 10:00 PM–8:00 AM UK time & weekends · Batch: Asynchronous bulk rendering · No cold starts on dedicated
            </p>
          </div>
        </div>

        {/* 3-Way Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-muted p-0.5 border border-border text-xs">
            {EXECUTION_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setExecutionMode(mode.id)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all flex items-center gap-1",
                  executionMode === mode.id
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode.id === "on-demand" && <Zap className="h-3 w-3" />}
                {mode.id === "off-peak" && <Moon className="h-3 w-3" />}
                {mode.id === "batch" && <ListOrdered className="h-3 w-3" />}
                <span>{mode.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>

          <Link href="/dashboard/studio" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <span>Studio</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* ── 1. 5-Tier GPU Selection Row ── */}
      <div className="grid grid-cols-5 gap-2.5 shrink-0">
        {GPU_TIERS.map((tier) => {
          const isSelected = selectedTier === tier.id;
          const currentHourly =
            executionMode === "batch"
              ? tier.batchHourly
              : executionMode === "off-peak"
                ? tier.offPeakHourly
                : tier.onDemandHourly;

          const percentAvailable = Math.round((tier.availableAllocations / tier.totalAllocations) * 100);

          return (
            <div
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={cn(
                "group relative cursor-pointer flex flex-col justify-between rounded-2xl border p-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg bg-card text-card-foreground",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted",
              )}
            >
              {/* Header with Title & Info Button */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold font-mono text-foreground truncate">
                  {tier.name}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectModalTier(tier);
                  }}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="View speed & performance benchmarks"
                >
                  <Info className="h-3.5 w-3.5 text-primary" />
                </button>
              </div>

              {/* Class Equivalent & VRAM */}
              <div className="mt-1">
                <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-mono text-primary border border-border mb-1">
                  {tier.classEquivalent}
                </span>
                <p className="text-[10px] text-success font-mono font-semibold truncate">{tier.vram}</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono text-foreground">${currentHourly.toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">/ hr</span>
                </div>
              </div>

              {/* Core Speed Specs */}
              <div className="mt-2 flex items-center justify-between text-[10px] border-t border-border pt-1.5 text-muted-foreground font-mono">
                <span>Speed</span>
                <span className="text-foreground font-semibold">{tier.coreSpeed.split(" ")[0]} {tier.coreSpeed.split(" ")[1]}</span>
              </div>

              {/* Slot Allocation Counter */}
              <div className="mt-1.5 space-y-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-muted-foreground">Slots</span>
                  <span className={tier.availableAllocations <= 2 ? "text-warning" : "text-success"}>
                    {tier.availableAllocations}/{tier.totalAllocations} Left
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", tier.availableAllocations <= 2 ? "bg-warning" : "bg-success")}
                    style={{ width: `${percentAvailable}%` }}
                  />
                </div>
              </div>

              {/* Select Action */}
              <div className="mt-2">
                <div
                  className={cn(
                    "w-full rounded-lg py-1 text-[10px] font-semibold text-center transition-all",
                    isSelected ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {isSelected ? "Selected" : "Choose"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. Lower Main Workspace Grid (Fit to Viewport) ── */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Left Form: Configure & Launch (Col 7) */}
        <div className="col-span-7 card p-4 flex flex-col justify-between bg-card text-card-foreground border-border">
          <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-xs font-bold text-foreground">Configure {activeTier.name} ({activeModeConfig.label})</h2>
                <p className="text-[10px] text-muted-foreground">{activeModeConfig.availabilityNote}</p>
              </div>
            </div>
            <span className="text-xs font-mono text-foreground font-semibold shrink-0">
              ${effectiveHourlyRate.toFixed(2)} / hr ({executionMode.toUpperCase()})
            </span>
          </div>

          <form onSubmit={startGpuRental} className="flex-1 flex flex-col justify-between py-2 space-y-3">
            {/* Duration Range (7h - 24h) */}
            <div className="space-y-2 rounded-xl border border-border bg-muted p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-foreground font-medium">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Duration: <span className="font-mono text-primary font-bold">{durationHours} Hours</span></span>
                  {durationHours === 24 && <span className="text-[10px] text-success font-mono">(1 Full Day)</span>}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">Min 7h · Max 24h</span>
              </div>

              <input
                type="range"
                min={7}
                max={24}
                step={1}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="w-full h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
              />

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "7h (Min)", val: 7 },
                  { label: "12h (Half Day)", val: 12 },
                  { label: "18h (Extended)", val: 18 },
                  { label: "24h (Full Day)", val: 24 },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setDurationHours(p.val)}
                    className={cn(
                      "py-1 text-[10px] font-mono rounded-lg border transition-all text-center",
                      durationHours === p.val
                        ? "border-primary bg-primary/10 text-foreground font-bold"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selector & LoRA URI */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Preloaded Model Pipeline</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="input w-full text-xs font-mono py-1.5"
                >
                  <option value="flux-1-dev">Flux.1 Dev (1024px Full Precision)</option>
                  <option value="flux-1-schnell">Flux.1 Schnell (4-Step Realtime)</option>
                  <option value="google-imagen-3">Google Imagen 3 (Ultra 8K)</option>
                  <option value="google-veo-2">Google Veo 2 (Video Diffusion)</option>
                  <option value="comfyui-flux">ComfyUI Suite + Node Graph</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Execution SLA Guarantee</label>
                <input
                  type="text"
                  readOnly
                  value={activeModeConfig.sla}
                  className="input w-full text-xs font-mono py-1.5 opacity-90 cursor-default"
                />
              </div>
            </div>

            {/* Total Cost & Launch Button */}
            <div className="flex items-center justify-between pt-2 border-t border-border shrink-0">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-muted-foreground">Total ({durationHours}h):</span>
                  <span className="font-mono font-bold text-foreground text-base">${totalCost} USD</span>
                  {executionMode !== "on-demand" && Number(savings) > 0 && (
                    <span className="text-[11px] text-muted-foreground line-through font-mono">${standardCost}</span>
                  )}
                </div>
                {executionMode !== "on-demand" && Number(savings) > 0 && (
                  <p className="text-[10px] text-success font-mono">
                    Save ${savings} USD with {activeModeConfig.label}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={starting || activeTier.availableAllocations <= 0}
                className="btn-primary flex items-center gap-2 px-5 py-2 text-xs rounded-xl"
              >
                {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                <span>
                  {executionMode === "batch" ? "Submit to Batch Queue" : `Rent ${activeTier.name} (${durationHours}h)`}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: Active Nodes & Hardware Specs (Col 5) */}
        <div className="col-span-5 card p-4 flex flex-col justify-between border-border bg-card text-card-foreground">
          {/* Tab Switcher for Right Panel */}
          <div className="flex items-center justify-between pb-2 border-b border-border shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("configure")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors",
                  activeTab === "configure" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Pricing & SLAs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1",
                  activeTab === "active" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>Active Nodes</span>
                <span className="rounded-full bg-success-soft px-1.5 text-[9px] font-mono text-success">
                  {rentals.length}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setInspectModalTier(activeTier)}
              className="text-[11px] text-primary hover:text-primary flex items-center gap-1 font-medium"
            >
              <span>Full Details</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {activeTab === "configure" ? (
            <div className="flex-1 flex flex-col justify-between py-2 text-xs space-y-2">
              <div className="space-y-1.5 font-mono">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground font-sans">On-Demand Dedicated</span>
                  <span className="text-foreground">${activeTier.onDemandHourly.toFixed(2)}/hr (Instant)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground font-sans">Off-Peak (10 PM–8 AM UK)</span>
                  <span className="text-success font-bold">${activeTier.offPeakHourly.toFixed(2)}/hr</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground font-sans">Flexible Batch Queue</span>
                  <span className="text-warning font-bold">${activeTier.batchHourly.toFixed(2)}/hr (Async)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground font-sans">Flux.1 Dev Latency</span>
                  <span className="text-primary font-bold">{activeTier.benchmarks.fluxDev}</span>
                </div>
              </div>

              {/* Policy Explanation Box */}
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5 text-[11px] text-muted-foreground">
                <p className="font-semibold text-primary flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Workload & Interruption Transparency</span>
                </p>
                <p className="text-muted-foreground mt-0.5 leading-relaxed text-[10px]">
                  • <strong>On-Demand & Off-Peak</strong>: 100% dedicated, non-interrupted instances.<br/>
                  • <strong>Batch Queue</strong>: Jobs process asynchronously when capacity frees up.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between py-1 overflow-y-auto space-y-2">
              {rentals.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-border bg-muted px-4 py-8 text-center">
                  <Activity className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">No active nodes</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rent a GPU from Configure to see it here.
                  </p>
                </div>
              ) : null}
              {rentals.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-muted p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success-soft text-success">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{r.gpuTierName || r.model}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">${r.hourlyRate.toFixed(2)}/hr · {r.hours}h ({r.executionMode})</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Link href="/dashboard/studio" className="btn-secondary text-[10px] px-2 py-1 flex items-center gap-1">
                      <span>Studio</span>
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => stopGpuRental(r.id)}
                      className="rounded-lg p-1 text-muted-foreground hover:text-destructive hover:bg-muted"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Interactive Detail & Benchmark Modal Dialog ── */}
      {inspectModalTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setInspectModalTier(null)}
          />

          <div
            className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">{inspectModalTier.name}</h3>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                      {inspectModalTier.classEquivalent}
                    </span>
                  </div>
                  <p className="text-xs text-success font-mono font-semibold">{inspectModalTier.vram}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectModalTier(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Pricing by Execution Mode */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Pricing by Compute Execution Mode
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="rounded-xl bg-muted p-2.5 border border-border">
                  <span className="text-muted-foreground text-[10px] block">⚡ On-Demand</span>
                  <span className="text-foreground font-bold">${inspectModalTier.onDemandHourly.toFixed(2)}/hr</span>
                  <span className="text-[9px] text-muted-foreground block mt-0.5">Instant dedicated</span>
                </div>
                <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20">
                  <span className="text-primary text-[10px] block">🌙 Off-Peak (10 PM–8 AM)</span>
                  <span className="text-success font-bold">${inspectModalTier.offPeakHourly.toFixed(2)}/hr</span>
                  <span className="text-[9px] text-success block mt-0.5">Uninterrupted</span>
                </div>
                <div className="rounded-xl bg-warning-soft p-2.5 border border-warning/30">
                  <span className="text-warning text-[10px] block">📦 Batch Queue</span>
                  <span className="text-warning font-bold">${inspectModalTier.batchHourly.toFixed(2)}/hr</span>
                  <span className="text-[9px] text-warning block mt-0.5">Async throughput</span>
                </div>
              </div>
            </div>

            {/* Inference Speed Benchmarks */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-primary" />
                <span>Live Inference Benchmarks</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-2">
                  <span className="text-[10px] text-muted-foreground block">Flux.1 Dev</span>
                  <span className="font-mono text-primary font-bold mt-0.5 block">{inspectModalTier.benchmarks.fluxDev}</span>
                </div>
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-2">
                  <span className="text-[10px] text-muted-foreground block">Google Imagen 3</span>
                  <span className="font-mono text-primary font-bold mt-0.5 block">{inspectModalTier.benchmarks.imagen3}</span>
                </div>
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-2">
                  <span className="text-[10px] text-muted-foreground block">Veo 2 Video</span>
                  <span className="font-mono text-primary font-bold mt-0.5 block">{inspectModalTier.benchmarks.veoVideo}</span>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setInspectModalTier(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTier(inspectModalTier.id);
                  setInspectModalTier(null);
                }}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Select {inspectModalTier.name}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
