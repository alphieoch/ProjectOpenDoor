"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import {
  Image as ImageIcon,
  Plus,
  Video,
  Infinity as InfinityIcon,
  ArrowUp,
  Loader2,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import { Button, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import { LumaMotionPopover, type MotionPreset } from "./LumaMotionPopover";
import { LumaSettingsPopover, type LumaSettings } from "./LumaSettingsPopover";
import type { StudioModelOption, StudioTool } from "@/lib/studio-constants";

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
}: LumaPromptBarProps) {
  const [showMotionPopover, setShowMotionPopover] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endFrameInputRef = useRef<HTMLInputElement | null>(null);

  const isVideo = tool === "txt2vid" || tool === "img2vid" || tool === "v2v";

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && !isGenerating) {
        onGenerate();
      }
    }
  };

  const handleMagicEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    try {
      const res = await fetch("/api/studio/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: isVideo ? "video" : "image" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.enhancedPrompt) {
          setPrompt(data.enhancedPrompt);
        }
      }
    } catch {
      // Keep existing prompt
    }
  };

  // Convert current state into LumaSettings representation
  const currentSettings: LumaSettings = {
    mode: tool === "img2vid" ? "keyframe" : tool === "img2img" ? "reference" : tool === "v2v" ? "modify" : "describe",
    mediaType: isVideo ? "videos" : "images",
    aspectRatio,
    variations: 1,
    durationSeconds: 5,
    resolution: "720p",
    modelId: selectedModel,
  };

  const handleUpdateSettings = (next: Partial<LumaSettings>) => {
    if (next.aspectRatio) setAspectRatio(next.aspectRatio);
    if (next.modelId) setSelectedModel(next.modelId);
    if (next.mediaType) {
      if (next.mediaType === "images" && isVideo) {
        setTool("txt2img");
      } else if (next.mediaType === "videos" && !isVideo) {
        setTool("txt2vid");
      }
    }
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="relative w-full max-w-3xl pointer-events-auto">
        {/* Popovers anchored above prompt bar */}
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

        <LumaSettingsPopover
          isOpen={showSettingsPopover}
          onClose={() => setShowSettingsPopover(false)}
          settings={currentSettings}
          onUpdateSettings={handleUpdateSettings}
          availableModels={availableModels}
          onToolSelect={(t) => setTool(t)}
        />

        {/* Outer Floating Dock Container */}
        <div
          className="relative rounded-3xl p-3 sm:p-4 shadow-2xl transition-all duration-200"
          style={{
            background: "rgba(12, 13, 20, 0.92)",
            backdropFilter: "blur(40px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow:
              "inset 0 1px 0 0 rgba(255, 255, 255, 0.15), 0 24px 64px -12px rgba(0, 0, 0, 0.9)",
          }}
        >
          {/* Keyframe Slots (Start Frame & End Frame Dock) */}
          {(Boolean(referenceImage) || isVideo || (tool as string) === "img2img" || (tool as string) === "img2vid") && (
            <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
              {/* Start Frame Slot */}
              {referenceImage ? (
                <div className="relative group rounded-xl overflow-hidden border border-white/20 h-14 w-20 bg-black/60 shrink-0">
                  <img
                    src={referenceImage}
                    alt="Start Frame"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setReferenceImage(null)}
                      className="rounded-full bg-red-600/80 p-1 text-white hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 py-0.2 text-[8px] font-mono text-zinc-300">
                    START · 5s
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 hover:border-indigo-500/60 h-14 w-20 bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white shrink-0 group"
                  title="Upload Start Keyframe"
                >
                  <Plus className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-mono font-bold tracking-wider mt-0.5">START</span>
                </button>
              )}

              {/* End Frame Slot (for interpolation) */}
              {isVideo && (
                endFrameImage ? (
                  <div className="relative group rounded-xl overflow-hidden border border-purple-500/40 h-14 w-20 bg-black/60 shrink-0">
                    <img
                      src={endFrameImage}
                      alt="End Frame"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => setEndFrameImage && setEndFrameImage(null)}
                        className="rounded-full bg-red-600/80 p-1 text-white hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="absolute bottom-1 left-1 rounded bg-purple-950/90 px-1 py-0.2 text-[8px] font-mono text-purple-300">
                      END
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => endFrameInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 hover:border-purple-500/60 h-14 w-20 bg-white/[0.02] hover:bg-purple-950/20 transition-colors text-zinc-500 hover:text-purple-300 shrink-0 group"
                    title="Upload End Keyframe for smooth interpolation"
                  >
                    <Plus className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-mono tracking-wider mt-0.5">+ END FRAME</span>
                  </button>
                )
              )}

              {/* Status Chips with HeroUI Chip */}
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {selectedMotionPreset && (
                  <Chip
                    size="sm"
                    variant="primary"
                    color="accent"
                    className="text-[10px] font-mono"
                  >
                    {selectedMotionPreset.name}
                  </Chip>
                )}

                {loopVideo && (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="success"
                    className="text-[10px] font-mono flex items-center gap-1"
                  >
                    <InfinityIcon className="h-3 w-3 inline mr-1" />
                    Looping
                  </Chip>
                )}

                <Chip size="sm" variant="soft" className="text-[10px] font-mono text-zinc-400">
                  {aspectRatio}
                </Chip>
              </div>
            </div>
          )}

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
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

          {/* Multiline Prompt Input Area */}
          <div className="relative">
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isVideo
                  ? "Describe camera or action in the scene (e.g. A majestic snow leopard leaping across alpine ridges in slow motion)..."
                  : "Describe what you want to see (e.g. Cyberpunk street portrait with neon reflections in 8k)..."
              }
              className="w-full resize-none bg-transparent px-1 py-1 text-sm text-white placeholder-zinc-500 focus:outline-none scrollbar-none font-sans leading-relaxed"
            />
          </div>

          {/* Bottom Controls Row (Luma Toolbar with HeroUI Buttons) */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            {/* Left Toolbar Icons */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => fileInputRef.current?.click()}
                className="rounded-lg text-zinc-400 hover:text-white h-8 w-8 min-w-8 p-0"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>

              {isVideo && (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => endFrameInputRef.current?.click()}
                  className="rounded-lg text-zinc-400 hover:text-white h-8 w-8 min-w-8 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}

              <Button
                size="sm"
                variant={showMotionPopover || selectedMotionPreset ? "primary" : "ghost"}
                onPress={() => setShowMotionPopover((prev) => !prev)}
                className={cn(
                  "rounded-lg h-8 w-8 min-w-8 p-0",
                  showMotionPopover || selectedMotionPreset ? "bg-indigo-600 text-white" : "text-zinc-400"
                )}
              >
                <Video className="h-4 w-4" />
              </Button>

              {isVideo && (
                <Button
                  size="sm"
                  variant={loopVideo ? "primary" : "ghost"}
                  onPress={() => setLoopVideo(!loopVideo)}
                  className={cn(
                    "rounded-lg h-8 w-8 min-w-8 p-0",
                    loopVideo ? "bg-emerald-600 text-white" : "text-zinc-400"
                  )}
                >
                  <InfinityIcon className="h-4 w-4" />
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onPress={handleMagicEnhancePrompt}
                className="rounded-lg text-zinc-400 hover:text-amber-300 h-8 w-8 min-w-8 p-0"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>

            {/* Right Action & Mode Chips */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showSettingsPopover ? "primary" : "outline"}
                onPress={() => setShowSettingsPopover((prev) => !prev)}
                className={cn(
                  "font-mono text-[11px] uppercase font-semibold flex items-center gap-1.5 h-8 px-2.5",
                  showSettingsPopover ? "bg-indigo-600 text-white" : "border-white/10 text-zinc-300"
                )}
              >
                <span>{tool === "img2vid" ? "KEYFRAME" : isVideo ? "VIDEO" : "IMAGE"} · {aspectRatio}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </Button>

              <Button
                size="sm"
                variant="primary"
                onPress={onGenerate}
                className={cn(
                  "rounded-full h-9 w-9 min-w-9 p-0 transition-all duration-200 shadow-lg flex items-center justify-center",
                  isGenerating || !canGenerate
                    ? "bg-zinc-800 text-zinc-500 opacity-60 pointer-events-none"
                    : "bg-white text-black hover:bg-zinc-200 hover:scale-105 active:scale-95 shadow-white/20 font-bold"
                )}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                ) : (
                  <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
