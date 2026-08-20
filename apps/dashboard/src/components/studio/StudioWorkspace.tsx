"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  History,
  Sparkles,
  Video,
  Share2,
  ArrowUpRight,
  Wand2,
  Upload,
  Trash2,
} from "lucide-react";
import { Button } from "@heroui/react";
import { LumaPromptBar } from "./LumaPromptBar";
import { getGenerationFamily } from "./LumaSettingsPopover";
import { type MotionPreset } from "./LumaMotionPopover";
import { type TimelineTarget } from "./InteractiveVideoTimeline";
import { NodeGraphCanvas, type NodeGraphCanvasHandle } from "./NodeGraphCanvas";
import { Object3DCanvas, type Object3DCanvasHandle, type Object3DData } from "./Object3DCanvas";
import { SoundFXCanvas, type SoundFXData } from "./SoundFXCanvas";
import { type GeneratedAssetDetail, type GeneratedAssetKind } from "./GenerationDetailModal";
import { HISTORY_RAIL_WIDTH, StudioHistoryRail } from "./StudioHistoryRail";
import {
  OPENDOOR_STUDIO_MODELS,
  getDefaultModelForTool,
  getModelsForTool,
  resolveStudioApiModel,
  resolveStudioVideoModel,
  clampStudioVideoDuration,
  sizeFromAspectAndResolution,
  studioErrorMessage,
  type StudioModelOption,
  type StudioResolution,
  type StudioTool,
} from "@/lib/studio-constants";
import { cn } from "@/lib/utils";

interface PipelineStatus {
  online: boolean;
  hasGpu: boolean;
  engine: string;
  label: string;
  videoReady: boolean;
  videoMissing: string[];
}

export interface AspectRatioOption {
  id: string;
  label: string;
  sub: string;
  ratio: string;
  size: string;
  maxW: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: "16:9", label: "16:9", sub: "Widescreen", ratio: "16 / 9", size: "1280x720", maxW: "max-w-5xl" },
  { id: "9:16", label: "9:16", sub: "Vertical / Shorts", ratio: "9 / 16", size: "720x1280", maxW: "max-w-[340px] sm:max-w-[380px]" },
  { id: "1:1", label: "1:1", sub: "Square", ratio: "1 / 1", size: "1024x1024", maxW: "max-w-lg sm:max-w-xl" },
  { id: "21:9", label: "21:9", sub: "Ultrawide Cinema", ratio: "21 / 9", size: "1344x576", maxW: "max-w-6xl" },
  { id: "4:3", label: "4:3", sub: "Classic TV", ratio: "4 / 3", size: "1024x768", maxW: "max-w-3xl sm:max-w-4xl" },
  { id: "3:4", label: "3:4", sub: "Portrait", ratio: "3 / 4", size: "768x1024", maxW: "max-w-xs sm:max-w-[420px]" },
  { id: "3:2", label: "3:2", sub: "Photo 35mm", ratio: "3 / 2", size: "1152x768", maxW: "max-w-3xl sm:max-w-4xl" },
];

const INSPIRATION_STARTERS = [
  {
    title: "Alpine Snow Leopard",
    prompt: "A majestic snow leopard leaping across misty alpine ridges in 8k slow motion, cinematic lighting, 120fps",
    tag: "Motion · 120fps",
    gradient: "from-sky-50 via-cyan-50 to-white dark:from-blue-950/50 dark:via-cyan-950/30 dark:to-black/90",
    borderHover: "hover:border-cyan-300 hover:shadow-cyan-500/10 dark:hover:border-cyan-500/50",
    accent: "text-cyan-400",
  },
  {
    title: "Tokyo Cyberpunk Hypercar",
    prompt: "Futuristic electric hypercar gliding through Tokyo rainy streets with neon reflections, 2.39:1 anamorphic lens flare",
    tag: "Anamorphic · 2.39:1",
    gradient: "from-fuchsia-50 via-purple-50 to-white dark:from-fuchsia-950/50 dark:via-purple-950/40 dark:to-black/90",
    borderHover: "hover:border-pink-300 hover:shadow-pink-500/10 dark:hover:border-pink-500/50",
    accent: "text-pink-400",
  },
  {
    title: "Ancient Jungle Waterfall",
    prompt: "An ancient stone temple hidden in overgrown jungle waterfall, volumetric golden hour sunbeams, sweeping drone flyover",
    tag: "Drone Flyover",
    gradient: "from-emerald-50 via-teal-50 to-white dark:from-emerald-950/50 dark:via-teal-950/40 dark:to-black/90",
    borderHover: "hover:border-emerald-300 hover:shadow-emerald-500/10 dark:hover:border-emerald-500/50",
    accent: "text-emerald-400",
  },
  {
    title: "Deep Space Obsidian Planet",
    prompt: "Cybernetic astronaut exploring crystalline obsidian planet at twin sunset, 360 degree orbit camera",
    tag: "Orbit 360",
    gradient: "from-amber-50 via-rose-50 to-white dark:from-amber-950/50 dark:via-rose-950/40 dark:to-black/90",
    borderHover: "hover:border-amber-300 hover:shadow-amber-500/10 dark:hover:border-amber-500/50",
    accent: "text-amber-400",
  },
];

function downloadAsset(url: string, id: string, kind: GeneratedAssetKind) {
  if (!url) return;
  const extension = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : kind === "object" ? "glb" : "png";
  const a = document.createElement("a");
  a.href = url;
  a.download = `luma-studio-${id}.${extension}`;
  a.click();
}

type GenerateSnapshot = {
  prompt?: string;
  tool?: StudioTool;
  model?: string;
  aspectRatio?: string;
  resolution?: StudioResolution;
  durationSeconds?: number;
  variations?: number;
  referenceImage?: string | null;
  referenceFile?: File | null;
  nodeGraph?: boolean;
};

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
  const [nodeGraph, setNodeGraph] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [sceneTitle, setSceneTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedModel, setSelectedModel] = useState("veo-3.1-fast-generate-001");
  const [variations, setVariations] = useState<1 | 2>(1);
  const [durationSeconds, setDurationSeconds] = useState(6);
  const [resolution, setResolution] = useState<StudioResolution>("medium");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current3DObject, setCurrent3DObject] = useState<Object3DData | null>(null);
  const [showBlueprint, setShowBlueprint] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [currentSoundFX, setCurrentSoundFX] = useState<SoundFXData | null>(null);
  const [showBrainstormModal, setShowBrainstormModal] = useState(false);

  // Canvas Media States
  const [canvasImage, setCanvasImage] = useState<string | null>(null);
  const [canvasVideo, setCanvasVideo] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [endFrameImage, setEndFrameImage] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [loopVideo, setLoopVideo] = useState(true);
  const [selectedMotionPreset, setSelectedMotionPreset] = useState<MotionPreset | null>(null);

  // View Layout Mode
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [timelineTarget, setTimelineTarget] = useState<TimelineTarget>({ mode: "full" });
  const [assets, setAssets] = useState<GeneratedAssetDetail[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
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
  const fileDropInputRef = useRef<HTMLInputElement | null>(null);
  const object3DRef = useRef<Object3DCanvasHandle>(null);
  const nodeGraphRef = useRef<NodeGraphCanvasHandle>(null);
  const pending3DFileRef = useRef<File | null>(null);

  const isVideoTool = tool === "txt2vid" || tool === "img2vid" || tool === "v2v";

  const currentAspectOption = useMemo(
    () => ASPECT_RATIOS.find((a) => a.id === aspectRatio) || ASPECT_RATIOS[0],
    [aspectRatio]
  );

  const aspectNumber = useMemo(() => {
    const [w, h] = currentAspectOption.ratio.split("/").map((n) => Number(n.trim()));
    return w > 0 && h > 0 ? w / h : 16 / 9;
  }, [currentAspectOption.ratio]);

  const models = useMemo(
    () => getModelsForTool(tool, availableModels),
    [availableModels, tool]
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

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setHistoryOpen(true);
    }
  }, []);

  useEffect(() => {
    if (tool !== "txt2obj" || !pending3DFileRef.current) return;
    const file = pending3DFileRef.current;
    pending3DFileRef.current = null;
    const frame = requestAnimationFrame(() => {
      object3DRef.current?.importFile(file);
    });
    return () => cancelAnimationFrame(frame);
  }, [tool]);

  const setToolAndReset = (next: StudioTool) => {
    setTool(next);
    setSelectedModel(getDefaultModelForTool(next));
    setError(null);
    if (next === "txt2img" || next === "txt2vid" || next === "sound_fx") {
      setReferenceFile(null);
    }
    if (next !== "v2v") {
      setTimelineTarget({ mode: "full" });
    }
  };

  const applyReference = async (file: File) => {
    const isMeshFile = /\.(obj|stl|glb|gltf)$/i.test(file.name);

    if (isMeshFile) {
      if (tool === "txt2obj") {
        object3DRef.current?.importFile(file);
      } else {
        pending3DFileRef.current = file;
        setTool("txt2obj");
      }
      setError(null);
      return;
    }

    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      setReferenceFile(file);
      setCanvasVideo(url);
      setCanvasImage(null);
      setTool("v2v");
      setTimelineTarget({ mode: "full" });
      setError(null);
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = await fileToDataUrl(file);
      setReferenceFile(file);
      setReferenceImage(url);
      if (tool !== "txt2obj") {
        setCanvasImage(url);
        setCanvasVideo(null);
        setTool(isVideoTool ? "img2vid" : "img2img");
      }
      setError(null);
      return;
    }
    setError("Please upload a valid image, video, or 3D file");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void applyReference(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleClearCanvas = () => {
    setCanvasImage(null);
    setCanvasVideo(null);
    setReferenceImage(null);
    setEndFrameImage(null);
    setReferenceFile(null);
  };

  const pushAsset = (asset: GeneratedAssetDetail) => {
    setAssets((prev) => [asset, ...prev].slice(0, 36));
    setSelectedHistoryId(asset.id);
    setHistoryOpen(true);
  };

  const assetSpecs = (
    kind: GeneratedAssetKind,
    extra: Partial<GeneratedAssetDetail> & Pick<GeneratedAssetDetail, "id" | "url" | "prompt" | "model">,
    snapshot?: GenerateSnapshot,
  ): GeneratedAssetDetail => {
    const activeTool = snapshot?.tool ?? extra.mode ?? tool;
    const activeAspect = snapshot?.aspectRatio ?? extra.aspectRatio ?? aspectRatio;
    const activeResolution = snapshot?.resolution ?? extra.resolution ?? resolution;
    const activeDuration = snapshot?.durationSeconds ?? extra.durationSeconds ?? durationSeconds;
    const activeVariations = snapshot?.variations ?? extra.variations ?? variations;
    const activeRef = snapshot?.referenceImage !== undefined ? snapshot.referenceImage : extra.referenceUrl ?? referenceImage;
    return {
      kind,
      timestamp: Date.now(),
      mode: activeTool,
      aspectRatio: activeAspect,
      resolution: activeResolution,
      durationSeconds: kind === "video" || kind === "audio" ? activeDuration : undefined,
      variations: kind === "image" || kind === "video" ? activeVariations : undefined,
      size: kind === "image" || kind === "video" ? sizeFromAspectAndResolution(activeAspect, activeResolution) : undefined,
      referenceUrl: activeRef,
      ...extra,
    };
  };

  const applyAssetSettings = (asset: GeneratedAssetDetail) => {
    if (asset.mode) setTool(asset.mode);
    setSelectedModel(asset.model);
    setPrompt(asset.prompt);
    if (asset.aspectRatio) setAspectRatio(asset.aspectRatio);
    if (asset.resolution) setResolution(asset.resolution);
    if (asset.durationSeconds != null) setDurationSeconds(asset.durationSeconds);
    if (asset.variations === 1 || asset.variations === 2) setVariations(asset.variations);
  };

  const handleGenerateWithPrompt = async (customPrompt?: string, snapshot?: GenerateSnapshot) => {
    const activeTool = snapshot?.tool ?? tool;
    const activeModel = snapshot?.model ?? selectedModel;
    const activeAspect = snapshot?.aspectRatio ?? aspectRatio;
    const activeResolution = snapshot?.resolution ?? resolution;
    const activeDuration = snapshot?.durationSeconds ?? durationSeconds;
    const activeVariations = snapshot?.variations ?? variations;
    const activeRefImage = snapshot?.referenceImage !== undefined ? snapshot.referenceImage : referenceImage;
    const activeRefFile = snapshot?.referenceFile !== undefined ? snapshot.referenceFile : referenceFile;
    const activeNodeGraph = snapshot?.nodeGraph ?? nodeGraph;
    const rawPrompt = customPrompt ?? snapshot?.prompt ?? prompt;
    const trimmed = rawPrompt.trim();
    const activeIsVideo = activeTool === "txt2vid" || activeTool === "img2vid" || activeTool === "v2v";

    if (!activeNodeGraph && (activeTool === "txt2img" || activeTool === "txt2vid" || activeTool === "txt2obj" || activeTool === "sound_fx") && !trimmed) {
      setError("Enter a descriptive prompt to generate");
      return;
    }
    if (!activeNodeGraph && (activeTool === "img2img" || activeTool === "img2vid") && !activeRefImage && !activeRefFile) {
      setError("Upload or select a Start Frame reference image");
      return;
    }

    setIsGenerating(true);
    setError(null);

    const firstPhrase = trimmed.split(/[,.]/)[0]?.toUpperCase() || "NEW GENERATION";
    setSceneTitle(firstPhrase.slice(0, 36));

    try {
      if (activeTool === "txt2obj") {
        const res = await fetch("/api/studio/object", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            model: activeModel,
            referenceImage: activeRefImage,
            previousObject: current3DObject,
          }),
        });
        const objData = await res.json().catch(() => ({}));
        if (res.ok && objData.id) {
          setCurrent3DObject(objData);
          pushAsset(assetSpecs("object", {
            id: objData.id,
            url: typeof objData.previewUrl === "string" ? objData.previewUrl : "",
            prompt: objData.prompt || trimmed,
            model: activeModel,
            mode: "txt2obj",
          }, snapshot));
        } else {
          setError(objData.error || "3D Object synthesis failed");
        }
      } else if (activeTool === "sound_fx") {
        const res = await fetch("/api/studio/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            model: activeModel,
            duration: activeDuration,
          }),
        });
        const soundRes = await res.json().catch(() => ({}));
        if (res.ok && soundRes.id) {
          setCurrentSoundFX(soundRes);
          pushAsset(assetSpecs("audio", {
            id: soundRes.id,
            url: soundRes.url,
            prompt: soundRes.prompt || trimmed,
            model: activeModel,
            mode: "sound_fx",
            aspectRatio: "1:1",
            durationSeconds: activeDuration,
          }, snapshot));
        } else {
          setError(soundRes.error || "Sound FX synthesis failed");
        }
      } else if (activeNodeGraph) {
        await nodeGraphRef.current?.applyPromptAndRun(trimmed || undefined);
      } else if (activeIsVideo) {
        const form = new FormData();
        form.set("mode", activeTool);
        form.set("prompt", trimmed);
        form.set("size", sizeFromAspectAndResolution(activeAspect, activeResolution));
        form.set("strength", "0.75");
        form.set("model", resolveStudioVideoModel(activeModel));
        form.set("duration", String(clampStudioVideoDuration(activeDuration)));
        form.set("quality", activeResolution);
        form.set("resolution", activeResolution);
        form.set("aspect_ratio", activeAspect);
        form.set("variations", String(activeVariations));
        form.set("seed", String(Math.floor(Math.random() * 1_000_000)));
        form.set("steps", "20");

        if (activeRefFile) form.set("image", activeRefFile);
        else if (activeRefImage) form.set("image", activeRefImage);

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

          if (url && !/flower\.mp4/i.test(url)) {
            const newAsset = assetSpecs("video", {
              id: typeof data.id === "string" ? data.id : `veo-${Date.now()}`,
              url,
              prompt: trimmed,
              model: activeModel,
              mode: activeTool,
            }, snapshot);
            setCanvasVideo(url);
            pushAsset(newAsset);
          } else {
            setError(studioErrorMessage(data, "Video generation did not return a clip for this prompt."));
          }
        } else {
          setError(studioErrorMessage(data, "Video generation failed"));
        }
      } else {
        const imageMode = activeTool === "img2img" || Boolean(activeRefImage || activeRefFile) ? "img2img" : "txt2img";
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: imageMode,
            prompt: trimmed,
            model: resolveStudioApiModel(activeModel),
            size: sizeFromAspectAndResolution(activeAspect, activeResolution),
            aspectRatio: activeAspect,
            quality: activeResolution,
            resolution: activeResolution,
            variations: activeVariations,
            n: activeVariations,
            image: activeRefImage || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        const row = data.data?.[0];
        const url = row?.b64_json
          ? `data:${row.mime || "image/png"};base64,${row.b64_json}`
          : typeof row?.url === "string"
            ? row.url
            : typeof data.url === "string"
              ? data.url
              : typeof data.images?.[0]?.url === "string"
                ? data.images[0].url
                : null;
        if (res.ok && url) {
          const newAsset = assetSpecs("image", {
            id: typeof data.id === "string" ? data.id : `luma-img-${Date.now()}`,
            url,
            prompt: trimmed,
            model: activeModel,
            mode: activeTool,
          }, snapshot);
          setCanvasImage(url);
          pushAsset(newAsset);
        } else {
          setError(studioErrorMessage(data, "Image generation failed"));
        }
      }
    } catch (err: any) {
      setError(err.message || "Generation encountered an issue");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectHistory = (asset: GeneratedAssetDetail) => {
    setSelectedHistoryId(asset.id);
    setNodeGraph(false);
    if (asset.kind === "audio" || asset.mode === "sound_fx") {
      setTool("sound_fx");
      setCurrentSoundFX({
        id: asset.id,
        name: asset.prompt.slice(0, 36).toUpperCase() || "SOUND FX",
        prompt: asset.prompt,
        model: asset.model,
        duration: asset.durationSeconds ?? durationSeconds,
        sampleRate: "48kHz",
        format: "mp3",
        url: asset.url,
        waveform: Array.from({ length: 48 }, () => 0.4),
      });
      return;
    }
    if (asset.kind === "object" || asset.mode === "txt2obj") {
      setTool("txt2obj");
      return;
    }
    if (asset.kind === "video") {
      setCanvasVideo(asset.url);
      setCanvasImage(null);
      if (tool === "txt2obj" || tool === "sound_fx") setTool(asset.mode ?? "txt2vid");
      return;
    }
    setCanvasImage(asset.url);
    setCanvasVideo(null);
    if (tool === "txt2obj" || tool === "sound_fx") setTool(asset.mode ?? "txt2img");
  };

  const handleRecreate = (asset: GeneratedAssetDetail) => {
    applyAssetSettings(asset);
    void handleGenerateWithPrompt(asset.prompt, {
      tool: asset.mode,
      model: asset.model,
      aspectRatio: asset.aspectRatio,
      resolution: asset.resolution,
      durationSeconds: asset.durationSeconds,
      variations: asset.variations,
      referenceImage: asset.referenceUrl ?? null,
      nodeGraph: false,
    });
  };

  const handleUseAsReference = (asset: GeneratedAssetDetail) => {
    setHistoryOpen(true);
    setNodeGraph(false);
    setPrompt(asset.prompt);
    if (asset.kind === "video") {
      setCanvasVideo(asset.url);
      setCanvasImage(null);
      setReferenceImage(null);
      setTool("v2v");
      return;
    }
    if (asset.kind === "audio") {
      setTool("sound_fx");
      return;
    }
    if (asset.url) {
      setReferenceImage(asset.url);
      setCanvasImage(asset.url);
      setCanvasVideo(null);
      setTool(asset.mode === "txt2vid" || asset.mode === "img2vid" || asset.mode === "v2v" ? "img2vid" : "img2img");
    }
  };

  const handleShareScene = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleBrainstorm = () => {
    setShowBrainstormModal(true);
  };

  // Parse prompt into pills / keywords
  const promptPillTags = useMemo(() => {
    if (!prompt.trim()) return [];
    const parts = prompt.split(/[,.]/).map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 6);
  }, [prompt]);

  const hasMediaInCanvas = Boolean(canvasVideo || canvasImage || referenceImage);

  return (
    <div className="od-studio relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-zinc-900 selection:bg-cyan-500/20 dark:bg-black dark:text-white dark:selection:bg-cyan-500/30">
      {/* Hidden File Input for Canvas Dropzone */}
      <input
        ref={fileDropInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void applyReference(file);
        }}
      />

      {/* ── 1. Top Sleek Unified Studio Header ── */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur-xl sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
        {/* Left: Dynamic Scene Name & Engine Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-600 shadow-sm dark:border-cyan-500/30 dark:bg-cyan-500/20 dark:text-cyan-400">
              <Wand2 className="h-3.5 w-3.5" />
            </div>
            <h1 className="max-w-[140px] truncate font-mono text-xs font-bold uppercase tracking-wider text-zinc-900 sm:max-w-[240px] sm:text-sm dark:text-white">
              {sceneTitle || "DREAM MACHINE STUDIO"}
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {status.engine.toUpperCase()}
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-400" />
              {status.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setHistoryOpen((open) => !open)}
            className={cn(
              "h-7 border px-2.5 text-xs",
              historyOpen
                ? "border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/10",
            )}
          >
            <History className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">History</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onPress={handleBrainstorm}
            className="h-7 border border-amber-200 bg-amber-50 px-2.5 text-xs text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <Sparkles className="mr-1 h-3 w-3 text-amber-500 dark:text-amber-400" />
            <span className="hidden sm:inline">Brainstorm</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onPress={handleShareScene}
            className="h-7 border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/10"
          >
            <Share2 className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">{copiedShare ? "Copied!" : "Share"}</span>
          </Button>
        </div>
      </header>

      {/* ── Main Studio Cinematic Stage ── */}
      <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {nodeGraph ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-36">
          <NodeGraphCanvas
            ref={nodeGraphRef}
            family={getGenerationFamily(tool)}
            onAssetGenerated={(asset) => {
              const fullAsset = assetSpecs(asset.kind, {
                ...asset,
                mode: tool === "nodes" ? "txt2img" : tool,
                aspectRatio,
              });
              pushAsset(fullAsset);
              if (asset.kind === "video") {
                setCanvasVideo(asset.url);
              } else if (asset.kind === "audio") {
                setCurrentSoundFX({
                  id: asset.id,
                  name: asset.prompt.slice(0, 36).toUpperCase(),
                  prompt: asset.prompt,
                  model: asset.model,
                  duration: durationSeconds,
                  sampleRate: "48kHz",
                  format: "mp3",
                  url: asset.url,
                  waveform: Array.from({ length: 48 }, () => 0.4),
                });
              } else {
                setCanvasImage(asset.url);
              }
            }}
            onSendToCanvas={(url) => {
              setNodeGraph(false);
              if (tool === "sound_fx") {
                setTool("img2img");
              }
              setCanvasImage(url);
              setReferenceImage(url);
            }}
          />
        </section>
      ) : tool === "txt2obj" ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-36">
          {error && (
            <div className="relative z-10 mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
          <Object3DCanvas
            ref={object3DRef}
            initialObject={current3DObject}
            isGenerating={isGenerating}
            showBlueprint={showBlueprint}
            showDimensions={showDimensions}
            onToggleBlueprint={() => setShowBlueprint((prev) => !prev)}
            onToggleDimensions={() => setShowDimensions((prev) => !prev)}
            onSendToVideo={(obj, snapshotUrl) => {
              setTool("img2vid");
              setReferenceImage(snapshotUrl);
              setCanvasImage(snapshotUrl);
              const spinPrompt = `360 degree turntable product showcase video of ${obj.name}: ${obj.prompt}, cinematic studio lighting`;
              setPrompt(spinPrompt);
            }}
            onSendToImageRemix={(snapshotUrl) => {
              setTool("img2img");
              setReferenceImage(snapshotUrl);
              setCanvasImage(snapshotUrl);
            }}
            onPromptSelect={(presetPrompt) => {
              setPrompt(presetPrompt);
            }}
            onObjectChange={setCurrent3DObject}
          />
        </section>
      ) : tool === "sound_fx" ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-6 pb-36">
          <div className="mx-auto w-full max-w-4xl h-[calc(100vh-260px)] min-h-[440px]">
            <SoundFXCanvas
              soundData={currentSoundFX}
              isGenerating={isGenerating}
              onAttachToVideo={() => {
                if (canvasVideo) {
                  setTool("v2v");
                }
              }}
              onSelectPreset={(presetPrompt, title) => {
                setPrompt(presetPrompt);
                setSceneTitle(title);
                void handleGenerateWithPrompt(presetPrompt);
              }}
            />
          </div>
        </section>
      ) : (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 sm:px-6">
          {/* Ambient Background Glow Mesh */}
          <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(147,51,234,0.06),rgba(0,0,0,0))]" />

          {/* Error Banner */}
          {error && (
            <div className="relative z-10 mx-auto mt-4 w-full max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Prompt Keyword Tag Bar (when prompt exists) */}
          {promptPillTags.length > 0 && (
            <div className="relative z-10 w-full max-w-4xl mx-auto mt-3 flex flex-wrap items-center gap-1.5 justify-center">
              <span className="font-mono text-[11px] text-zinc-400">Focus Tag:</span>
              {promptPillTags.map((tag, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(tag)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 font-mono text-[11px] text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
             2. EXPANSIVE ASPECT RATIO-ADAPTIVE PREVIEW STAGE
             ══════════════════════════════════════════════════════ */}
          <div className="relative z-10 mx-auto my-auto flex w-full flex-1 flex-col py-4 pb-44">
              <div className="flex w-full flex-1 flex-col">
                {/* 1. Viewport Status Header */}
                <div className="flex w-full items-center justify-between gap-2 px-1 pb-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400">
                      {tool.toUpperCase()}
                    </span>
                    <span className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      {currentAspectOption.label} · {resolution}
                    </span>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2">
                    {hasMediaInCanvas && (
                      <button
                        type="button"
                        onClick={handleClearCanvas}
                        className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        title="Clear current preview"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Outer full-width box + inner aspect-ratio frame */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    "flex w-full flex-1 items-center justify-center rounded-2xl border px-4 py-8 sm:px-8 sm:py-10 min-h-[320px] transition-colors",
                    isDraggingOver
                      ? "border-cyan-400 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-950/30"
                      : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950",
                  )}
                >
                  <div
                    style={{
                      aspectRatio: currentAspectOption.ratio,
                      maxHeight: "min(520px, calc(100vh - 340px))",
                      width: `min(100%, calc(min(520px, 100vh - 340px) * ${aspectNumber}))`,
                    }}
                    className={cn(
                      "group relative flex max-w-full flex-col items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-all duration-300",
                      isDraggingOver
                        ? "border-cyan-400 bg-white dark:bg-cyan-950/20"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
                    )}
                  >
                  {/* Viewfinder Rule-of-Thirds & Corner Crosshair Markings */}
                  <div className="pointer-events-none absolute inset-0 z-20">
                    {/* Corner Crosshairs */}
                    <div className="absolute top-3 left-3 font-mono text-xs text-zinc-300 dark:text-white/20">+</div>
                    <div className="absolute top-3 right-3 font-mono text-xs text-zinc-300 dark:text-white/20">+</div>
                    <div className="absolute bottom-3 left-3 font-mono text-xs text-zinc-300 dark:text-white/20">+</div>
                    <div className="absolute bottom-3 right-3 font-mono text-xs text-zinc-300 dark:text-white/20">+</div>

                    {/* Viewfinder Aspect Watermark */}
                    <div className="absolute bottom-3 left-7 font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-white/25">
                      PREVIEW · {aspectRatio} · {tool.toUpperCase()}
                    </div>
                  </div>

                  {/* Ambient Spotlight Glow */}
                  <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[500px] -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-400/10 via-blue-400/8 to-violet-400/10 blur-3xl dark:from-cyan-500/20 dark:via-blue-500/15 dark:to-purple-500/20" />

                  {/* Content View: Video Player / Image / Generating / Empty Stage */}
                  {isGenerating ? (
                    /* Generating Scanning Shader Animation */
                    <div className="relative z-10 flex flex-col items-center justify-center space-y-4 p-6 text-center">
                      <div className="relative flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600 shadow-sm dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-300 dark:shadow-cyan-500/20">
                        <Sparkles className="h-8 w-8 animate-spin" style={{ animationDuration: "4s" }} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-bold tracking-wide text-zinc-900 sm:text-lg dark:text-white">
                          Synthesizing Cinematic Frames...
                        </h3>
                        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {selectedModel.toUpperCase()} · {resolution} · {sizeFromAspectAndResolution(aspectRatio, resolution)}
                        </p>
                      </div>
                      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 animate-pulse rounded-full w-2/3" />
                      </div>
                    </div>
                  ) : canvasVideo ? (
                    /* Active Video Player View */
                    <div className="relative h-full w-full flex items-center justify-center bg-black">
                      <video
                        ref={videoRef}
                        src={canvasVideo}
                        autoPlay
                        loop={loopVideo}
                        playsInline
                        className="h-full w-full object-contain"
                      />
                      {/* Video Overlay Action Bar */}
                      <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => downloadAsset(canvasVideo, `video-${Date.now()}`, "video")}
                          className="rounded-xl bg-black/80 hover:bg-white/20 text-white p-2 border border-white/15 backdrop-blur-md transition-colors"
                          title="Download MP4"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : canvasImage || referenceImage ? (
                    /* Active Image View */
                    <div className="relative h-full w-full flex items-center justify-center bg-black">
                      <img
                        src={canvasImage || referenceImage || ""}
                        alt="Canvas Preview"
                        className="h-full w-full object-contain"
                      />
                      {/* Image Action Overlay */}
                      <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setTool("img2vid");
                            setReferenceImage(canvasImage || referenceImage);
                          }}
                          className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all"
                        >
                          <Video className="h-3.5 w-3.5" />
                          <span>Animate to Video</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadAsset(canvasImage || referenceImage || "", `img-${Date.now()}`, "image")}
                          className="rounded-xl bg-black/80 hover:bg-white/20 text-white p-2 border border-white/15 backdrop-blur-md transition-colors"
                          title="Download Image"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Empty Stage: Center Interactive Viewport & Prompt Hub */
                    <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center justify-center space-y-4 px-6 py-8 text-center">
                      {/* Center Glowing Icon */}
                      <button
                        type="button"
                        onClick={() => fileDropInputRef.current?.click()}
                        className="group/icon relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-violet-50 text-cyan-600 shadow-sm transition-transform hover:scale-105 dark:border-cyan-500/40 dark:from-cyan-500/20 dark:via-blue-500/20 dark:to-purple-500/20 dark:text-cyan-300 dark:shadow-cyan-500/20"
                        title="Click to upload reference media"
                      >
                        <Sparkles className="h-7 w-7 transition-transform group-hover/icon:rotate-12" />
                      </button>

                      <div className="space-y-1.5">
                        <h2 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
                          What will you imagine today?
                        </h2>
                        <p className="mx-auto max-w-sm text-xs leading-relaxed text-zinc-500 sm:text-sm dark:text-zinc-400">
                          Synthesize fluid cinematic camera motion, interpolate keyframes, and create photorealistic AI visuals in {aspectRatio}.
                        </p>
                      </div>

                      {/* Dropzone Cue / Upload Button */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => fileDropInputRef.current?.click()}
                          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white"
                        >
                          <Upload className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>Drop reference image/video or click to browse</span>
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                </div>

              </div>
          </div>
        </section>
      )}
      </div>
      <StudioHistoryRail
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        assets={assets}
        selectedId={selectedHistoryId}
        onSelect={handleSelectHistory}
        onRecreate={handleRecreate}
        onUseAsReference={handleUseAsReference}
        models={availableModels}
        isGenerating={isGenerating}
      />
      </div>

      <>
          <LumaPromptBar
            prompt={prompt}
            setPrompt={setPrompt}
            onGenerate={() => void handleGenerateWithPrompt()}
            isGenerating={isGenerating}
            canGenerate={nodeGraph || Boolean(prompt.trim())}
            tool={tool}
            setTool={setToolAndReset}
            nodeGraph={nodeGraph}
            setNodeGraph={setNodeGraph}
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
            variations={variations}
            setVariations={setVariations}
            durationSeconds={durationSeconds}
            setDurationSeconds={setDurationSeconds}
            resolution={resolution}
            setResolution={setResolution}
            videoRef={videoRef}
            videoUrl={canvasVideo}
            timelineTarget={timelineTarget}
            onTimelineTargetChange={setTimelineTarget}
            dockInsetRight={historyOpen ? HISTORY_RAIL_WIDTH : 0}
            objectActions={{
              hasObject: Boolean(current3DObject),
              showBlueprint,
              showDimensions,
              onSnapshot: () => object3DRef.current?.snapshot(),
              onExport: () => object3DRef.current?.exportObj(),
              onRemix2D: () => object3DRef.current?.remix2d(),
              onAnimate: () => object3DRef.current?.animateVideo(),
              onToggleBlueprint: () => setShowBlueprint((prev) => !prev),
              onToggleDimensions: () => setShowDimensions((prev) => !prev),
            }}
          />

          {showBrainstormModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-xl animate-in fade-in duration-150 dark:bg-black/80">
              <div className="relative w-full max-w-2xl space-y-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-zinc-900 dark:text-white">
                        Creative Inspirations
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Pick a curated concept to load into your prompt bar in {aspectRatio}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBrainstormModal(false)}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                  {INSPIRATION_STARTERS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPrompt(s.prompt);
                        setSceneTitle(s.title.toUpperCase());
                        setShowBrainstormModal(false);
                      }}
                      className={cn(
                        "group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-zinc-200 bg-gradient-to-br p-3.5 text-left transition-all duration-200 hover:scale-[1.01] hover:shadow-md dark:border-zinc-800",
                        s.gradient,
                        s.borderHover
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-xs font-bold tracking-tight", s.accent)}>
                            {s.title}
                          </span>
                          <span className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[9px] text-zinc-500 dark:border-zinc-700 dark:bg-black/70 dark:text-zinc-300">
                            {s.tag}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {s.prompt}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2 font-mono text-[10px] text-zinc-500 transition-colors group-hover:text-zinc-800 dark:border-zinc-800 dark:text-zinc-400 dark:group-hover:text-white">
                        <span>Load in prompt dock</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
      </>
    </div>
  );
}
