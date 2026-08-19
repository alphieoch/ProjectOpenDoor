"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  Image as ImageIcon,
  Sparkles,
  Scissors,
  GitFork,
  Video,
  Box,
  Volume2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  getModelsForTool,
  getDefaultModelForTool,
  getStudioModelTier,
  getStudioProviderLabel,
  STUDIO_MODEL_TIER_OPTIONS,
  STUDIO_RESOLUTION_OPTIONS,
  STUDIO_VIDEO_DURATION_MAX,
  STUDIO_VIDEO_DURATION_MIN,
  STUDIO_VIDEO_DURATIONS,
  clampStudioVideoDuration,
  previewStudioVideoDuration,
  type StudioModelOption,
  type StudioModelTier,
  type StudioResolution,
  type StudioTool,
} from "@/lib/studio-constants";
import { CompanyLogo } from "./StudioModelPicker";

const EASE = [0.2, 0, 0, 1] as const;
const SPRING_KNOB = { type: "spring" as const, stiffness: 520, damping: 34 };
const SPRING_PRESS = { type: "spring" as const, stiffness: 500, damping: 28 };

export interface LumaSettings {
  mode: StudioTool;
  mediaType: "images" | "videos";
  aspectRatio: string;
  variations: 1 | 2;
  durationSeconds: number;
  resolution: StudioResolution;
  modelId: string;
}

interface LumaSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LumaSettings;
  onUpdateSettings: (next: Partial<LumaSettings>) => void;
  availableModels: StudioModelOption[];
  onToolSelect?: (tool: StudioTool) => void;
  nodeGraph?: boolean;
  onToggleNodeGraph?: (next: boolean) => void;
}

export const SETTINGS_ASPECTS = [
  { id: "16:9", label: "16:9", hint: "YouTube / TV", group: "landscape" as const },
  { id: "21:9", label: "21:9", hint: "Cinema", group: "landscape" as const },
  { id: "4:3", label: "4:3", hint: "Classic", group: "landscape" as const },
  { id: "3:2", label: "3:2", hint: "Photo", group: "landscape" as const },
  { id: "9:16", label: "9:16", hint: "Shorts", group: "portrait" as const },
  { id: "3:4", label: "3:4", hint: "Portrait", group: "portrait" as const },
  { id: "1:1", label: "1:1", hint: "Feed", group: "square" as const },
];

const ASPECT_GROUPS = [
  { id: "landscape" as const, label: "Landscape", hint: "Horizontal screens" },
  { id: "portrait" as const, label: "Portrait", hint: "Phone / Stories" },
  { id: "square" as const, label: "Square", hint: "1:1 feed" },
];

export type GenerationFamily = "videos" | "images" | "objects" | "sound";
export type PrimaryGenerationFamily = GenerationFamily;

export const STUDIO_TOOL_MODES: {
  id: StudioTool;
  label: string;
  icon: React.ElementType;
  mediaType: "images" | "videos";
  family: GenerationFamily;
  description: string;
  categoryLabel: string;
}[] = [
  { id: "txt2vid", label: "Text to Video", icon: Film, mediaType: "videos", family: "videos", description: "Generate cinematic video from text", categoryLabel: "Video Generation" },
  { id: "img2vid", label: "Image to Video", icon: Video, mediaType: "videos", family: "videos", description: "Animate image or keyframes", categoryLabel: "Video Generation" },
  { id: "v2v", label: "Timeline Edit", icon: Scissors, mediaType: "videos", family: "videos", description: "Trim & video-to-video timeline edit", categoryLabel: "Video Generation" },
  { id: "txt2img", label: "Text to Image", icon: Sparkles, mediaType: "images", family: "images", description: "Create photorealistic visuals", categoryLabel: "Image Generation" },
  { id: "img2img", label: "Image Remix", icon: ImageIcon, mediaType: "images", family: "images", description: "Style transfer & composition remix", categoryLabel: "Image Generation" },
  { id: "txt2obj", label: "Text to 3D", icon: Box, mediaType: "images", family: "objects", description: "Synthesize 3D product & interactive mesh", categoryLabel: "Object Generation" },
  { id: "sound_fx", label: "Sound FX", icon: Volume2, mediaType: "images", family: "sound", description: "Synthesize Foley audio, soundscapes & voice", categoryLabel: "Audio & Sound FX" },
];

export function getGenerationFamily(tool: StudioTool): GenerationFamily {
  return STUDIO_TOOL_MODES.find((item) => item.id === tool)?.family ?? "images";
}

export function mapToolToGenerationFamily(tool: StudioTool, family: GenerationFamily): StudioTool {
  if (family === "objects") return "txt2obj";
  if (family === "sound") return "sound_fx";
  if (family === "videos") {
    if (tool === "txt2img" || tool === "txt2obj" || tool === "sound_fx" || tool === "nodes") return "txt2vid";
    if (tool === "img2img" || tool === "v2v") return "img2vid";
    if (tool === "txt2vid" || tool === "img2vid") return tool;
    return "txt2vid";
  }
  if (tool === "txt2vid" || tool === "txt2obj" || tool === "sound_fx" || tool === "nodes") return "txt2img";
  if (tool === "img2vid" || tool === "v2v") return "img2img";
  if (tool === "txt2img" || tool === "img2img") return tool;
  return "txt2img";
}

function aspectPreviewStyle(id: string) {
  const [w, h] = id.split(":").map(Number);
  const max = 22;
  if (!w || !h) return { width: max, height: max };
  if (w >= h) return { width: max, height: Math.max(8, Math.round((max * h) / w)) };
  return { width: Math.max(8, Math.round((max * w) / h)), height: max };
}

function AspectRatioPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {ASPECT_GROUPS.map((group) => {
        const options = SETTINGS_ASPECTS.filter((item) => item.group === group.id);
        return (
          <div key={group.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {group.label}
              </span>
              <span className="font-mono text-[10px] text-zinc-400">{group.hint}</span>
            </div>
            <div className={cn("grid gap-1.5", group.id === "square" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2")}>
              {options.map((option) => {
                const active = value === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onChange(option.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-zinc-950"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded-[3px] border",
                        active ? "border-white/70 bg-white/20 dark:border-zinc-950/40 dark:bg-zinc-950/20" : "border-zinc-400/70 bg-zinc-200/80 dark:border-zinc-500 dark:bg-zinc-700",
                      )}
                      style={aspectPreviewStyle(option.id)}
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] font-semibold">{option.label}</span>
                      <span className={cn("block text-[10px]", active ? "text-white/70 dark:text-zinc-800" : "text-zinc-400")}>
                        {option.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VideoDurationSlider({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (seconds: number) => void;
  compact?: boolean;
}) {
  const committed = clampStudioVideoDuration(value);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(committed);

  useEffect(() => {
    if (!dragging) setPreview(committed);
  }, [committed, dragging]);

  const display = dragging ? preview : committed;
  const percent = ((display - STUDIO_VIDEO_DURATION_MIN) / (STUDIO_VIDEO_DURATION_MAX - STUDIO_VIDEO_DURATION_MIN)) * 100;

  const valueFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return committed;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return previewStudioVideoDuration(STUDIO_VIDEO_DURATION_MIN + t * (STUDIO_VIDEO_DURATION_MAX - STUDIO_VIDEO_DURATION_MIN));
  };

  const commit = (raw: number) => {
    const next = clampStudioVideoDuration(raw);
    setPreview(next);
    onChange(next);
    setDragging(false);
    draggingRef.current = false;
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      setPreview(valueFromClientX(event.clientX));
    };
    const onUp = (event: PointerEvent) => {
      commit(valueFromClientX(event.clientX));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  return (
    <div className={cn("space-y-2", compact && "min-w-[160px] flex-1")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="block font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Duration
        </span>
        <span className="font-mono text-[12px] font-semibold tabular-nums text-zinc-900 dark:text-cyan-400">
          {display.toFixed(1)}s
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Video duration"
        aria-valuemin={STUDIO_VIDEO_DURATION_MIN}
        aria-valuemax={STUDIO_VIDEO_DURATION_MAX}
        aria-valuenow={committed}
        aria-valuetext={`${committed} seconds`}
        onPointerDown={(event) => {
          event.preventDefault();
          draggingRef.current = true;
          setDragging(true);
          setPreview(valueFromClientX(event.clientX));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            commit(committed - 2);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            commit(committed + 2);
          }
        }}
        className="relative h-7 cursor-pointer touch-none select-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <motion.div
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-zinc-900 dark:bg-cyan-400"
          animate={{ width: `${percent}%` }}
          transition={dragging ? { duration: 0 } : SPRING_KNOB}
        />
        {STUDIO_VIDEO_DURATIONS.map((stop) => {
          const stopPercent = ((stop - STUDIO_VIDEO_DURATION_MIN) / (STUDIO_VIDEO_DURATION_MAX - STUDIO_VIDEO_DURATION_MIN)) * 100;
          return (
            <span
              key={stop}
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-400/80 dark:bg-zinc-500"
              style={{ left: `${stopPercent}%` }}
            />
          );
        })}
        <motion.span
          className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow-sm dark:border-zinc-950 dark:bg-cyan-400"
          animate={{ left: `${percent}%` }}
          transition={dragging ? { duration: 0 } : SPRING_KNOB}
        />
      </div>
      <div className="flex justify-between">
        {STUDIO_VIDEO_DURATIONS.map((stop) => (
          <button
            key={stop}
            type="button"
            onClick={() => commit(stop)}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors",
              committed === stop
                ? "bg-zinc-900 text-white dark:bg-cyan-400 dark:text-zinc-950"
                : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
            )}
          >
            {stop}s
          </button>
        ))}
      </div>
    </div>
  );
}

function SegmentedToggle<T extends string | number>({
  value,
  options,
  onChange,
  layoutId,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  layoutId: string;
}) {
  return (
    <div className="relative flex rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "relative z-10 flex-1 rounded-lg px-2 py-1.5 text-center font-mono text-[11px] font-semibold transition-colors",
              active ? "text-zinc-900 dark:text-zinc-950" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-cyan-400"
                transition={SPRING_KNOB}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-zinc-950"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
      )}
    >
      {children}
    </button>
  );
}

export function LumaSettingsPopover({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  availableModels,
  onToolSelect,
  nodeGraph = false,
  onToggleNodeGraph,
}: LumaSettingsPopoverProps) {
  const [tierFilter, setTierFilter] = useState<StudioModelTier | "all">("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const contextModels = useMemo(
    () => getModelsForTool(settings.mode, availableModels),
    [availableModels, settings.mode],
  );
  const catalog = contextModels.length > 0 ? contextModels : availableModels;
  const currentModeDef = STUDIO_TOOL_MODES.find((m) => m.id === settings.mode) || STUDIO_TOOL_MODES[0];
  const generationFamily = getGenerationFamily(settings.mode);

  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    return catalog.flatMap((model) => {
      if (seen.has(model.provider)) return [];
      seen.add(model.provider);
      return [{ id: model.provider, label: getStudioProviderLabel(model.provider) }];
    });
  }, [catalog]);

  const filteredModels = useMemo(() => {
    return catalog.filter((model) => {
      if (tierFilter !== "all" && getStudioModelTier(model) !== tierFilter) return false;
      if (providerFilter !== "all" && model.provider !== providerFilter) return false;
      return true;
    });
  }, [catalog, providerFilter, tierFilter]);

  useEffect(() => {
    setTierFilter("all");
    setProviderFilter("all");
  }, [settings.mode]);

  if (!isOpen) return null;
  const isVisualFamily = generationFamily === "images" || generationFamily === "videos" || generationFamily === "objects";

  const selectTool = (item: (typeof STUDIO_TOOL_MODES)[number]) => {
    if (settings.mode === item.id) return;
    const defaultModel = getDefaultModelForTool(item.id);
    onUpdateSettings({
      mode: item.id,
      mediaType: item.mediaType,
      modelId: defaultModel,
    });
    onToolSelect?.(item.id);
  };

  const switchGenerationFamily = (family: GenerationFamily) => {
    if (generationFamily === family) return;
    const nextMode = mapToolToGenerationFamily(settings.mode, family);
    const nextDef = STUDIO_TOOL_MODES.find((item) => item.id === nextMode);
    if (nextDef) selectTool(nextDef);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="absolute bottom-full right-0 z-50 mb-3 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Generate
          </span>
          <span className="font-mono text-[10px] font-medium text-zinc-700 dark:text-cyan-400">
            {nodeGraph
              ? `${currentModeDef.categoryLabel.replace(" Generation", "").replace("Audio & Sound FX", "Sound")} nodes`
              : currentModeDef.categoryLabel}
          </span>
        </div>
        <div className="relative flex rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
          {([
            { id: "images" as const, label: "Image" },
            { id: "videos" as const, label: "Video" },
            { id: "objects" as const, label: "Object" },
            { id: "sound" as const, label: "Sound" },
          ]).map((option) => {
            const active = generationFamily === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => switchGenerationFamily(option.id)}
                className={cn(
                  "relative z-10 flex-1 rounded-lg px-2 py-1.5 text-center font-mono text-[11px] font-semibold transition-colors",
                  active ? "text-zinc-900 dark:text-zinc-950" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="studio-generation-family"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-cyan-400"
                    transition={SPRING_KNOB}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>
        {onToggleNodeGraph && (
          <button
            type="button"
            onClick={() => onToggleNodeGraph(!nodeGraph)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors",
              nodeGraph
                ? "border-cyan-200 bg-cyan-50 dark:border-cyan-500/40 dark:bg-cyan-500/10"
                : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800",
            )}
          >
            <span className="flex items-center gap-2">
              <GitFork className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
                {generationFamily === "videos"
                  ? "Video nodes"
                  : generationFamily === "objects"
                    ? "Object nodes"
                    : generationFamily === "sound"
                      ? "Sound nodes"
                      : "Image nodes"}
              </span>
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {nodeGraph ? "On" : "Stage"}
            </span>
          </button>
        )}
      </div>

      {generationFamily === "videos" && (
        <p className="mb-3 font-mono text-[10px] leading-relaxed text-zinc-500">
          Write the prompt in the bar below. Trim or extend the clip on the timeline under the preview.
        </p>
      )}

      {generationFamily === "sound" && (
        <p className="mb-3 font-mono text-[10px] leading-relaxed text-zinc-500">
          Prompt a sound in the bar below — Foley, ambience, impacts, or voice beds.
        </p>
      )}

      {nodeGraph && (
        <p className="mb-3 font-mono text-[10px] leading-relaxed text-zinc-500">
          Node graph follows Image, Video, Object, or Sound. Prompt the bar to write the graph and run it.
        </p>
      )}

      {isVisualFamily && generationFamily !== "objects" && (
        <div className="mt-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Screen type</span>
            <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-cyan-400">
              {SETTINGS_ASPECTS.find((item) => item.id === settings.aspectRatio)?.hint || settings.aspectRatio}
              <span className="ml-1.5 text-zinc-400">{settings.aspectRatio}</span>
            </span>
          </div>
          <AspectRatioPicker
            value={settings.aspectRatio}
            onChange={(aspectRatio) => onUpdateSettings({ aspectRatio })}
          />
        </div>
      )}

      {generationFamily === "videos" && (
        <div className="mt-3.5 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-500">Variations</span>
            <SegmentedToggle
              layoutId="studio-variations-pill"
              value={settings.variations}
              onChange={(variations) => onUpdateSettings({ variations })}
              options={[
                { id: 1 as const, label: "1v" },
                { id: 2 as const, label: "2v" },
              ]}
            />
          </div>
          <VideoDurationSlider
            value={settings.durationSeconds}
            onChange={(durationSeconds) => onUpdateSettings({ durationSeconds })}
          />
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-500">Resolution</span>
            <SegmentedToggle
              layoutId="studio-resolution-pill"
              value={settings.resolution}
              onChange={(resolution) => onUpdateSettings({ resolution })}
              options={STUDIO_RESOLUTION_OPTIONS}
            />
          </div>
        </div>
      )}

      {generationFamily === "images" && (
        <div className="mt-3.5 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-500">Variations</span>
            <SegmentedToggle
              layoutId="studio-image-variations-pill"
              value={settings.variations}
              onChange={(variations) => onUpdateSettings({ variations })}
              options={[
                { id: 1 as const, label: "1v" },
                { id: 2 as const, label: "2v" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-500">Resolution</span>
            <SegmentedToggle
              layoutId="studio-image-resolution-pill"
              value={settings.resolution}
              onChange={(resolution) => onUpdateSettings({ resolution })}
              options={STUDIO_RESOLUTION_OPTIONS}
            />
          </div>
        </div>
      )}

      {generationFamily === "objects" && (
        <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Stage</span>
            <p className="mt-1 text-xs font-semibold text-zinc-800 dark:text-zinc-100">3D product mesh</p>
            <p className="font-mono text-[10px] text-zinc-500">1:1 metric · watertight</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Output</span>
            <p className="mt-1 text-xs font-semibold text-zinc-800 dark:text-zinc-100">GLB + OBJ</p>
            <p className="font-mono text-[10px] text-zinc-500">PBR maps included</p>
          </div>
        </div>
      )}

      {generationFamily === "sound" && (
        <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-500">Duration</span>
            <SegmentedToggle
              layoutId="studio-sound-duration-pill"
              value={settings.durationSeconds}
              onChange={(durationSeconds) => onUpdateSettings({ durationSeconds })}
              options={[
                { id: 5 as const, label: "5s" },
                { id: 9 as const, label: "9s" },
              ]}
            />
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Output</span>
            <p className="mt-1 text-xs font-semibold text-zinc-800 dark:text-zinc-100">48kHz stereo</p>
            <p className="font-mono text-[10px] text-zinc-500">MP3 · −14 LUFS</p>
          </div>
        </div>
      )}

      <div className="mt-3.5 space-y-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-zinc-500">
            Model ({filteredModels.length}{filteredModels.length !== catalog.length ? ` of ${catalog.length}` : ""})
          </span>
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {currentModeDef.categoryLabel}
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {STUDIO_MODEL_TIER_OPTIONS.map((option) => (
              <FilterChip
                key={option.id}
                active={tierFilter === option.id}
                onClick={() => setTierFilter(option.id)}
              >
                {option.label}
              </FilterChip>
            ))}
          </div>
          {providerOptions.length > 1 && (
            <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 [scrollbar-width:thin]">
              <FilterChip active={providerFilter === "all"} onClick={() => setProviderFilter("all")}>
                All providers
              </FilterChip>
              {providerOptions.map((option) => (
                <FilterChip
                  key={option.id}
                  active={providerFilter === option.id}
                  onClick={() => setProviderFilter(option.id)}
                >
                  {option.label}
                </FilterChip>
              ))}
            </div>
          )}
        </div>
        <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-1 [scrollbar-width:thin]">
          {filteredModels.length === 0 ? (
            <div className="flex h-[92px] w-full items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 text-center font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              No models match these filters.
            </div>
          ) : filteredModels.map((model) => {
            const active = settings.modelId === model.id;
            const tier = getStudioModelTier(model);
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onUpdateSettings({ modelId: model.id })}
                className={cn(
                  "w-[220px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      active
                        ? "border-white/20 bg-white/10 dark:border-zinc-950/20 dark:bg-zinc-950/10"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800",
                    )}
                  >
                    <CompanyLogo provider={model.provider} className="h-3.5 w-3.5" />
                  </span>
                  <span className={cn("min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-wide", active ? "text-white/70 dark:text-zinc-800" : "text-zinc-400")}>
                    {model.companyName}
                  </span>
                  <span className={cn("ml-auto shrink-0 font-mono text-[9px] uppercase", active ? "text-white/50 dark:text-zinc-700" : "text-zinc-400")}>
                    {tier}
                  </span>
                </span>
                <span className="mt-1.5 block truncate text-sm font-semibold leading-tight">{model.name}</span>
                <span className={cn("mt-1 block line-clamp-2 text-[11px] leading-relaxed", active ? "text-white/70 dark:text-zinc-800" : "text-zinc-500")}>
                  {model.tagline}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="font-mono text-[10px] text-zinc-500">
          Auto-tuned for {currentModeDef.label}
        </span>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_PRESS}
          type="button"
          onClick={onClose}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
        >
          Done
        </motion.button>
      </div>
    </motion.div>
  );
}
