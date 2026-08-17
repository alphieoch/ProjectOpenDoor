"use client";

import {
  Film,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Sliders,
} from "lucide-react";
import { Button, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { StudioModelOption, StudioTool } from "@/lib/studio-constants";

export interface LumaSettings {
  mode: "describe" | "keyframe" | "reference" | "modify";
  mediaType: "images" | "videos";
  aspectRatio: string;
  variations: 1 | 2;
  durationSeconds: 5 | 9;
  resolution: "720p" | "1080p" | "4k";
  modelId: string;
}

interface LumaSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LumaSettings;
  onUpdateSettings: (next: Partial<LumaSettings>) => void;
  availableModels: StudioModelOption[];
  onToolSelect?: (tool: StudioTool) => void;
}

const ASPECTS = [
  { id: "9:16", label: "9:16", hint: "Vertical / Shorts" },
  { id: "3:4", label: "3:4", hint: "Portrait" },
  { id: "1:1", label: "1:1", hint: "Square" },
  { id: "4:3", label: "4:3", hint: "Classic TV" },
  { id: "16:9", label: "16:9", hint: "Cinematic Landscape" },
  { id: "21:9", label: "21:9", hint: "Ultrawide" },
];

export function LumaSettingsPopover({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  availableModels,
  onToolSelect,
}: LumaSettingsPopoverProps) {
  if (!isOpen) return null;

  const modeTabs = [
    { id: "describe", label: "Describe", icon: Sparkles, tool: "txt2vid" as StudioTool },
    { id: "keyframe", label: "Keyframe", icon: Layers, tool: "img2vid" as StudioTool },
    { id: "reference", label: "Reference", icon: ImageIcon, tool: "img2img" as StudioTool },
    { id: "modify", label: "Modify", icon: Sliders, tool: "v2v" as StudioTool },
  ] as const;

  return (
    <div
      className="absolute bottom-full right-0 mb-3 z-50 w-full max-w-md rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl transition-all duration-200"
      style={{
        background: "rgba(12, 13, 20, 0.95)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        boxShadow: "0 24px 64px -12px rgba(0, 0, 0, 0.95)",
      }}
    >
      {/* 1. Mode Tabs Switcher */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <div className="flex items-center gap-1 w-full">
          {modeTabs.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={settings.mode === tab.id ? "primary" : "ghost"}
              onPress={() => {
                onUpdateSettings({ mode: tab.id });
                if (onToolSelect) onToolSelect(tab.tool);
              }}
              className={cn(
                "flex-1 text-xs font-semibold tracking-wide",
                settings.mode === tab.id ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white"
              )}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 2. Media Type Switcher (Images vs Videos) */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-zinc-400">Media Generation</span>
        <div className="flex rounded-xl bg-white/5 p-1 border border-white/10">
          <Button
            size="sm"
            variant={settings.mediaType === "images" ? "primary" : "ghost"}
            onPress={() => onUpdateSettings({ mediaType: "images" })}
            className={cn(
              "text-xs flex items-center gap-1 h-7",
              settings.mediaType === "images" ? "bg-white/20 text-white font-bold" : "text-zinc-400"
            )}
          >
            <ImageIcon className="h-3 w-3" />
            <span>Images</span>
          </Button>
          <Button
            size="sm"
            variant={settings.mediaType === "videos" ? "primary" : "ghost"}
            onPress={() => onUpdateSettings({ mediaType: "videos" })}
            className={cn(
              "text-xs flex items-center gap-1 h-7",
              settings.mediaType === "videos" ? "bg-indigo-600 text-white font-bold" : "text-zinc-400"
            )}
          >
            <Film className="h-3 w-3" />
            <span>Videos</span>
          </Button>
        </div>
      </div>

      {/* 3. Aspect Ratio Selection Grid */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-zinc-400">Aspect Ratio</span>
          <span className="font-mono text-indigo-400 font-bold">{settings.aspectRatio}</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {ASPECTS.map((asp) => (
            <Chip
              key={asp.id}
              size="sm"
              variant={settings.aspectRatio === asp.id ? "primary" : "soft"}
              color={settings.aspectRatio === asp.id ? "accent" : "default"}
              className="cursor-pointer font-mono text-[11px] w-full text-center justify-center"
              onClick={() => onUpdateSettings({ aspectRatio: asp.id })}
            >
              {asp.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* 4. Controls: Variations, Duration, Resolution */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
        {/* Variations */}
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 block">Variations</span>
          <div className="flex gap-1">
            {[1, 2].map((v) => (
              <Chip
                key={v}
                size="sm"
                variant={settings.variations === v ? "primary" : "soft"}
                color={settings.variations === v ? "accent" : "default"}
                className="cursor-pointer font-mono text-xs flex-1 text-center justify-center"
                onClick={() => onUpdateSettings({ variations: v as 1 | 2 })}
              >
                ● {v}v
              </Chip>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 block">Duration</span>
          <div className="flex gap-1">
            {[5, 9].map((d) => (
              <Chip
                key={d}
                size="sm"
                variant={settings.durationSeconds === d ? "primary" : "soft"}
                color={settings.durationSeconds === d ? "accent" : "default"}
                className="cursor-pointer font-mono text-xs flex-1 text-center justify-center"
                onClick={() => onUpdateSettings({ durationSeconds: d as 5 | 9 })}
              >
                {d}s
              </Chip>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 block">Resolution</span>
          <div className="flex gap-1">
            {(["720p", "1080p", "4k"] as const).map((r) => (
              <Chip
                key={r}
                size="sm"
                variant={settings.resolution === r ? "primary" : "soft"}
                color={settings.resolution === r ? "accent" : "default"}
                className="cursor-pointer font-mono text-[10px] uppercase flex-1 text-center justify-center"
                onClick={() => onUpdateSettings({ resolution: r })}
              >
                {r}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Model Selector */}
      <div className="space-y-1 mt-4 pt-3 border-t border-white/10">
        <span className="text-[10px] font-mono text-zinc-400 block">Model Engine</span>
        <select
          value={settings.modelId}
          onChange={(e) => onUpdateSettings({ modelId: e.target.value })}
          className="w-full rounded-lg bg-white/5 border border-white/10 py-1.5 px-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
        >
          {availableModels.length > 0 ? (
            availableModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-zinc-900">
                {m.name}
              </option>
            ))
          ) : (
            <>
              <option value="opendoor-flux-canvas" className="bg-zinc-900">Flux Canvas v2 (Realtime)</option>
              <option value="google-veo-2" className="bg-zinc-900">Google Veo 2 (1080p Video)</option>
              <option value="luma-dream-machine" className="bg-zinc-900">Luma Dream Machine 1.5</option>
              <option value="google-imagen-3" className="bg-zinc-900">Google Imagen 3 (Ultra 8K)</option>
              <option value="wan-2-1-video" className="bg-zinc-900">Wan 2.1 Video</option>
            </>
          )}
        </select>
      </div>

      <div className="mt-4 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Keyframe matches attached frame ratio</span>
        <Button
          size="sm"
          variant="ghost"
          onPress={onClose}
          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
