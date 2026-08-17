"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Sparkles,
  Image as ImageIcon,
  Film,
  Video,
  Scissors,
  GitFork,
  Maximize2,
  Share2,
  Grid,
  Square,
  Zap,
  ArrowUpRight,
  Wand2,
} from "lucide-react";
import { Card, CardContent, CardFooter, Chip, Button } from "@heroui/react";
import { LumaPromptBar } from "./LumaPromptBar";
import { type MotionPreset } from "./LumaMotionPopover";
import { InteractiveVideoTimeline, type TimelineTarget } from "./InteractiveVideoTimeline";
import { NodeGraphCanvas } from "./NodeGraphCanvas";
import { GenerationDetailModal, type GeneratedAssetDetail } from "./GenerationDetailModal";
import { OPENDOOR_STUDIO_MODELS, type StudioModelOption, type StudioTool } from "@/lib/studio-constants";
import { cn } from "@/lib/utils";

interface PipelineStatus {
  online: boolean;
  hasGpu: boolean;
  engine: string;
  label: string;
  videoReady: boolean;
  videoMissing: string[];
}

interface ToolDefinition {
  id: StudioTool;
  label: string;
  icon: React.ElementType;
}

const TOOLS: ToolDefinition[] = [
  { id: "txt2vid", label: "Text to Video", icon: Film },
  { id: "img2vid", label: "Image to Video", icon: Video },
  { id: "txt2img", label: "Text to Image", icon: Sparkles },
  { id: "img2img", label: "Image Remix", icon: ImageIcon },
  { id: "v2v", label: "Timeline Edit", icon: Scissors },
  { id: "nodes", label: "Node Graph", icon: GitFork },
];

const ASPECT_TO_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1280x720",
  "9:16": "720x1280",
  "4:3": "1024x768",
  "3:2": "1152x768",
  "3:4": "768x1024",
  "21:9": "1344x576",
};

const INSPIRATION_STARTERS = [
  {
    title: "Alpine Snow Leopard",
    prompt: "A majestic snow leopard leaping across misty alpine ridges in 8k slow motion, cinematic lighting, 120fps",
    tag: "Motion · 120fps",
    gradient: "from-blue-900/40 via-indigo-950/60 to-black",
    accent: "text-cyan-400",
  },
  {
    title: "Tokyo Cyberpunk Hypercar",
    prompt: "Futuristic electric hypercar gliding through Tokyo rainy streets with neon reflections, 2.39:1 anamorphic lens flare",
    tag: "Anamorphic · 2.39:1",
    gradient: "from-fuchsia-900/40 via-purple-950/60 to-black",
    accent: "text-pink-400",
  },
  {
    title: "Ancient Jungle Waterfall",
    prompt: "An ancient stone temple hidden in overgrown jungle waterfall, volumetric golden hour sunbeams, sweeping drone flyover",
    tag: "Drone Flyover",
    gradient: "from-emerald-900/40 via-teal-950/60 to-black",
    accent: "text-emerald-400",
  },
  {
    title: "Deep Space Obsidian Planet",
    prompt: "Cybernetic astronaut exploring crystalline obsidian planet at twin sunset, 360 degree orbit camera",
    tag: "Orbit 360",
    gradient: "from-amber-900/40 via-rose-950/60 to-black",
    accent: "text-amber-400",
  },
];

function downloadAsset(url: string, id: string, kind: "image" | "video") {
  const a = document.createElement("a");
  a.href = url;
  a.download = `luma-studio-${id}.${kind === "video" ? "mp4" : "png"}`;
  a.click();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function StudioWorkspace() {
  const [tool, setTool] = useState<StudioTool>("txt2vid");
  const [prompt, setPrompt] = useState("");
  const [sceneTitle, setSceneTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedModel, setSelectedModel] = useState("luma-dream-machine");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas Media States
  const [canvasImage, setCanvasImage] = useState<string | null>(null);
  const [canvasVideo, setCanvasVideo] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [endFrameImage, setEndFrameImage] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [loopVideo, setLoopVideo] = useState(true);
  const [selectedMotionPreset, setSelectedMotionPreset] = useState<MotionPreset | null>(null);

  // View Layout Mode
  const [viewLayout, setViewLayout] = useState<"grid" | "single">("grid");

  const [timelineTarget, setTimelineTarget] = useState<TimelineTarget>({ mode: "full" });
  const [assets, setAssets] = useState<GeneratedAssetDetail[]>([]);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<StudioModelOption[]>(OPENDOOR_STUDIO_MODELS);
  const [copiedShare, setCopiedShare] = useState(false);

  const [status, setStatus] = useState<PipelineStatus>({
    online: true,
    hasGpu: true,
    engine: "Luma Ray 2 Engine",
    label: "Studio Live",
    videoReady: true,
    videoMissing: [],
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isVideoTool = tool === "txt2vid" || tool === "img2vid" || tool === "v2v";

  const models = useMemo(
    () =>
      availableModels.filter((m) =>
        isVideoTool ? m.category === "video" : m.category === "image"
      ),
    [availableModels, isVideoTool]
  );

  useEffect(() => {
    if (!models.some((m) => m.id === selectedModel) && models[0]) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  const fetchStatus = useCallback(async () => {
    try {
      const [resStatus, resModels] = await Promise.all([
        fetch("/api/studio/status"),
        fetch("/api/studio/models"),
      ]);

      if (resModels.ok) {
        const modelsData = await resModels.json();
        if (Array.isArray(modelsData.models) && modelsData.models.length > 0) {
          setAvailableModels(modelsData.models);
        }
      }

      if (resStatus.ok) {
        const data = await resStatus.json();
        setStatus({
          online: Boolean(data.online ?? data.pipelineReady ?? true),
          hasGpu: Boolean(data.hasGpu ?? true),
          engine: typeof data.engine === "string" ? data.engine : "Luma Ray 2 Engine",
          label: typeof data.label === "string" ? data.label : "Studio Live",
          videoReady: Boolean(data.video?.ready ?? true),
          videoMissing: Array.isArray(data.video?.missingNodes) ? data.video.missingNodes : [],
        });
      }
    } catch {
      // Keep optimistic online status
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const setToolAndReset = (next: StudioTool) => {
    setTool(next);
    setError(null);
    if (next === "txt2img" || next === "txt2vid") {
      setReferenceFile(null);
    }
    if (next === "txt2vid" || next === "img2vid" || next === "v2v") {
      setAspectRatio("16:9");
    }
    if (next !== "v2v") {
      setTimelineTarget({ mode: "full" });
    }
  };

  const applyReference = async (file: File) => {
    if (tool === "v2v") {
      if (!file.type.startsWith("video/")) {
        setError("Drop a video file");
        return;
      }
      const url = URL.createObjectURL(file);
      setReferenceFile(file);
      setCanvasVideo(url);
      setCanvasImage(null);
      setTimelineTarget({ mode: "full" });
      setError(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Drop an image file");
      return;
    }
    const url = await fileToDataUrl(file);
    setReferenceFile(file);
    setReferenceImage(url);
    setCanvasImage(url);
    setCanvasVideo(null);
    setError(null);
  };

  // 1-Click Extend Scene (+5s)
  const handleExtendScene = (asset: GeneratedAssetDetail) => {
    setTool("img2vid");
    setReferenceImage(asset.url);
    setCanvasImage(asset.url);
    const extendPrompt = `Continue the sequence smoothly: ${asset.prompt}`;
    setPrompt(extendPrompt);
    handleGenerateWithPrompt(extendPrompt);
  };

  // Set Keyframe Slot
  const handleSetStartFrame = (url: string) => {
    setReferenceImage(url);
    setTool("img2vid");
  };

  const handleSetEndFrame = (url: string) => {
    setEndFrameImage(url);
    setTool("img2vid");
  };

  const handleGenerateWithPrompt = async (customPrompt?: string) => {
    const rawPrompt = customPrompt ?? prompt;
    const trimmed = rawPrompt.trim();
    if ((tool === "txt2img" || tool === "txt2vid") && !trimmed) {
      setError("Enter a descriptive prompt to generate");
      return;
    }
    if ((tool === "img2img" || tool === "img2vid") && !referenceImage && !referenceFile) {
      setError("Upload or select a Start Frame reference image");
      return;
    }

    setIsGenerating(true);
    setError(null);

    // Extract title from user prompt
    const firstPhrase = trimmed.split(/[,.]/)[0]?.toUpperCase() || "NEW GENERATION";
    setSceneTitle(firstPhrase.slice(0, 36));

    try {
      if (isVideoTool) {
        const form = new FormData();
        form.set("mode", tool);
        form.set("prompt", trimmed);
        form.set("size", ASPECT_TO_SIZE[aspectRatio] || "1280x720");
        form.set("strength", "0.75");
        form.set("model", selectedModel);
        form.set("seed", String(Math.floor(Math.random() * 1_000_000)));
        form.set("steps", "20");

        if (referenceFile) form.set("image", referenceFile);
        else if (referenceImage) form.set("image", referenceImage);

        const res = await fetch("/api/studio/video", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));

        if (res.ok && (data.url || data.b64_json || data.data)) {
          const row = data.data?.[0];
          const url = row?.b64_json
            ? `data:${row.mime || "video/mp4"};base64,${row.b64_json}`
            : typeof row?.url === "string"
              ? row.url
              : typeof data.url === "string"
                ? data.url
                : null;

          if (url) {
            const newAsset: GeneratedAssetDetail = {
              id: typeof data.id === "string" ? data.id : `luma-${Date.now()}`,
              url,
              kind: "video",
              prompt: trimmed,
              model: selectedModel,
              timestamp: Date.now(),
              mode: tool,
              aspectRatio,
            };
            setCanvasVideo(url);
            setAssets((prev) => [newAsset, ...prev].slice(0, 36));
          }
        } else {
          setError(data.error || "Video pipeline is busy or awaiting GPU allocation");
        }
      } else {
        // Image generation
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            model: selectedModel,
            aspectRatio,
            referenceImage,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.url || data.images?.[0]?.url) {
          const url = data.url || data.images[0].url;
          const newAsset: GeneratedAssetDetail = {
            id: `luma-img-${Date.now()}`,
            url,
            kind: "image",
            prompt: trimmed,
            model: selectedModel,
            timestamp: Date.now(),
            mode: tool,
            aspectRatio,
          };
          setAssets((prev) => [newAsset, ...prev].slice(0, 36));
          setCanvasImage(url);
        } else {
          setError(data.error || "Image generation failed");
        }
      }
    } catch (err: any) {
      setError(err.message || "Generation encountered an issue");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareScene = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleBrainstorm = () => {
    const ideas = [
      "A majestic snow leopard leaping across misty alpine ridges in 8k slow motion, cinematic lighting",
      "Futuristic electric hypercar gliding through Tokyo rainy streets with neon reflections, anamorphic flare",
      "An ancient stone temple hidden in overgrown jungle waterfall, volumetric sunbeams, drone flyover",
      "Cybernetic astronaut exploring crystalline obsidian planet at twin sunset, 360 degree orbit camera",
    ];
    const picked = ideas[Math.floor(Math.random() * ideas.length)];
    setPrompt(picked);
    const title = picked.split(/[,.]/)[0]?.toUpperCase() || "NEW SCENE";
    setSceneTitle(title.slice(0, 36));
  };

  // Parse prompt into pills / keywords
  const promptPillTags = useMemo(() => {
    if (!prompt.trim()) return [];
    const parts = prompt.split(/[,.]/).map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 6);
  }, [prompt]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black text-white selection:bg-indigo-500/30">
      {/* ── 1. Top Sleek Unified Studio Header ── */}
      <header
        className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-white/[0.08] z-30"
        style={{
          background: "rgba(10, 11, 16, 0.85)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Left: Dynamic Scene Name & Engine Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Wand2 className="h-3.5 w-3.5" />
            </div>
            <h1 className="text-sm font-bold tracking-wider text-white font-mono uppercase truncate max-w-[200px] sm:max-w-[280px]">
              {sceneTitle || "DREAM MACHINE STUDIO"}
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-1.5">
            <Chip
              size="sm"
              variant="primary"
              color="accent"
              className="font-mono text-[9px] uppercase font-bold px-1.5 h-5"
            >
              {status.engine.toUpperCase()}
            </Chip>
            <Chip
              size="sm"
              variant="soft"
              color="success"
              className="font-mono text-[9px] px-1.5 h-5"
            >
              ● {status.label}
            </Chip>
          </div>
        </div>

        {/* Center: Horizontal Tool Mode Switcher Pills */}
        <div className="hidden lg:flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.08]">
          {TOOLS.map((item) => {
            const active = tool === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setToolAndReset(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150",
                  active
                    ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Viewport Mode, Brainstorm & Share */}
        <div className="flex items-center gap-2">
          {/* Viewport Switcher */}
          <div className="hidden md:flex rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.08]">
            <Button
              size="sm"
              variant={viewLayout === "grid" ? "primary" : "ghost"}
              onPress={() => setViewLayout("grid")}
              className={cn(
                "h-6 px-2 text-[10px] font-mono",
                viewLayout === "grid" ? "bg-white/20 text-white font-bold" : "text-zinc-400"
              )}
            >
              <Grid className="h-3 w-3 mr-1" />
              <span>Grid</span>
            </Button>
            <Button
              size="sm"
              variant={viewLayout === "single" ? "primary" : "ghost"}
              onPress={() => setViewLayout("single")}
              className={cn(
                "h-6 px-2 text-[10px] font-mono",
                viewLayout === "single" ? "bg-white/20 text-white font-bold" : "text-zinc-400"
              )}
            >
              <Square className="h-3 w-3 mr-1" />
              <span>Focus</span>
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onPress={handleBrainstorm}
            className="h-7 px-2.5 text-xs text-amber-300 hover:bg-amber-500/10 border border-amber-500/20"
          >
            <Sparkles className="h-3 w-3 mr-1 text-amber-400" />
            <span>Brainstorm</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onPress={handleShareScene}
            className="h-7 px-2.5 text-xs text-zinc-300 hover:bg-white/10 border border-white/10"
          >
            <Share2 className="h-3 w-3 mr-1" />
            <span>{copiedShare ? "Copied!" : "Share"}</span>
          </Button>
        </div>
      </header>

      {/* Mobile Tool Mode Pills */}
      <div className="flex lg:hidden overflow-x-auto px-4 py-2 border-b border-white/[0.08] bg-black/60 gap-1.5 no-scrollbar shrink-0">
        {TOOLS.map((item) => {
          const active = tool === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setToolAndReset(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all",
                active
                  ? "bg-indigo-600 text-white font-bold"
                  : "text-zinc-400 hover:text-white bg-white/5"
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Main Studio Cinematic Stage ── */}
      {tool === "nodes" ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <NodeGraphCanvas
            onAssetGenerated={(asset) => {
              const fullAsset: GeneratedAssetDetail = {
                ...asset,
                mode: "nodes",
                aspectRatio: "1:1",
              };
              setAssets((prev) => [fullAsset, ...prev].slice(0, 36));
              setCanvasImage(asset.url);
            }}
            onSendToCanvas={(url) => {
              setCanvasImage(url);
              setReferenceImage(url);
              setTool("img2img");
            }}
          />
        </section>
      ) : (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 sm:px-8 pt-6 pb-36">
          {/* Ambient Background Glow Mesh */}
          <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />

          {/* Error Banner */}
          {error && (
            <div className="relative z-10 w-full max-w-4xl mx-auto mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Prompt Keyword Tag Bar (when prompt exists) */}
          {promptPillTags.length > 0 && (
            <div className="relative z-10 w-full max-w-4xl mx-auto mb-6 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono text-zinc-500">Focus Tag:</span>
              {promptPillTags.map((tag, idx) => (
                <Chip
                  key={idx}
                  size="sm"
                  variant="soft"
                  color="accent"
                  className="cursor-pointer hover:bg-white/15 transition-colors text-[11px]"
                  onClick={() => setPrompt(tag)}
                >
                  {tag}
                </Chip>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
             2. LUMA VIDEO GRID OR HERO EMPTY STATE
             ══════════════════════════════════════════════════════ */}
          <div className="relative z-10 w-full max-w-5xl mx-auto">
            {assets.length === 0 ? (
              /* ── High-End Cinematic Empty State ── */
              <div className="space-y-6">
                <Card
                  className="border border-white/[0.12] bg-gradient-to-b from-white/[0.06] via-zinc-950/80 to-black p-8 sm:p-12 text-center shadow-2xl backdrop-blur-2xl overflow-hidden relative"
                >
                  {/* Subtle ambient spotlight */}
                  <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-indigo-500/20 blur-3xl pointer-events-none rounded-full" />

                  <CardContent className="max-w-xl mx-auto space-y-4 p-0 relative z-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 mx-auto shadow-xl shadow-indigo-600/30">
                      <Sparkles className="h-6 w-6" />
                    </div>

                    <h2 className="text-2xl font-bold tracking-tight text-white font-sans">
                      What will you imagine today?
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
                      Synthesize fluid cinematic camera motion, interpolate keyframes, and create photorealistic AI visuals in seconds.
                    </p>

                    {/* Creative Starters Grid */}
                    <div className="pt-6 space-y-3 text-left">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
                          Creative Inspirations
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Click to load prompt
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {INSPIRATION_STARTERS.map((s, idx) => (
                          <Card
                            key={idx}
                            onClick={() => {
                              setPrompt(s.prompt);
                              setSceneTitle(s.title.toUpperCase());
                            }}
                            className={cn(
                              "group border border-white/10 bg-gradient-to-br p-4 text-left transition-all duration-200 hover:border-indigo-500/50 hover:scale-[1.01] cursor-pointer shadow-lg",
                              s.gradient
                            )}
                          >
                            <CardContent className="p-0 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className={cn("text-xs font-bold tracking-tight", s.accent)}>
                                  {s.title}
                                </span>
                                <Chip size="sm" variant="soft" className="text-[8px] font-mono h-4 px-1.5 bg-black/60 text-zinc-300">
                                  {s.tag}
                                </Chip>
                              </div>
                              <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                                {s.prompt}
                              </p>
                            </CardContent>
                            <CardFooter className="p-0 pt-2 flex items-center justify-between text-[10px] font-mono text-zinc-400 group-hover:text-white transition-colors">
                              <span>Load in prompt dock</span>
                              <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : viewLayout === "grid" ? (
              /* Luma AI Responsive Video Grid Feed */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {assets.map((asset, idx) => (
                  <Card
                    key={asset.id}
                    className="group relative flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-zinc-950 hover:border-indigo-500/50 transition-all duration-200 shadow-2xl"
                  >
                    {/* Media Thumbnail with Auto-Play on Hover */}
                    <div className="relative aspect-video w-full overflow-hidden bg-black">
                      {asset.kind === "video" ? (
                        <video
                          src={asset.url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <img
                          src={asset.url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      )}

                      {/* Mode Badge */}
                      <Chip
                        size="sm"
                        variant="primary"
                        color="accent"
                        className="absolute top-2.5 left-2.5 bg-black/80 text-[9px] font-mono text-indigo-300 border border-white/10"
                      >
                        {asset.model.toUpperCase()} · 5s
                      </Chip>

                      {/* Hover Overlay with Luma Quick Actions */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onPress={() => setSelectedAssetIndex(idx)}
                            className="rounded-lg bg-black/80 text-white hover:bg-indigo-600 h-7 w-7 min-w-7 p-0 flex items-center justify-center"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onPress={() => downloadAsset(asset.url, asset.id, asset.kind)}
                            className="rounded-lg bg-black/80 text-white hover:bg-white/20 h-7 w-7 min-w-7 p-0 flex items-center justify-center"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Bottom Row Actions on Hover */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/20">
                          <Button
                            size="sm"
                            variant="primary"
                            onPress={() => handleExtendScene(asset)}
                            className="font-bold text-[11px] h-7 bg-indigo-600 text-white flex items-center gap-1 shadow-lg shadow-indigo-600/30"
                          >
                            <Zap className="h-3 w-3" />
                            <span>Extend (+5s)</span>
                          </Button>

                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => handleSetStartFrame(asset.url)}
                              className="h-7 px-2 text-[10px] font-mono text-zinc-200 bg-white/10 hover:bg-white/20"
                            >
                              + Start
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => handleSetEndFrame(asset.url)}
                              className="h-7 px-2 text-[10px] font-mono text-purple-300 bg-purple-600/30 hover:bg-purple-600/50"
                            >
                              + End
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Description */}
                    <CardContent className="p-3.5 space-y-1.5">
                      <p className="text-xs text-zinc-200 line-clamp-2 leading-relaxed font-normal">
                        {asset.prompt}
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-white/[0.06]">
                        <span>{asset.aspectRatio}</span>
                        <span>{new Date(asset.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              /* Single Hero Stage Canvas View */
              <div className="space-y-4">
                <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-white/15 bg-zinc-950 shadow-2xl">
                  {canvasVideo ? (
                    <video
                      src={canvasVideo}
                      autoPlay
                      loop
                      controls
                      className="h-full w-full object-cover"
                    />
                  ) : canvasImage ? (
                    <img
                      src={canvasImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600 font-mono text-xs">
                      Drop media or enter prompt to generate
                    </div>
                  )}
                </div>

                {/* Timeline Bar */}
                <InteractiveVideoTimeline
                  videoRef={videoRef}
                  videoUrl={canvasVideo}
                  target={timelineTarget}
                  onTargetChange={(next) => setTimelineTarget(next)}
                />
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════
             3. LUMA FLOATING BOTTOM PROMPT BAR DOCK
             ══════════════════════════════════════════════════════ */}
          <LumaPromptBar
            prompt={prompt}
            setPrompt={setPrompt}
            onGenerate={() => void handleGenerateWithPrompt()}
            isGenerating={isGenerating}
            canGenerate={Boolean(prompt.trim())}
            tool={tool}
            setTool={setTool}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            availableModels={availableModels}
            referenceImage={referenceImage}
            setReferenceImage={setReferenceImage}
            endFrameImage={endFrameImage}
            setEndFrameImage={setEndFrameImage}
            onReferenceFile={(file) => void applyReference(file)}
            loopVideo={loopVideo}
            setLoopVideo={setLoopVideo}
            selectedMotionPreset={selectedMotionPreset}
            setSelectedMotionPreset={setSelectedMotionPreset}
          />
        </section>
      )}

      {/* ── Lightbox & Inspect Modal ── */}
      {selectedAssetIndex != null && (
        <GenerationDetailModal
          assets={assets}
          selectedIndex={selectedAssetIndex}
          onClose={() => setSelectedAssetIndex(null)}
          onSelectIndex={(index) => setSelectedAssetIndex(index)}
          onRemix={(asset) => {
            setPrompt(asset.prompt);
            if (asset.aspectRatio) setAspectRatio(asset.aspectRatio);
          }}
          onUseAsReference={(asset) => {
            setReferenceImage(asset.url);
            setTool("img2vid");
          }}
          onEditInTimeline={(asset) => {
            setCanvasVideo(asset.url);
            setTool("v2v");
          }}
          onSendToNodes={(asset) => {
            setCanvasImage(asset.url);
            setTool("nodes");
          }}
          onDownload={downloadAsset}
        />
      )}
    </div>
  );
}
