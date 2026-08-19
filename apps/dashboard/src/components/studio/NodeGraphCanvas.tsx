"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
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
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Sparkles,
  Play,
  Layers,
  Image as ImageIcon,
  Sliders,
  Maximize2,
  Download,
  Plus,
  RotateCcw,
  Upload,
  Cpu,
  Eye,
  Timer,
} from "lucide-react";
import type { GenerationFamily } from "./LumaSettingsPopover";
import { STYLE_PRESETS, OPENDOOR_STUDIO_MODELS } from "@/lib/studio-constants";

// ── Sockets & Colors ────────────────────────────────────────────────────────
const SOCKET_COLORS = {
  model: "#ec4899",       // Magenta
  clip: "#eab308",        // Yellow
  vae: "#ef4444",         // Red
  conditioning: "#f97316",// Orange
  latent: "#a855f7",      // Purple
  image: "#06b6d4",       // Cyan
};

export interface NodeGraphAsset {
  id: string;
  url: string;
  kind: "image" | "video" | "audio";
  prompt: string;
  model: string;
  timestamp: number;
}

interface NodeGraphCanvasProps {
  family?: GenerationFamily;
  onAssetGenerated?: (asset: NodeGraphAsset) => void;
  onSendToCanvas?: (url: string) => void;
}

export type NodeGraphCanvasHandle = {
  applyPromptAndRun: (prompt?: string) => Promise<void>;
};

// ── Custom Node 1: Prompt Node ──────────────────────────────────────────────
function PromptNodeComponent({ id, data }: { id: string; data: any }) {
  return (
    <div className="w-76 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-orange-400">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Prompt / Conditioning</span>
        </div>
        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-orange-300">CLIP</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-400">Positive Prompt</label>
          <textarea
            value={data.prompt || ""}
            onChange={(e) => data.onChange?.(id, "prompt", e.target.value)}
            placeholder={data.placeholder || "Describe the desired image scene..."}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder-zinc-500 focus:border-orange-500/50 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-400">Style Preset</label>
          <select
            value={data.stylePreset || "none"}
            onChange={(e) => data.onChange?.(id, "stylePreset", e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 p-2 text-[11px] text-zinc-200 focus:outline-none transition-colors"
          >
            {STYLE_PRESETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-400">Negative Prompt</label>
          <input
            type="text"
            value={data.negativePrompt || ""}
            onChange={(e) => data.onChange?.(id, "negativePrompt", e.target.value)}
            placeholder="blurry, distorted, low quality..."
            className="w-full rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Input / Output Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="clip_in"
        style={{ top: "35%", background: SOCKET_COLORS.clip, width: 9, height: 9 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="conditioning_out"
        style={{ top: "45%", background: SOCKET_COLORS.conditioning, width: 9, height: 9 }}
      />
    </div>
  );
}

// ── Custom Node 2: Checkpoint Loader Node ───────────────────────────────────
function ModelLoaderNodeComponent({ id, data }: { id: string; data: any }) {
  return (
    <div className="w-68 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-pink-400">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" />
          <span>Load Checkpoint</span>
        </div>
        <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-pink-300">Model</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-400">Model Architecture</label>
          <select
            value={data.model || "opendoor-flux-canvas"}
            onChange={(e) => data.onChange?.(id, "model", e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 p-2 text-[11px] text-zinc-200 focus:outline-none transition-colors"
          >
            {OPENDOOR_STUDIO_MODELS.filter((m) => {
              if (!data.category) return true;
              if (data.category === "image") return m.category === "image" || m.category === "enhance";
              return m.category === data.category;
            }).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-[11px] text-zinc-400">
          <span>Precision</span>
          <span className="font-mono text-zinc-200">FP16 / TensorRT</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="model_out"
        style={{ top: "30%", background: SOCKET_COLORS.model, width: 9, height: 9 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="clip_out"
        style={{ top: "60%", background: SOCKET_COLORS.clip, width: 9, height: 9 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="vae_out"
        style={{ top: "85%", background: SOCKET_COLORS.vae, width: 9, height: 9 }}
      />
    </div>
  );
}

// ── Custom Node 3: Empty Latent Image Node ───────────────────────────────────
function LatentNodeComponent({ id, data }: { id: string; data: any }) {
  const RESOLUTIONS = ["1024x1024 (1:1)", "1280x720 (16:9)", "720x1280 (9:16)", "1024x768 (4:3)", "1152x768 (3:2)"];

  return (
    <div className="w-60 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-purple-400">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          <span>Empty Latent</span>
        </div>
        <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-purple-300">Latent</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-400">Resolution (Aspect)</label>
          <select
            value={data.resolution || "1024x1024"}
            onChange={(e) => data.onChange?.(id, "resolution", e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 p-2 text-[11px] text-zinc-200 focus:outline-none transition-colors"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r.split(" ")[0]}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-[11px] text-zinc-400">
          <span>Batch Count</span>
          <span className="font-mono text-zinc-200">1</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="latent_out"
        style={{ top: "50%", background: SOCKET_COLORS.latent, width: 9, height: 9 }}
      />
    </div>
  );
}

// ── Custom Node 4: KSampler Node ─────────────────────────────────────────────
function SamplerNodeComponent({ id, data }: { id: string; data: any }) {
  return (
    <div className="w-76 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-emerald-400">
        <div className="flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5" />
          <span>KSampler Engine</span>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-emerald-300">Sampler</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <div className="flex items-center justify-between text-[10px] font-medium text-zinc-400">
            <span>Steps</span>
            <span className="font-mono text-zinc-200">{data.steps || 28}</span>
          </div>
          <input
            type="range"
            min={10}
            max={50}
            value={data.steps || 28}
            onChange={(e) => data.onChange?.(id, "steps", parseInt(e.target.value))}
            className="w-full accent-emerald-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] font-medium text-zinc-400">
            <span>CFG Guidance</span>
            <span className="font-mono text-zinc-200">{data.cfg || 7.5}</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={data.cfg || 7.5}
            onChange={(e) => data.onChange?.(id, "cfg", parseFloat(e.target.value))}
            className="w-full accent-emerald-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] font-medium text-zinc-400">
            <span>Denoise Strength</span>
            <span className="font-mono text-zinc-200">{Math.round((data.denoise || 0.75) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={data.denoise || 0.75}
            onChange={(e) => data.onChange?.(id, "denoise", parseFloat(e.target.value))}
            className="w-full accent-emerald-400"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-[11px] text-zinc-400">
          <span>Algorithm</span>
          <span className="font-mono text-zinc-200">euler_ancestral</span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="model_in"
        style={{ top: "20%", background: SOCKET_COLORS.model, width: 9, height: 9 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="positive_in"
        style={{ top: "45%", background: SOCKET_COLORS.conditioning, width: 9, height: 9 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="latent_in"
        style={{ top: "75%", background: SOCKET_COLORS.latent, width: 9, height: 9 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="latent_out"
        style={{ top: "50%", background: SOCKET_COLORS.latent, width: 9, height: 9 }}
      />
    </div>
  );
}

// ── Custom Node 5: Image Loader Node ─────────────────────────────────────────
function ImageLoaderNodeComponent({ id, data }: { id: string; data: any }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      data.onChange?.(id, "imageUrl", String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-68 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-cyan-400">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>Load Reference Image</span>
        </div>
        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-cyan-300">Image</span>
      </div>

      <div className="space-y-2">
        {data.imageUrl ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <img src={data.imageUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => data.onChange?.(id, "imageUrl", null)}
              className="absolute right-1.5 top-1.5 rounded-lg bg-black/80 px-2 py-0.5 text-[10px] text-white hover:bg-black transition-colors"
            >
              Clear
            </button>
          </div>
        ) : (
          <label className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-black/30 p-3 text-center text-zinc-400 hover:border-cyan-400/50 hover:text-white transition-all">
            <Upload className="h-4 w-4" />
            <span className="text-[10px]">Drop or click to upload</span>
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="image_out"
        style={{ top: "50%", background: SOCKET_COLORS.image, width: 9, height: 9 }}
      />
    </div>
  );
}

// ── Custom Node 6: 4K Enhancer Node ──────────────────────────────────────────
function UpscalerNodeComponent({ id, data }: { id: string; data: any }) {
  return (
    <div className="w-60 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-amber-400">
        <div className="flex items-center gap-1.5">
          <Maximize2 className="h-3.5 w-3.5" />
          <span>4K Detail Enhancer</span>
        </div>
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-amber-300">Upscale</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-400">Magnification</label>
          <div className="flex gap-2">
            {[2, 4].map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => data.onChange?.(id, "scale", scale)}
                className={`flex-1 rounded-xl py-1 text-center font-mono font-semibold transition-all ${
                  (data.scale || 2) === scale
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-black/30 text-zinc-400 border border-white/5 hover:bg-black/50"
                }`}
              >
                {scale}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-[11px] text-zinc-400">
          <span>Engine</span>
          <span className="font-mono text-zinc-200">Krea Super-Res</span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="image_in"
        style={{ top: "50%", background: SOCKET_COLORS.image, width: 9, height: 9 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="image_out"
        style={{ top: "50%", background: SOCKET_COLORS.image, width: 9, height: 9 }}
      />
    </div>
  );
}

// ── Custom Node 7: Output & Preview Node ────────────────────────────────────
function OutputNodeComponent({ data }: { id: string; data: any }) {
  return (
    <div className="w-76 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-zinc-200">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-cyan-400" />
          <span>Synthesis Output</span>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-mono font-medium text-zinc-300">Preview</span>
      </div>

      <div className="space-y-2.5">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center">
          {data.isRendering ? (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Sparkles className="h-6 w-6 animate-spin text-amber-400" />
              <span className="text-[11px] text-zinc-400">Computing node latent pass...</span>
            </div>
          ) : data.outputUrl && data.kind === "video" ? (
            <video src={data.outputUrl} muted loop playsInline className="h-full w-full object-contain" />
          ) : data.outputUrl && data.kind === "audio" ? (
            <div className="flex flex-col items-center gap-2 p-3 text-center">
              <Timer className="h-6 w-6 text-cyan-400" />
              <audio src={data.outputUrl} controls className="w-full" />
            </div>
          ) : data.outputUrl ? (
            <img src={data.outputUrl} alt="Graph Output" className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-zinc-600">
              <Layers className="h-6 w-6 opacity-40" />
              <span className="text-[10px]">Awaiting graph execution</span>
            </div>
          )}
        </div>

        {data.outputUrl && (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => data.onSendToCanvas?.(data.outputUrl)}
              className="flex-1 rounded border border-white/10 bg-white/5 py-1 text-center text-[10px] font-medium text-white hover:bg-white/10"
            >
              Send to Canvas
            </button>
            <a
              href={data.outputUrl}
              download="studio-node-output.png"
              className="flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-300 hover:text-white"
              title="Download"
            >
              <Download className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="image_in"
        style={{ top: "45%", background: SOCKET_COLORS.image, width: 8, height: 8 }}
      />
    </div>
  );
}

function DurationNodeComponent({ id, data }: { id: string; data: any }) {
  return (
    <div className="w-56 rounded-2xl border border-white/10 bg-[#121420]/90 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px] font-semibold text-cyan-300">
        <div className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          <span>Duration</span>
        </div>
        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-cyan-300">Time</span>
      </div>
      <div className="flex gap-1.5">
        {([5, 9] as const).map((seconds) => (
          <button
            key={seconds}
            type="button"
            onClick={() => data.onChange?.(id, "duration", seconds)}
            className={`flex-1 rounded-xl py-1.5 font-mono text-[11px] font-semibold ${
              (data.duration || 5) === seconds
                ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-200"
                : "border border-white/5 bg-black/30 text-zinc-400 hover:bg-black/50"
            }`}
          >
            {seconds}s
          </button>
        ))}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="duration_out"
        style={{ top: "50%", background: SOCKET_COLORS.image, width: 8, height: 8 }}
      />
    </div>
  );
}

// ── Register Node Types ──────────────────────────────────────────────────────
const nodeTypes = {
  prompt: PromptNodeComponent,
  model: ModelLoaderNodeComponent,
  latent: LatentNodeComponent,
  sampler: SamplerNodeComponent,
  imageLoader: ImageLoaderNodeComponent,
  upscaler: UpscalerNodeComponent,
  output: OutputNodeComponent,
  duration: DurationNodeComponent,
};

// ── Pre-configured Templates ─────────────────────────────────────────────────
const TEMPLATE_TXT2IMG_NODES: Node[] = [
  {
    id: "model-1",
    type: "model",
    position: { x: 40, y: 80 },
    data: { model: "opendoor-flux-canvas", category: "image" },
  },
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 40, y: 260 },
    data: { prompt: "A sleek modern architectural villa at dusk with warm glowing lights and reflective pool", stylePreset: "photorealistic" },
  },
  {
    id: "latent-1",
    type: "latent",
    position: { x: 340, y: 60 },
    data: { resolution: "1024x1024" },
  },
  {
    id: "sampler-1",
    type: "sampler",
    position: { x: 340, y: 220 },
    data: { steps: 28, cfg: 7.5, denoise: 0.75 },
  },
  {
    id: "output-1",
    type: "output",
    position: { x: 670, y: 150 },
    data: {},
  },
];

const TEMPLATE_TXT2IMG_EDGES: Edge[] = [
  { id: "e1-2", source: "model-1", sourceHandle: "clip_out", target: "prompt-1", targetHandle: "clip_in", animated: true, style: { stroke: SOCKET_COLORS.clip } },
  { id: "e1-3", source: "model-1", sourceHandle: "model_out", target: "sampler-1", targetHandle: "model_in", animated: true, style: { stroke: SOCKET_COLORS.model } },
  { id: "e2-3", source: "prompt-1", sourceHandle: "conditioning_out", target: "sampler-1", targetHandle: "positive_in", animated: true, style: { stroke: SOCKET_COLORS.conditioning } },
  { id: "e3-4", source: "latent-1", sourceHandle: "latent_out", target: "sampler-1", targetHandle: "latent_in", animated: true, style: { stroke: SOCKET_COLORS.latent } },
  { id: "e4-5", source: "sampler-1", sourceHandle: "latent_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.image } },
];

const FAMILY_TEMPLATES: Record<GenerationFamily, { id: string; label: string; nodes: Node[]; edges: Edge[] }[]> = {
  images: [
    { id: "txt2img", label: "Text to Image", nodes: TEMPLATE_TXT2IMG_NODES, edges: TEMPLATE_TXT2IMG_EDGES },
    {
      id: "img2img_upscale",
      label: "Image remix + 4K",
      nodes: [
        { id: "img-1", type: "imageLoader", position: { x: 40, y: 60 }, data: {} },
        { id: "prompt-1", type: "prompt", position: { x: 40, y: 260 }, data: { prompt: "hyper-detailed, award-winning cinematic lighting", stylePreset: "cinematic" } },
        { id: "model-1", type: "model", position: { x: 330, y: 40 }, data: { model: "opendoor-flux-canvas", category: "image" } },
        { id: "sampler-1", type: "sampler", position: { x: 330, y: 200 }, data: { steps: 28, cfg: 7.5, denoise: 0.55 } },
        { id: "upscale-1", type: "upscaler", position: { x: 630, y: 80 }, data: { scale: 4 } },
        { id: "output-1", type: "output", position: { x: 860, y: 80 }, data: { kind: "image" } },
      ],
      edges: [
        { id: "e1-sampler", source: "model-1", sourceHandle: "model_out", target: "sampler-1", targetHandle: "model_in", animated: true, style: { stroke: SOCKET_COLORS.model } },
        { id: "e2-sampler", source: "prompt-1", sourceHandle: "conditioning_out", target: "sampler-1", targetHandle: "positive_in", animated: true, style: { stroke: SOCKET_COLORS.conditioning } },
        { id: "e3-sampler", source: "img-1", sourceHandle: "image_out", target: "sampler-1", targetHandle: "latent_in", animated: true, style: { stroke: SOCKET_COLORS.image } },
        { id: "e4-upscale", source: "sampler-1", sourceHandle: "latent_out", target: "upscale-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.image } },
        { id: "e5-out", source: "upscale-1", sourceHandle: "image_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.image } },
      ],
    },
  ],
  videos: [
    {
      id: "txt2vid",
      label: "Text to Video",
      nodes: [
        { id: "model-1", type: "model", position: { x: 40, y: 80 }, data: { model: "luma-dream-machine", category: "video" } },
        { id: "prompt-1", type: "prompt", position: { x: 40, y: 260 }, data: { prompt: "Cinematic drone flight over mist-shrouded temple waterfalls", placeholder: "Describe the video scene and camera motion..." } },
        { id: "duration-1", type: "duration", position: { x: 360, y: 80 }, data: { duration: 5 } },
        { id: "output-1", type: "output", position: { x: 640, y: 160 }, data: { kind: "video" } },
      ],
      edges: [
        { id: "e-model-prompt", source: "model-1", sourceHandle: "clip_out", target: "prompt-1", targetHandle: "clip_in", animated: true, style: { stroke: SOCKET_COLORS.clip } },
        { id: "e-prompt-out", source: "prompt-1", sourceHandle: "conditioning_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.conditioning } },
        { id: "e-duration-out", source: "duration-1", sourceHandle: "duration_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.image } },
      ],
    },
  ],
  objects: [
    {
      id: "txt2obj",
      label: "Text to 3D",
      nodes: [
        { id: "model-1", type: "model", position: { x: 40, y: 80 }, data: { model: "opendoor-shap-e-3d", category: "3d" } },
        { id: "prompt-1", type: "prompt", position: { x: 40, y: 260 }, data: { prompt: "Minimalist matte ceramic pour-over kettle with carved walnut handle", placeholder: "Describe the product or object to mesh..." } },
        { id: "output-1", type: "output", position: { x: 400, y: 150 }, data: { kind: "mesh" } },
      ],
      edges: [
        { id: "e-model-prompt", source: "model-1", sourceHandle: "clip_out", target: "prompt-1", targetHandle: "clip_in", animated: true, style: { stroke: SOCKET_COLORS.clip } },
        { id: "e-prompt-out", source: "prompt-1", sourceHandle: "conditioning_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.conditioning } },
      ],
    },
  ],
  sound: [
    {
      id: "sound_fx",
      label: "Prompt to Sound",
      nodes: [
        { id: "model-1", type: "model", position: { x: 40, y: 80 }, data: { model: "opendoor-cinematic-sfx", category: "sound" } },
        { id: "prompt-1", type: "prompt", position: { x: 40, y: 260 }, data: { prompt: "Heavy nocturnal rain on metallic roof with distant siren echoes", placeholder: "Describe the Foley, ambience, or impact..." } },
        { id: "duration-1", type: "duration", position: { x: 360, y: 80 }, data: { duration: 5 } },
        { id: "output-1", type: "output", position: { x: 640, y: 160 }, data: { kind: "audio" } },
      ],
      edges: [
        { id: "e-model-prompt", source: "model-1", sourceHandle: "clip_out", target: "prompt-1", targetHandle: "clip_in", animated: true, style: { stroke: SOCKET_COLORS.clip } },
        { id: "e-prompt-out", source: "prompt-1", sourceHandle: "conditioning_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.conditioning } },
        { id: "e-duration-out", source: "duration-1", sourceHandle: "duration_out", target: "output-1", targetHandle: "image_in", animated: true, style: { stroke: SOCKET_COLORS.image } },
      ],
    },
  ],
};

const FAMILY_TITLE: Record<GenerationFamily, string> = {
  images: "Image Nodes",
  videos: "Video Nodes",
  objects: "Object Nodes",
  sound: "Sound Nodes",
};

export const NodeGraphCanvas = forwardRef<NodeGraphCanvasHandle, NodeGraphCanvasProps>(function NodeGraphCanvas(
  { family = "images", onAssetGenerated, onSendToCanvas },
  ref,
) {
  const familyGraphs = FAMILY_TEMPLATES[family] || FAMILY_TEMPLATES.images;
  const [nodes, setNodes, onNodesChange] = useNodesState(familyGraphs[0].nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(familyGraphs[0].edges);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(familyGraphs[0].id);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const handleNodeDataChange = useCallback(
    (nodeId: string, field: string, value: any) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                [field]: value,
              },
            };
          }
          return n;
        })
      );
    },
    [setNodes]
  );

  // Bind onChange handlers to all nodes
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onChange: handleNodeDataChange,
          onSendToCanvas,
          isRendering: isExecuting && n.type === "output",
        },
      })),
    [nodes, handleNodeDataChange, onSendToCanvas, isExecuting]
  );

  const loadTemplate = (name: string, nextFamily = family) => {
    const graphs = FAMILY_TEMPLATES[nextFamily] || FAMILY_TEMPLATES.images;
    const graph = graphs.find((item) => item.id === name) || graphs[0];
    setActiveTemplate(graph.id);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  };

  useEffect(() => {
    const graphs = FAMILY_TEMPLATES[family] || FAMILY_TEMPLATES.images;
    loadTemplate(graphs[0].id, family);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);

  const addCustomNode = (type: string) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 },
      data: {},
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const executePipeline = async (overridePrompt?: string) => {
    const nextPrompt = overridePrompt?.trim();
    if (nextPrompt) {
      setNodes((nds) =>
        nds.map((n) => (n.type === "prompt" ? { ...n, data: { ...n.data, prompt: nextPrompt } } : n))
      );
    }

    setIsExecuting(true);

    try {
      // Find prompt, model, resolution from nodes
      const promptNode = nodes.find((n) => n.type === "prompt");
      const modelNode = nodes.find((n) => n.type === "model");
      const latentNode = nodes.find((n) => n.type === "latent");
      const samplerNode = nodes.find((n) => n.type === "sampler");
      const imgNode = nodes.find((n) => n.type === "imageLoader");

      const durationNode = nodes.find((n) => n.type === "duration");
      const prompt = nextPrompt || promptNode?.data?.prompt || "A masterpiece image synthesis";
      const model = modelNode?.data?.model || "opendoor-flux-canvas";
      const size = latentNode?.data?.resolution || "1024x1024";
      const strength = samplerNode?.data?.denoise || 0.75;
      const refImage = imgNode?.data?.imageUrl || null;
      const duration = Number(durationNode?.data?.duration || 5);

      let url: string | null = null;
      let kind: NodeGraphAsset["kind"] = "image";

      if (family === "videos") {
        const form = new FormData();
        form.set("mode", "txt2vid");
        form.set("prompt", String(prompt));
        form.set("model", String(model));
        form.set("duration", String(duration));
        const res = await fetch("/api/studio/video", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        const row = data.data?.[0];
        url = row?.b64_json
          ? `data:${row.mime || "video/mp4"};base64,${row.b64_json}`
          : typeof row?.url === "string"
            ? row.url
            : typeof data.url === "string"
              ? data.url
              : null;
        kind = "video";
      } else if (family === "objects") {
        const res = await fetch("/api/studio/object", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model }),
        });
        const data = await res.json().catch(() => ({}));
        url = typeof data.previewUrl === "string" ? data.previewUrl : typeof data.url === "string" ? data.url : null;
        kind = "image";
      } else if (family === "sound") {
        const res = await fetch("/api/studio/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model, duration }),
        });
        const data = await res.json().catch(() => ({}));
        url = typeof data.url === "string" ? data.url : null;
        kind = "audio";
      } else {
        const payload: Record<string, unknown> = {
          mode: refImage ? "img2img" : "txt2img",
          prompt,
          size,
          strength,
          model,
          seed: Math.floor(Math.random() * 1_000_000),
          steps: samplerNode?.data?.steps || 28,
        };
        if (refImage) payload.image = refImage;
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        const row = data.data?.[0];
        url = row?.b64_json
          ? `data:${row.mime || "image/png"};base64,${row.b64_json}`
          : typeof row?.url === "string"
            ? row.url
            : null;
      }

      if (url) {
        setNodes((nds) =>
          nds.map((n) => (n.type === "output" ? { ...n, data: { ...n.data, outputUrl: url, kind } } : n))
        );

        const asset: NodeGraphAsset = {
          id: `node-${Date.now()}`,
          url,
          kind,
          prompt: String(prompt),
          model: String(model),
          timestamp: Date.now(),
        };

        onAssetGenerated?.(asset);
      }
    } catch (err) {
      console.error("Node execution failed:", err);
    } finally {
      setIsExecuting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    applyPromptAndRun: (prompt?: string) => executePipeline(prompt),
  }), [nodes, onAssetGenerated, family]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: "var(--studio-bg)" }}>
      {/* Top Controls Toolbar */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3 shadow-lg backdrop-blur-2xl"
        style={{ background: "rgba(14, 16, 24, 0.75)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              {FAMILY_TITLE[family]}
            </span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Template presets dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-zinc-400">Template:</span>
            <select
              value={activeTemplate}
              onChange={(e) => loadTemplate(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-1.5 text-[11px] font-medium text-zinc-200 focus:outline-none transition-colors"
            >
              {familyGraphs.map((graph) => (
                <option key={graph.id} value={graph.id}>
                  {graph.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Add Node Dropdown */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => addCustomNode("prompt")}
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all"
            >
              <Plus className="h-3 w-3" />
              <span>Prompt</span>
            </button>
            {family === "images" && (
              <>
                <button
                  type="button"
                  onClick={() => addCustomNode("imageLoader")}
                  className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all"
                >
                  <Plus className="h-3 w-3" />
                  <span>Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => addCustomNode("upscaler")}
                  className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all"
                >
                  <Plus className="h-3 w-3" />
                  <span>4K Upscaler</span>
                </button>
              </>
            )}
            {(family === "videos" || family === "sound") && (
              <button
                type="button"
                onClick={() => addCustomNode("duration")}
                className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all"
              >
                <Plus className="h-3 w-3" />
                <span>Duration</span>
              </button>
            )}
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={() => loadTemplate(activeTemplate)}
            className="flex h-7.5 w-7.5 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Reset Nodes Layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Run Pipeline Button */}
          <button
            type="button"
            onClick={executePipeline}
            disabled={isExecuting}
            className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-zinc-950 shadow-md transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #e4e4e7 100%)",
              boxShadow: "0 4px 14px rgba(255, 255, 255, 0.15)",
            }}
          >
            <Play className={`h-3.5 w-3.5 fill-current ${isExecuting ? "animate-spin" : ""}`} />
            <span>{isExecuting ? "Executing Graph..." : "Execute Graph"}</span>
          </button>
        </div>
      </div>

      {/* Main Flow Canvas Area */}
      <div className="h-full w-full flex-1">
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0c0c0e]"
        >
          <Background color="#27272a" gap={20} size={1} variant={BackgroundVariant.Dots} />
          <Controls className="border border-white/10 bg-[#141416] fill-white text-white" />
          <MiniMap
            nodeColor={(n: Node) => {
              if (n.type === "prompt") return SOCKET_COLORS.conditioning;
              if (n.type === "model") return SOCKET_COLORS.model;
              if (n.type === "latent") return SOCKET_COLORS.latent;
              if (n.type === "sampler") return "#10b981";
              if (n.type === "imageLoader") return SOCKET_COLORS.image;
              if (n.type === "upscaler") return "#f59e0b";
              if (n.type === "duration") return SOCKET_COLORS.image;
              return "#71717a";
            }}
            className="border border-white/10 bg-[#141416]"
            maskColor="rgba(0, 0, 0, 0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
});
