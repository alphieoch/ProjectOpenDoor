"use client";

import { useRef, type KeyboardEvent } from "react";
import { StudioModelPicker } from "./StudioModelPicker";
import type { StudioModelOption, StudioTool } from "@/lib/studio-constants";

const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "21:9"] as const;

const PLACEHOLDER: Record<StudioTool, string> = {
  txt2img: "Describe the image to generate...",
  img2img: "Describe changes to apply to reference image...",
  txt2vid: "Describe the video scene and motion (e.g. cinematic drone shot through misty mountains)...",
  img2vid: "Describe how to animate this image (e.g. camera pushes in, leaves sway in wind)...",
  v2v: "Describe the video modification at the selected point or range...",
  nodes: "Describe prompt for graph pipeline...",
};

interface PromptEngineProps {
  tool: StudioTool;
  prompt: string;
  setPrompt: (v: string) => void;
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  strength: number;
  setStrength: (v: number) => void;
  showStrength: boolean;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  models: StudioModelOption[];
  backendLabel: string;
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  error: string | null;
  reference?: { kind: "image" | "video"; url: string; name?: string } | null;
  onReferenceClear?: () => void;
  onReferenceFile?: (file: File) => void;
  targetBadge?: string | null;
  disabled?: boolean;
}

export function PromptEngine({
  tool,
  prompt,
  setPrompt,
  aspectRatio,
  setAspectRatio,
  strength,
  setStrength,
  showStrength,
  selectedModel,
  setSelectedModel,
  models,
  backendLabel,
  onGenerate,
  isGenerating,
  canGenerate,
  error,
  reference,
  onReferenceClear,
  onReferenceFile,
  targetBadge,
  disabled = false,
}: PromptEngineProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const accept =
    tool === "v2v"
      ? "video/*"
      : tool === "img2img" || tool === "img2vid"
        ? "image/*"
        : undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isGenerating && canGenerate) onGenerate();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5">
      <div
        className="pointer-events-auto w-full max-w-3xl rounded-2xl transition-all duration-200"
        style={{
          background: "rgba(16, 18, 27, 0.85)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.12), 0 24px 60px -10px rgba(0, 0, 0, 0.85)",
        }}
      >
        {(tool === "img2img" || tool === "img2vid" || tool === "v2v") && (
          <div className="flex items-center gap-2.5 px-4 pt-3">
            {reference ? (
              <>
                {reference.kind === "image" ? (
                  <img
                    src={reference.url}
                    alt=""
                    className="h-9 w-9 rounded-lg object-cover"
                    style={{ border: "1px solid var(--studio-line-strong)" }}
                  />
                ) : (
                  <video
                    src={reference.url}
                    className="h-9 w-9 rounded-lg object-cover"
                    muted
                    style={{ border: "1px solid var(--studio-line-strong)" }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--studio-muted)]">
                  {reference.name || (reference.kind === "video" ? "Reference Video" : "Reference Image")}
                </span>
                {onReferenceClear && (
                  <button
                    type="button"
                    onClick={onReferenceClear}
                    className="h-6.5 rounded-lg px-2.5 text-[11px] text-[var(--studio-dim)] hover:text-white transition-colors"
                    style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--studio-line)" }}
                  >
                    Clear
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-7.5 rounded-lg px-3 text-[11px] font-medium text-[var(--studio-muted)] hover:text-white hover:border-white/30 transition-all"
                style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px dashed rgba(255, 255, 255, 0.18)" }}
              >
                {tool === "v2v" ? "+ Upload reference video" : "+ Upload reference image"}
              </button>
            )}
            {onReferenceFile && (
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReferenceFile(file);
                  e.target.value = "";
                }}
              />
            )}
            {targetBadge && (
              <span className="ml-auto inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-mono font-medium text-amber-300 shadow-sm">
                {targetBadge}
              </span>
            )}
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDER[tool]}
          rows={2}
          disabled={disabled}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[13px] font-normal leading-relaxed text-[var(--studio-ink)] placeholder:text-[var(--studio-dim)] focus:outline-none disabled:opacity-40"
        />

        <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3 pt-1">
          {/* Interactive Model Picker Popover */}
          <StudioModelPicker
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            models={models}
            disabled={disabled}
          />

          {/* Engine Status Chip */}
          <span
            className="h-7.5 rounded-lg px-2.5 text-[11px] font-medium leading-7.5 text-[var(--studio-muted)]"
            style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--studio-line)" }}
          >
            {backendLabel}
          </span>

          {/* Aspect Ratio Segmented Pill */}
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--studio-line)" }}
          >
            {ASPECTS.map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => setAspectRatio(ar)}
                disabled={disabled}
                className="h-6.5 rounded-md px-2 text-[11px] font-mono transition-all disabled:opacity-40"
                style={{
                  color: aspectRatio === ar ? "var(--studio-ink)" : "var(--studio-dim)",
                  background: aspectRatio === ar ? "rgba(255, 255, 255, 0.12)" : "transparent",
                  fontWeight: aspectRatio === ar ? "600" : "400",
                }}
              >
                {ar}
              </button>
            ))}
          </div>

          {/* Strength Slider Pill */}
          {showStrength && (
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-1"
              style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--studio-line)" }}
            >
              <span className="text-[11px] text-[var(--studio-dim)] font-medium">Strength</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={strength}
                onChange={(e) => setStrength(parseFloat(e.target.value))}
                disabled={disabled}
                className="w-18 accent-[hsl(var(--info))]"
              />
              <span className="w-7 text-[11px] font-mono text-[var(--studio-muted)] text-right">
                {Math.round(strength * 100)}%
              </span>
            </div>
          )}

          {/* Submit Action Button */}
          <div className="ml-auto flex items-center gap-2.5">
            {error && <span className="max-w-[220px] truncate text-[11px] text-[var(--studio-offline)] font-medium">{error}</span>}
            <button
              type="button"
              onClick={onGenerate}
              disabled={disabled || isGenerating || !canGenerate}
              className="group relative flex h-8 items-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold text-zinc-950 transition-all duration-200 disabled:opacity-35 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #e4e4e7 100%)",
                boxShadow: isGenerating
                  ? "0 0 20px rgba(99, 102, 241, 0.5)"
                  : "0 4px 14px rgba(255, 255, 255, 0.2)",
              }}
            >
              <span>{isGenerating ? "Synthesizing..." : "Generate"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
