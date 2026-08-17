"use client";

import { useEffect, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Download,
  RefreshCw,
  Scissors,
  GitFork,
  Image as ImageIcon,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button, Chip, Card, CardContent } from "@heroui/react";
import type { StudioTool } from "@/lib/studio-constants";

export interface GeneratedAssetDetail {
  id: string;
  url: string;
  kind: "image" | "video";
  prompt: string;
  model: string;
  timestamp: number;
  referenceUrl?: string | null;
  mode?: StudioTool;
  aspectRatio?: string;
  seed?: number;
}

interface GenerationDetailModalProps {
  assets: GeneratedAssetDetail[];
  selectedIndex: number | null;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onRemix: (asset: GeneratedAssetDetail) => void;
  onUseAsReference: (asset: GeneratedAssetDetail) => void;
  onEditInTimeline: (asset: GeneratedAssetDetail) => void;
  onSendToNodes: (asset: GeneratedAssetDetail) => void;
  onDownload: (url: string, id: string, kind: "image" | "video") => void;
}

export function GenerationDetailModal({
  assets,
  selectedIndex,
  onClose,
  onSelectIndex,
  onRemix,
  onUseAsReference,
  onEditInTimeline,
  onSendToNodes,
  onDownload,
}: GenerationDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const asset = selectedIndex != null ? assets[selectedIndex] : null;

  const hasPrev = selectedIndex != null && selectedIndex > 0;
  const hasNext = selectedIndex != null && selectedIndex < assets.length - 1;

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (selectedIndex == null) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onSelectIndex(selectedIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onSelectIndex(selectedIndex + 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, hasPrev, hasNext, onClose, onSelectIndex]);

  if (!asset) return null;

  const copyPrompt = () => {
    if (!asset.prompt) return;
    navigator.clipboard.writeText(asset.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modeBadge =
    asset.mode === "txt2vid"
      ? "Text to Video"
      : asset.mode === "img2vid"
        ? "Image to Video"
        : asset.mode === "img2img"
          ? "Image to Image"
          : asset.mode === "v2v"
            ? "Timeline Edit"
            : asset.mode === "nodes"
              ? "Node Graph"
              : "Text to Image";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Backdrop Dismiss Button */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Lightbox Card */}
      <div
        className="relative z-10 flex h-full max-h-[92vh] w-full max-w-6xl flex-col md:flex-row overflow-hidden rounded-3xl border border-white/15 bg-zinc-950 shadow-2xl shadow-black/80"
        style={{ background: "rgba(10, 11, 16, 0.96)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button Top Right */}
        <Button
          size="sm"
          variant="ghost"
          onPress={onClose}
          className="absolute top-4 right-4 z-30 rounded-full bg-black/60 text-white hover:bg-white/20 h-8 w-8 min-w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Left Side: Full Viewport Media Stage */}
        <div className="relative flex flex-1 flex-col items-center justify-center bg-black/60 p-4 md:p-6 overflow-hidden">
          {/* Media Viewport */}
          <div className="relative flex h-full w-full items-center justify-center">
            {showOriginal && asset.referenceUrl ? (
              <img
                src={asset.referenceUrl}
                alt="Original Reference"
                className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
            ) : asset.kind === "video" ? (
              <video
                src={asset.url}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
            ) : (
              <img
                src={asset.url}
                alt={asset.prompt}
                className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
            )}
          </div>

          {/* Navigation Arrows */}
          {hasPrev && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onSelectIndex(selectedIndex - 1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/70 text-white hover:bg-white/20 h-9 w-9 min-w-9 p-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {hasNext && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onSelectIndex(selectedIndex + 1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/70 text-white hover:bg-white/20 h-9 w-9 min-w-9 p-0"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}

          {/* Bottom Toolbar over Media */}
          <div className="mt-4 flex items-center justify-between w-full max-w-md px-2">
            <span className="font-mono text-xs text-zinc-500">
              {(selectedIndex ?? 0) + 1} of {assets.length}
            </span>

            {asset.referenceUrl && (
              <Button
                size="sm"
                variant={showOriginal ? "primary" : "ghost"}
                onPress={() => setShowOriginal(!showOriginal)}
                className="text-[10px] font-mono flex items-center gap-1 h-6 px-2 text-zinc-300"
              >
                <Layers className="h-3 w-3" />
                <span>{showOriginal ? "View Generation" : "View Original"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Right Side: Metadata Inspector & Rapid Iteration Panel */}
        <aside
          className="flex w-full md:w-[380px] shrink-0 flex-col justify-between border-t md:border-t-0 md:border-l border-white/10 p-5 overflow-y-auto"
          style={{ background: "rgba(16, 18, 28, 0.98)" }}
        >
          <div className="space-y-4">
            {/* Header: Mode Badge & Model */}
            <div className="flex items-center justify-between gap-2 pr-8">
              <Chip
                size="sm"
                variant="primary"
                color="accent"
                className="font-mono text-[10px] uppercase font-bold"
              >
                {modeBadge}
              </Chip>

              <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
                <Clock className="h-3 w-3" />
                <span>{new Date(asset.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>

            {/* Prompt Card with 1-Click Copy */}
            <Card className="border border-white/10 bg-black/40 p-3.5 space-y-2">
              <CardContent className="p-0">
                <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
                  <span>Prompt Specification</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={copyPrompt}
                    className="h-5 px-1 text-[10px] text-zinc-300 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400 inline mr-1" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 inline mr-1" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-[12px] font-normal leading-relaxed text-zinc-200 break-words">
                  {asset.prompt || "No text prompt recorded."}
                </p>
              </CardContent>
            </Card>

            {/* Model & Generation Metadata Details */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="block text-[10px] text-zinc-500 font-medium">Model Engine</span>
                <span className="font-mono text-zinc-200 truncate block mt-0.5">{asset.model}</span>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="block text-[10px] text-zinc-500 font-medium">Aspect Ratio</span>
                <span className="font-mono text-zinc-200 block mt-0.5">{asset.aspectRatio || "1:1"}</span>
              </div>
            </div>

            {/* Original Reference Preview (If available) */}
            {asset.referenceUrl && (
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 space-y-1.5">
                <span className="block text-[10px] font-medium text-zinc-400">Original Reference Media</span>
                <div className="flex items-center gap-2.5">
                  <img
                    src={asset.referenceUrl}
                    alt="Original"
                    className="h-10 w-10 rounded-lg object-cover border border-white/10"
                  />
                  <div className="text-[11px] text-zinc-300 truncate">Source reference input</div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom: 1-Click Rapid Iteration Action Stack */}
          <div className="pt-5 space-y-2 border-t border-white/10">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Rapid Iteration & Build Upon
            </div>

            {/* Primary Action: Remix & Build Upon */}
            <Button
              size="sm"
              variant="primary"
              onPress={() => {
                onRemix(asset);
                onClose();
              }}
              className="w-full justify-between bg-gradient-to-r from-indigo-500 to-purple-600 font-semibold text-xs h-9 text-white shadow-lg shadow-indigo-500/20"
            >
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Remix / Build Upon</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 opacity-70" />
            </Button>

            {/* Sub Actions Grid */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  onUseAsReference(asset);
                  onClose();
                }}
                className="text-[11px] bg-white/5 hover:bg-white/10 text-zinc-300 justify-start h-8 px-2"
              >
                <ImageIcon className="h-3.5 w-3.5 text-indigo-400 inline mr-1" />
                <span className="truncate">As Start Frame</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  onEditInTimeline(asset);
                  onClose();
                }}
                className="text-[11px] bg-white/5 hover:bg-white/10 text-zinc-300 justify-start h-8 px-2"
              >
                <Scissors className="h-3.5 w-3.5 text-amber-400 inline mr-1" />
                <span className="truncate">Timeline Edit</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  onSendToNodes(asset);
                  onClose();
                }}
                className="text-[11px] bg-white/5 hover:bg-white/10 text-zinc-300 justify-start h-8 px-2"
              >
                <GitFork className="h-3.5 w-3.5 text-pink-400 inline mr-1" />
                <span className="truncate">Node Graph</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onPress={() => onDownload(asset.url, asset.id, asset.kind)}
                className="text-[11px] bg-white/5 hover:bg-white/10 text-zinc-300 justify-start h-8 px-2"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400 inline mr-1" />
                <span className="truncate">Download {asset.kind === "video" ? "MP4" : "PNG"}</span>
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
