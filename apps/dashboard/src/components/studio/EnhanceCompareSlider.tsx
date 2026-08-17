"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Download,
  Upload,
} from "lucide-react";

interface EnhanceCompareSliderProps {
  initialImage: string | null;
  onSendToVideo?: (imageSrc: string) => void;
}

export function EnhanceCompareSlider({ initialImage, onSendToVideo }: EnhanceCompareSliderProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(initialImage);
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  const [dividerPosition, setDividerPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  // Settings
  const [factor, setFactor] = useState<2 | 4 | 8>(4);
  const [creativity, setCreativity] = useState(0.35);
  const [texture, setTexture] = useState(0.5);
  const [faceRestore, setFaceRestore] = useState(true);
  const [prompt] = useState("enhance micro details, sharp 4K texture, clear lighting, perfect clarity");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialImage) {
      setSourceImage(initialImage);
    }
  }, [initialImage]);

  const handlePointerDown = () => setIsDragging(true);
  const handlePointerUp = () => setIsDragging(false);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setDividerPosition(percent);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSourceImage(String(event.target?.result || ""));
      setEnhancedImage(null);
    };
    reader.readAsDataURL(file);
  };

  const triggerEnhance = async () => {
    if (!sourceImage) return;
    setIsEnhancing(true);
    const start = Date.now();

    try {
      const res = await fetch("/api/studio/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: sourceImage,
          factor,
          creativity,
          texture,
          faceRestore,
          prompt,
        }),
      });

      const data = await res.json();
      setDurationMs(Date.now() - start);

      if (data.data?.[0]?.b64_json) {
        setEnhancedImage(`data:image/png;base64,${data.data[0].b64_json}`);
      } else {
        setEnhancedImage(sourceImage);
      }
    } catch (err) {
      console.error("Enhance failed:", err);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            OpenDoor 4K AI Enhancer & Upscaler (Krea Pipeline)
          </span>
        </div>

        {/* Upscale Factor Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Scale:</span>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-1 border border-white/5">
            {([2, 4, 8] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFactor(f)}
                className={`rounded px-2.5 py-0.5 text-xs font-medium transition-all ${
                  factor === f ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-400 hover:text-white"
                }`}
              >
                {f}x
              </button>
            ))}
          </div>

          <label className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Main Split Compare Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerUp}
        className="relative aspect-video w-full select-none overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl cursor-ew-resize"
      >
        {sourceImage ? (
          <>
            {/* Background: Enhanced Image */}
            <div className="absolute inset-0 h-full w-full">
              <img
                src={enhancedImage || sourceImage}
                alt="Enhanced Output"
                className={`h-full w-full object-contain ${
                  enhancedImage ? "filter contrast-105 brightness-105" : "filter blur-[0.3px]"
                }`}
              />
              <div className="absolute top-3 right-3 rounded-md bg-zinc-950/80 px-2.5 py-1 text-[11px] font-semibold text-amber-300 border border-amber-400/20 backdrop-blur-md">
                {enhancedImage ? `Enhanced ${factor}x Master` : "Original (Ready to Enhance)"}
              </div>
            </div>

            {/* Foreground: Original Image */}
            <div
              className="absolute inset-0 h-full w-full overflow-hidden"
              style={{ width: `${dividerPosition}%` }}
            >
              <div
                className="relative h-full w-full"
                style={{ width: containerRef.current?.clientWidth || "100%" }}
              >
                <img
                  src={sourceImage}
                  alt="Original Source"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="absolute top-3 left-3 rounded-md bg-zinc-950/80 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 border border-white/10 backdrop-blur-md">
                Original Image
              </div>
            </div>

            {/* Center Divider */}
            <div
              className="absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-lg pointer-events-none"
              style={{ left: `${dividerPosition}%` }}
            >
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-zinc-950 text-white shadow-xl">
                <div className="flex gap-0.5">
                  <div className="h-3 w-0.5 bg-white/80" />
                  <div className="h-3 w-0.5 bg-white/80" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-zinc-500">
            <Sparkles className="w-12 h-12 stroke-[1] mb-2 opacity-50 text-amber-400" />
            <p className="text-sm font-medium text-zinc-400">No Image Loaded</p>
            <p className="text-xs text-zinc-600 mt-1">Upload an image or generate from Live Canvas to upscale</p>
          </div>
        )}

        {isEnhancing && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/70 backdrop-blur-xs">
            <Sparkles className="h-10 w-10 animate-spin text-amber-400" />
            <span className="mt-3 text-sm font-semibold text-white">
              OpenDoor 4K AI Upscaler Processing...
            </span>
            <span className="text-xs text-zinc-400 mt-1">Synthesizing micro-textures and dynamic range</span>
          </div>
        )}
      </div>

      {/* Parameters & Enhancement Action Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 rounded-xl border border-white/10 bg-zinc-950 p-4">
        {/* Creativity Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300">AI Creativity</span>
            <span className="font-mono text-zinc-400">{Math.round(creativity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={creativity}
            onChange={(e) => setCreativity(parseFloat(e.target.value))}
            className="w-full accent-amber-400"
          />
          <span className="text-[10px] text-zinc-500">Higher values hallucinate extra detail</span>
        </div>

        {/* Texture Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300">Texture & Sharpness</span>
            <span className="font-mono text-zinc-400">{Math.round(texture * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={texture}
            onChange={(e) => setTexture(parseFloat(e.target.value))}
            className="w-full accent-amber-400"
          />
          <span className="text-[10px] text-zinc-500">Sharpen pores, fabric & grain</span>
        </div>

        {/* Face Detail Recovery Toggle */}
        <div className="flex flex-col justify-between">
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={faceRestore}
              onChange={(e) => setFaceRestore(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-amber-400"
            />
            <span>Face & Eyes Detail Restoration</span>
          </label>
          {durationMs !== null && (
            <span className="text-[11px] text-zinc-500">
              Last enhanced in {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Execute Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={triggerEnhance}
            disabled={isEnhancing || !sourceImage}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 disabled:opacity-40 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isEnhancing ? "Upscaling..." : `Upscale to ${factor}K`}</span>
          </button>

          {enhancedImage && onSendToVideo && (
            <button
              type="button"
              onClick={() => onSendToVideo(enhancedImage)}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 p-2.5 text-zinc-200 hover:bg-zinc-800"
              title="Animate in Video Studio"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {enhancedImage && !onSendToVideo && (
            <a
              href={enhancedImage}
              download={`opendoor-4k-enhanced-${Date.now()}.png`}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 p-2.5 text-zinc-200 hover:bg-zinc-800"
              title="Download 4K Image"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
