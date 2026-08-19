"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect, type KeyboardEvent, type RefObject } from "react";
import {
  Video,
  Infinity as InfinityIcon,
  ArrowUp,
  Loader2,
  ChevronDown,
  Sparkles,
  X,
  Paperclip,
  Camera,
  Download,
  Image as ImageIcon,
  Box,
  Grid3x3,
  Ruler,
  Volume2,
  GitFork,
  Timer,
} from "lucide-react";
import { motion, AnimatePresence, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { LumaMotionPopover, type MotionPreset } from "./LumaMotionPopover";
import { LumaSettingsPopover, VideoDurationSlider, mapToolToGenerationFamily, type LumaSettings } from "./LumaSettingsPopover";
import { InteractiveVideoTimeline, type TimelineTarget } from "./InteractiveVideoTimeline";
import { clampStudioVideoDuration, type StudioModelOption, type StudioResolution, type StudioTool } from "@/lib/studio-constants";

// ---------------------------------------------------------------------------
// Motion tokens & Physics Constants
// ---------------------------------------------------------------------------
const EASE = [0.2, 0, 0, 1] as const;
const SPRING_SOFT = { type: "spring" as const, stiffness: 420, damping: 32 };
const SPRING_HEIGHT = { type: "spring" as const, stiffness: 380, damping: 34 };
const SPRING_PRESS = { type: "spring" as const, stiffness: 500, damping: 28 };
const SPRING_ICON = { type: "spring" as const, duration: 0.3, bounce: 0 };

type PresenceProps = Pick<
  HTMLMotionProps<"span">,
  "initial" | "animate" | "exit" | "transition"
>;

const ICON_SWAP: PresenceProps = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: SPRING_ICON,
};

function scaleBlurPresence(): PresenceProps {
  return {
    initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
    transition: SPRING_ICON,
  };
}

function placeholderPresence(): PresenceProps {
  return {
    initial: { opacity: 0, y: 6, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: -6, filter: "blur(4px)" },
    transition: { duration: 0.35, ease: EASE },
  };
}

// Mode-specific rotating placeholders
const MODE_PLACEHOLDERS: Record<string, readonly string[]> = {
  txt2vid: [
    "A majestic snow leopard leaping across alpine ridges in slow motion...",
    "Futuristic hypercar gliding through neon-drenched Tokyo rain...",
    "Sweeping drone flight over mist-shrouded temple waterfalls...",
    "Cinematic anamorphic close-up with soft lens flare and bokeh...",
  ],
  img2vid: [
    "Smooth orbit around the subject with cinematic camera push-in...",
    "Transform into dynamic slow-motion sequence with volumetric lighting...",
    "Interpolate smoothly between start and end keyframes...",
  ],
  txt2img: [
    "Photorealistic 8K portrait with volumetric golden-hour rim lighting...",
    "Architectural modern villa with brutalist concrete and warm cedar...",
    "Cyberpunk street merchant scene with holographic neon reflections...",
  ],
  txt2obj: [
    "Minimalist matte ceramic pour-over kettle with carved walnut handle...",
    "Carbon stealth quadcopter drone with 4K gimbal and titanium chassis...",
    "Aerodynamic cyber sneaker with translucent air-cushion sole...",
  ],
  sound_fx: [
    "Heavy nocturnal rain on metallic roof with distant siren echoes...",
    "Deep sub-bass cinematic Hollywood braam impact with metallic tail...",
    "High-speed drone rotor Doppler flyby with electric motor whine...",
  ],
  nodes: [
    "Build a multi-model generative pipeline on the node canvas...",
    "Connect diffusion latents to camera motion nodes...",
  ],
  default: [
    "Describe what you want to create or imagine...",
    "Add camera motion, lighting cues, and scene action...",
  ],
};

export interface StudioObjectActions {
  onSnapshot?: () => void;
  onExport?: () => void;
  onRemix2D?: () => void;
  onAnimate?: () => void;
  onToggleBlueprint?: () => void;
  onToggleDimensions?: () => void;
  hasObject?: boolean;
  showBlueprint?: boolean;
  showDimensions?: boolean;
}

interface LumaPromptBarProps {
  prompt: string;
  setPrompt: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  tool: StudioTool;
  setTool: (t: StudioTool) => void;
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  availableModels: StudioModelOption[];
  referenceImage: string | null;
  setReferenceImage: (v: string | null) => void;
  endFrameImage?: string | null;
  setEndFrameImage?: (v: string | null) => void;
  onReferenceFile?: (file: File) => void;
  loopVideo: boolean;
  setLoopVideo: (v: boolean) => void;
  selectedMotionPreset: MotionPreset | null;
  setSelectedMotionPreset: (v: MotionPreset | null) => void;
  variations: 1 | 2;
  setVariations: (v: 1 | 2) => void;
  durationSeconds: number;
  setDurationSeconds: (v: number) => void;
  resolution: StudioResolution;
  setResolution: (v: StudioResolution) => void;
  objectActions?: StudioObjectActions;
  videoRef?: RefObject<HTMLVideoElement | null>;
  videoUrl?: string | null;
  timelineTarget?: TimelineTarget;
  onTimelineTargetChange?: (target: TimelineTarget) => void;
  nodeGraph?: boolean;
  setNodeGraph?: (v: boolean) => void;
  dockInsetRight?: number;
}

export function LumaPromptBar({
  prompt,
  setPrompt,
  onGenerate,
  isGenerating,
  canGenerate,
  tool,
  setTool,
  aspectRatio,
  setAspectRatio,
  selectedModel,
  setSelectedModel,
  availableModels,
  referenceImage,
  setReferenceImage,
  endFrameImage,
  setEndFrameImage,
  onReferenceFile,
  loopVideo,
  setLoopVideo,
  selectedMotionPreset,
  setSelectedMotionPreset,
  variations,
  setVariations,
  durationSeconds,
  setDurationSeconds,
  resolution,
  setResolution,
  objectActions,
  videoRef,
  videoUrl,
  timelineTarget,
  onTimelineTargetChange,
  nodeGraph = false,
  setNodeGraph,
  dockInsetRight = 0,
}: LumaPromptBarProps) {
  const [showMotionPopover, setShowMotionPopover] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [showDurationPopover, setShowDurationPopover] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isMagicEnhancing, setIsMagicEnhancing] = useState(false);
  const [height, setHeight] = useState<number | "auto">("auto");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endFrameInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const durationPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showDurationPopover) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!durationPopoverRef.current?.contains(event.target as Node)) {
        setShowDurationPopover(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDurationPopover]);

  const isVideo = tool === "txt2vid" || tool === "img2vid" || tool === "v2v";
  const isImage = tool === "txt2img" || tool === "img2img";
  const is3D = tool === "txt2obj";
  const isSound = tool === "sound_fx";
  const isNodes = nodeGraph;

  useEffect(() => {
    if (!isVideo || isNodes) setShowDurationPopover(false);
  }, [isVideo, isNodes]);
  const showAttach = !isSound && !isNodes;
  const hasAttachedMedia = Boolean(referenceImage) || Boolean(endFrameImage);
  const has3DObject = Boolean(objectActions?.hasObject);

  // Rotating placeholder cycle
  const placeholders = MODE_PLACEHOLDERS[tool] || MODE_PLACEHOLDERS.default;
  useEffect(() => {
    if (prompt.length > 0 || isFocused) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [prompt.length, isFocused, placeholders.length]);

  const currentPlaceholder = placeholders[placeholderIndex % placeholders.length];

  // Auto-growing textarea resize logic
  const resize = useCallback(() => {
    const el = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!el) return;

    const lineHeight = 24;
    const minH = lineHeight * 1 + 16;
    const maxH = lineHeight * 6 + 16;

    if (mirror) {
      mirror.style.width = `${el.clientWidth}px`;
      mirror.textContent = prompt.endsWith("\n") ? `${prompt} ` : prompt || " ";
      const next = Math.min(Math.max(mirror.scrollHeight, minH), maxH);
      setHeight(next);
      el.style.overflowY = mirror.scrollHeight > maxH ? "auto" : "hidden";
    }
  }, [prompt]);

  useLayoutEffect(() => {
    resize();
  }, [resize]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && !isGenerating) {
        onGenerate();
      }
    }
  };

  const handleMagicEnhancePrompt = async () => {
    if (!prompt.trim() || isMagicEnhancing) return;
    setIsMagicEnhancing(true);
    try {
      const res = await fetch("/api/studio/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: is3D ? "3d" : isSound ? "audio" : isVideo ? "video" : "image" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.enhancedPrompt) {
          setPrompt(data.enhancedPrompt);
        }
      }
    } catch {
      // Keep existing prompt
    } finally {
      setIsMagicEnhancing(false);
    }
  };

  // Convert current state into LumaSettings representation
  const currentSettings: LumaSettings = {
    mode: tool,
    mediaType: isVideo ? "videos" : "images",
    aspectRatio,
    variations,
    durationSeconds,
    resolution,
    modelId: selectedModel,
  };

  const handleUpdateSettings = (next: Partial<LumaSettings>) => {
    if (next.mode) setTool(next.mode);
    if (next.aspectRatio) setAspectRatio(next.aspectRatio);
    if (next.modelId) setSelectedModel(next.modelId);
    if (next.variations) setVariations(next.variations);
    if (next.durationSeconds != null) setDurationSeconds(next.durationSeconds);
    if (next.resolution) setResolution(next.resolution);
    if (next.mediaType && !next.mode) {
      setTool(mapToolToGenerationFamily(tool, next.mediaType));
    }
  };

  const formatBadgeMeta = is3D ? "MESH" : isSound ? `${durationSeconds}S` : isNodes ? "GRAPH" : aspectRatio;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4 md:left-[260px]",
        dockInsetRight > 0 && "md:right-[300px]",
      )}
    >
      <div className="relative w-full max-w-3xl pointer-events-auto">
        {/* Popovers anchored above prompt bar with AnimatePresence */}
        <AnimatePresence>
          {showMotionPopover && (
            <LumaMotionPopover
              isOpen={showMotionPopover}
              onClose={() => setShowMotionPopover(false)}
              onSelectPreset={(preset) => {
                setSelectedMotionPreset(preset);
                if (!prompt.includes(preset.promptTag)) {
                  setPrompt(prompt ? `${prompt}, ${preset.promptTag}` : preset.promptTag);
                }
              }}
              selectedPresetId={selectedMotionPreset?.id}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettingsPopover && (
            <LumaSettingsPopover
              isOpen={showSettingsPopover}
              onClose={() => setShowSettingsPopover(false)}
              settings={currentSettings}
              onUpdateSettings={handleUpdateSettings}
              availableModels={availableModels}
              onToolSelect={(t) => setTool(t)}
              nodeGraph={nodeGraph}
              onToggleNodeGraph={setNodeGraph}
            />
          )}
        </AnimatePresence>

        {isVideo && !isNodes && (
          <InteractiveVideoTimeline
            compact
            videoRef={videoRef}
            videoUrl={videoUrl}
            duration={durationSeconds}
            target={timelineTarget}
            onTargetChange={onTimelineTargetChange}
          />
        )}

        {/* Outer Floating Dock Container with Spring Physics */}
        <motion.div
          layout
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            boxShadow: isFocused
              ? "0 18px 40px -16px rgba(24, 24, 27, 0.28), 0 0 0 1px rgba(6, 182, 212, 0.35)"
              : "0 14px 32px -16px rgba(24, 24, 27, 0.18), 0 0 0 1px rgba(24, 24, 27, 0.08)",
          }}
          transition={{ duration: 0.28, ease: EASE }}
          className="relative rounded-2xl border border-zinc-200 bg-white/95 p-3 backdrop-blur-2xl transition-all duration-200 sm:p-3.5 dark:border-zinc-800 dark:bg-[rgba(10,12,18,0.94)]"
        >
          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.obj,.stl,.glb,.gltf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onReferenceFile) {
                onReferenceFile(file);
              }
            }}
          />
          <input
            ref={endFrameInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && setEndFrameImage) {
                const url = URL.createObjectURL(file);
                setEndFrameImage(url);
              }
            }}
          />

          {/* Mirror container for height auto-grow */}
          <div
            ref={mirrorRef}
            aria-hidden
            className="invisible absolute top-0 left-0 -z-10 px-1 text-sm leading-relaxed break-words whitespace-pre-wrap font-sans"
          />

          {/* Attached Media Cards with Scale-Blur Motion */}
          <AnimatePresence initial={false}>
            {hasAttachedMedia && (
              <motion.div
                layout
                {...scaleBlurPresence()}
                className="mb-2 flex items-center gap-2 border-b border-zinc-200 pb-2.5 dark:border-white/10"
              >
                {referenceImage && (
                  <motion.div
                    whileHover={{ scale: 1.04 }}
                    transition={SPRING_PRESS}
                    className="relative group rounded-xl overflow-hidden border border-white/20 h-12 w-16 bg-black/60 shrink-0 shadow-md"
                  >
                    <img
                      src={referenceImage}
                      alt="Start Reference"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        onClick={() => setReferenceImage(null)}
                        className="rounded-full bg-red-600 p-0.5 text-white hover:bg-red-500"
                      >
                        <X className="h-3 w-3" />
                      </motion.button>
                    </div>
                    <span className="absolute bottom-0.5 left-1 rounded bg-black/80 px-1 py-0.2 text-[8px] font-mono text-zinc-300">
                      START
                    </span>
                  </motion.div>
                )}

                {endFrameImage && (
                  <motion.div
                    whileHover={{ scale: 1.04 }}
                    transition={SPRING_PRESS}
                    className="relative group rounded-xl overflow-hidden border border-purple-500/40 h-12 w-16 bg-black/60 shrink-0 shadow-md"
                  >
                    <img
                      src={endFrameImage}
                      alt="End Frame"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        onClick={() => setEndFrameImage && setEndFrameImage(null)}
                        className="rounded-full bg-red-600 p-0.5 text-white hover:bg-red-500"
                      >
                        <X className="h-3 w-3" />
                      </motion.button>
                    </div>
                    <span className="absolute bottom-0.5 left-1 rounded bg-purple-950/90 px-1 py-0.2 text-[8px] font-mono text-purple-300">
                      END
                    </span>
                  </motion.div>
                )}

                <span className="text-[11px] font-mono text-zinc-400 ml-1">
                  {endFrameImage ? "Keyframe Interpolation active" : "Reference attached"}
                </span>

                {isVideo && !endFrameImage && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => endFrameInputRef.current?.click()}
                    className="ml-auto text-[10px] font-mono text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:bg-purple-950/30 rounded-lg px-2 py-1 transition-colors"
                  >
                    + Add End Frame
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {is3D && !isNodes && (
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              <Box className="h-3 w-3 shrink-0 text-cyan-500" />
              <span className="truncate">
                {has3DObject
                  ? "Refine this mesh — materials, silhouette, or a new object"
                  : "Describe a product or object, then generate into the 3D stage"}
              </span>
            </div>
          )}

          {isSound && !isNodes && (
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              <Volume2 className="h-3 w-3 shrink-0 text-cyan-500" />
              <span className="truncate">Prompt to sound — Foley, ambience, impacts, or a voice bed</span>
            </div>
          )}

          {isNodes && (
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              <GitFork className="h-3 w-3 shrink-0 text-cyan-500" />
              <span className="truncate">
                {isVideo
                  ? "Video nodes — prompt writes the graph and runs the video pipeline"
                  : is3D
                    ? "Object nodes — prompt writes the graph and synthesizes the mesh"
                    : isSound
                      ? "Sound nodes — prompt writes the graph and synthesizes audio"
                      : "Image nodes — prompt writes the graph and runs the image pipeline"}
              </span>
            </div>
          )}

          {/* Multiline Prompt Input Area with Animated Rotating Placeholder */}
          <div className={cn("relative min-h-[44px]", is3D ? "mb-1.5" : "mb-2")}>
            {/* Animated Rotating Placeholder when empty */}
            {prompt.length === 0 && !isFocused && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 px-1 pt-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={currentPlaceholder}
                    {...placeholderPresence()}
                    className="block truncate font-sans text-sm leading-relaxed text-zinc-400"
                  >
                    {currentPlaceholder}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}

            <motion.textarea
              ref={textareaRef}
              rows={1}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              animate={{ height: typeof height === "number" ? height : undefined }}
              transition={SPRING_HEIGHT}
              className="relative z-10 block w-full resize-none bg-transparent px-1 py-1 font-sans text-sm leading-relaxed text-zinc-900 caret-cyan-600 scrollbar-none focus:outline-none dark:text-white dark:caret-cyan-400"
            />
          </div>

          {/* Bottom Controls Toolbar with Spring Feedback */}
          <div
            className={cn(
              "flex border-t border-zinc-200 pt-1.5 dark:border-white/[0.08]",
              "flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
            )}
          >
            {/* Left Action Toolbar */}
            <div className="flex min-w-0 items-center gap-1">
              {showAttach && (
                <motion.button
                  whileHover={{ scale: 1.08, y: -1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_PRESS}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
                  title={is3D ? "Import 3D file (.OBJ / .GLB / .STL) or a reference image" : "Attach Reference Image, Video, or 3D File"}
                >
                  <Paperclip className="h-4 w-4" />
                </motion.button>
              )}

              {isVideo && !isNodes && (
                <div className="relative" ref={durationPopoverRef}>
                  <motion.button
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={SPRING_PRESS}
                    type="button"
                    onClick={() => {
                      setShowDurationPopover((open) => !open);
                      setShowSettingsPopover(false);
                      setShowMotionPopover(false);
                    }}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-[11px] font-semibold transition-all",
                      showDurationPopover
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-zinc-950"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white",
                    )}
                    title="Set clip duration"
                  >
                    <Timer className="h-3.5 w-3.5" />
                    <span>{clampStudioVideoDuration(durationSeconds)}s</span>
                  </motion.button>
                  <AnimatePresence>
                    {showDurationPopover && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={{ duration: 0.18, ease: EASE }}
                        className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <VideoDurationSlider value={durationSeconds} onChange={setDurationSeconds} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {isSound && (
                <div className="flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-white/10 dark:bg-white/5">
                  {([5, 9] as const).map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setDurationSeconds(seconds)}
                      className={cn(
                        "h-7 rounded-md px-2 font-mono text-[10px] font-semibold transition-colors",
                        durationSeconds === seconds
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-cyan-400 dark:text-zinc-950"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white",
                      )}
                      title={`${seconds} second clip`}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              )}

              {is3D && !isNodes && (
                <div className="flex items-center gap-1">
                  <div className="flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-white/10 dark:bg-white/5">
                    <button
                      type="button"
                      onClick={objectActions?.onToggleBlueprint}
                      className={cn(
                        "flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[10px] font-semibold transition-colors",
                        objectActions?.showBlueprint
                          ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
                      )}
                      title="Toggle blueprint construction lines"
                    >
                      <Grid3x3 className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Plan</span>
                    </button>
                    <button
                      type="button"
                      onClick={objectActions?.onToggleDimensions}
                      className={cn(
                        "flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[10px] font-semibold transition-colors",
                        objectActions?.showDimensions
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
                      )}
                      title="Highlight product width, depth, and height"
                    >
                      <Ruler className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Dims</span>
                    </button>
                  </div>

                  <div className="flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-0.5 dark:border-white/10 dark:bg-white/5">
                    {([
                      { id: "snapshot", icon: Camera, title: "Capture a snapshot", onClick: objectActions?.onSnapshot },
                      { id: "export", icon: Download, title: "Export OBJ mesh", onClick: objectActions?.onExport },
                      { id: "remix", icon: ImageIcon, title: "Remix snapshot in 2D", onClick: objectActions?.onRemix2D },
                      { id: "animate", icon: Video, title: "Animate to turntable video", onClick: objectActions?.onAnimate },
                    ] as const).map((action) => {
                      const Icon = action.icon;
                      const accent = action.id === "animate";
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={action.onClick}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                            accent
                              ? "text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/15"
                              : "text-zinc-500 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
                          )}
                          title={action.title}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Camera Motion Button (Video modes) */}
              {isVideo && (
                <motion.button
                  whileHover={{ scale: 1.08, y: -1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_PRESS}
                  type="button"
                  onClick={() => setShowMotionPopover((prev) => !prev)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                    showMotionPopover || selectedMotionPreset
                      ? "border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-400"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
                  )}
                  title="Camera Motion Controls"
                >
                  <Video className="h-4 w-4" />
                </motion.button>
              )}

              {/* Active Motion Preset Pill */}
              <AnimatePresence>
                {selectedMotionPreset && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={SPRING_SOFT}
                    className="flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[10px] text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-300"
                  >
                    <span>{selectedMotionPreset.name}</span>
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      type="button"
                      onClick={() => setSelectedMotionPreset(null)}
                      className="text-cyan-400 hover:text-white ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Looping Toggle (Video modes) */}
              {isVideo && (
                <motion.button
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_PRESS}
                  type="button"
                  onClick={() => setLoopVideo(!loopVideo)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-mono transition-all border",
                    loopVideo
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "border-transparent bg-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
                  )}
                  title="Toggle Seamless Video Looping"
                >
                  <InfinityIcon className={cn("h-3.5 w-3.5", loopVideo && "animate-pulse")} />
                  {loopVideo && <span className="text-[10px] font-semibold">Loop</span>}
                </motion.button>
              )}

              {/* Magic Enhance Prompt Button */}
              <motion.button
                whileHover={{ scale: 1.08, y: -1 }}
                whileTap={{ scale: 0.94 }}
                transition={SPRING_PRESS}
                type="button"
                disabled={isMagicEnhancing}
                onClick={handleMagicEnhancePrompt}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300",
                  isMagicEnhancing && "text-amber-400 animate-spin"
                )}
                title="AI Magic Prompt Enhancer"
              >
                {isMagicEnhancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </motion.button>
            </div>

            {/* Right Action: Generation switch, format badge & generate */}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <div className="flex h-8 items-center rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 dark:border-white/10 dark:bg-white/5">
                {([
                  { id: "images" as const, label: "Image", active: isImage, title: "Switch to image generation" },
                  { id: "videos" as const, label: "Video", active: isVideo, title: "Switch to video generation" },
                  { id: "objects" as const, label: "Object", active: is3D, title: "Switch to object generation" },
                  { id: "sound" as const, label: "Sound", active: isSound, title: "Switch to prompt-to-sound" },
                ]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (!option.active) setTool(mapToolToGenerationFamily(tool, option.id));
                    }}
                    className={cn(
                      "rounded-lg px-2 py-1 font-mono text-[10px] font-semibold uppercase transition-colors",
                      option.active
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-cyan-400 dark:text-zinc-950"
                        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                    )}
                    title={option.title}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {setNodeGraph && (
                <button
                  type="button"
                  onClick={() => setNodeGraph(!nodeGraph)}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-xl border px-2 font-mono text-[10px] font-semibold uppercase transition-colors",
                    nodeGraph
                      ? "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200"
                      : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                  title={
                    isVideo
                      ? "Toggle video nodes"
                      : is3D
                        ? "Toggle object nodes"
                        : isSound
                          ? "Toggle sound nodes"
                          : "Toggle image nodes"
                  }
                >
                  <GitFork className="h-3 w-3" />
                  <span>Nodes</span>
                </button>
              )}
              <motion.button
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_PRESS}
                type="button"
                onClick={() => {
                  setShowSettingsPopover((prev) => !prev);
                  setShowDurationPopover(false);
                  setShowMotionPopover(false);
                }}
                className={cn(
                  "font-mono text-[11px] uppercase font-semibold flex items-center gap-1.5 h-8 px-2.5 rounded-xl border transition-all",
                  showSettingsPopover
                    ? "border-zinc-900 bg-zinc-900 font-bold text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-black"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                )}
                title="Studio Settings"
              >
                <span>{formatBadgeMeta}</span>
                <motion.span
                  animate={{ rotate: showSettingsPopover ? 180 : 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </motion.span>
              </motion.button>

              <motion.button
                whileHover={
                  !isGenerating && canGenerate
                    ? { scale: 1.08, y: -1, transition: SPRING_SOFT }
                    : undefined
                }
                whileTap={!isGenerating && canGenerate ? { scale: 0.92 } : undefined}
                transition={SPRING_PRESS}
                type="button"
                onClick={onGenerate}
                disabled={isGenerating || !canGenerate}
                className={cn(
                  "relative rounded-full h-8 w-8 flex items-center justify-center transition-all duration-200 shadow-lg overflow-hidden",
                  isGenerating || !canGenerate
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-400 opacity-50 dark:bg-zinc-800 dark:text-zinc-600"
                    : "cursor-pointer bg-zinc-900 font-bold text-white hover:bg-zinc-800 dark:bg-gradient-to-b dark:from-white dark:to-zinc-200 dark:text-black"
                )}
                title={
                  isGenerating
                    ? "Generating..."
                    : isSound
                      ? "Generate sound (Enter)"
                      : isNodes
                        ? "Run node graph (Enter)"
                        : is3D && has3DObject
                          ? "Refine 3D object (Enter)"
                          : "Generate (Enter)"
                }
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isGenerating ? (
                    <motion.span key="loading" {...ICON_SWAP}>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                    </motion.span>
                  ) : (
                    <motion.span key="arrow" {...ICON_SWAP}>
                      <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
