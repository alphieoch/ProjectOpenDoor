"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Clock,
  Copy,
  Check,
  History,
  Image as ImageIcon,
  RefreshCw,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudioModelOption } from "@/lib/studio-constants";
import {
  resolveStudioModelMeta,
  studioModeLabel,
  studioResolutionLabel,
  type GeneratedAssetDetail,
} from "./GenerationDetailModal";

export const HISTORY_RAIL_WIDTH = 300;

function formatRelativeTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (delta < 45_000) return "Just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.floor(delta / 3_600_000))}h ago`;
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatAbsoluteTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HistoryThumb({ asset }: { asset: GeneratedAssetDetail }) {
  if (asset.kind === "video" && asset.url) {
    return <video src={asset.url} muted playsInline className="h-full w-full object-cover" />;
  }
  if (asset.kind === "image" && asset.url) {
    return <img src={asset.url} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-50 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
      {asset.kind === "audio" ? <Volume2 className="h-3.5 w-3.5" /> : <Box className="h-3.5 w-3.5" />}
    </div>
  );
}

interface StudioHistoryRailProps {
  open: boolean;
  onClose: () => void;
  assets: GeneratedAssetDetail[];
  selectedId: string | null;
  onSelect: (asset: GeneratedAssetDetail) => void;
  onRecreate: (asset: GeneratedAssetDetail) => void;
  onUseAsReference: (asset: GeneratedAssetDetail) => void;
  models: StudioModelOption[];
  isGenerating?: boolean;
}

export function StudioHistoryRail({
  open,
  onClose,
  assets,
  selectedId,
  onSelect,
  onRecreate,
  onUseAsReference,
  models,
  isGenerating = false,
}: StudioHistoryRailProps) {
  const [copied, setCopied] = useState(false);
  const selected = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? null,
    [assets, selectedId],
  );
  const selectedModel = selected ? resolveStudioModelMeta(selected.model, models) : null;

  const copyPrompt = () => {
    if (!selected?.prompt) return;
    void navigator.clipboard.writeText(selected.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-zinc-900/20 md:hidden"
        onClick={onClose}
        aria-label="Close generation history"
      />
      <aside
        className={cn(
          "flex w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
          "max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50 max-md:shadow-2xl",
        )}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              History
            </span>
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              {assets.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="Close history"
          >
            <X className="h-3 w-3" />
            <span>Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {assets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                <History className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">No generations yet</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                New images, videos, objects, and sound will appear here so you can inspect them or build on them.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 p-3">
              {assets.map((asset) => {
                const model = resolveStudioModelMeta(asset.model, models);
                const active = asset.id === selected?.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelect(asset)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-xl border px-2 py-2 text-left transition-colors",
                      active
                        ? "border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                        : "border-transparent bg-zinc-50 hover:border-zinc-200 hover:bg-white dark:bg-zinc-950 dark:hover:border-zinc-800 dark:hover:bg-zinc-900",
                    )}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                      <HistoryThumb asset={asset} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[11px] leading-snug text-zinc-800 dark:text-zinc-100">
                        {asset.prompt || "Untitled generation"}
                      </p>
                      <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide text-zinc-500">
                        {model.name} · {formatRelativeTime(asset.timestamp)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected && selectedModel && (
          <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-2.5 flex items-center gap-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <HistoryThumb asset={selected} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-900 dark:text-white">{selectedModel.name}</p>
                {selectedModel.company && (
                  <p className="truncate font-mono text-[10px] text-zinc-500">{selectedModel.company}</p>
                )}
                <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                  <Clock className="h-3 w-3" />
                  <span>{formatAbsoluteTime(selected.timestamp)}</span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Prompt</span>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:text-white"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="max-h-20 overflow-y-auto text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                {selected.prompt || "No prompt recorded."}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <SpecChip label={studioModeLabel(selected.mode)} />
              {selected.aspectRatio && <SpecChip label={selected.aspectRatio} />}
              {selected.resolution && <SpecChip label={studioResolutionLabel(selected.resolution)} />}
              {selected.size && <SpecChip label={selected.size} />}
              {selected.durationSeconds != null && <SpecChip label={`${selected.durationSeconds}s`} />}
              {selected.variations != null && <SpecChip label={`${selected.variations} var`} />}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => onRecreate(selected)}
                className="flex h-7 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 font-mono text-[10px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <RefreshCw className="h-3 w-3" />
                Recreate
              </button>
              <button
                type="button"
                onClick={() => onUseAsReference(selected)}
                className="flex h-7 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 font-mono text-[10px] text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ImageIcon className="h-3 w-3" />
                Reference
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function SpecChip({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      {label}
    </span>
  );
}
