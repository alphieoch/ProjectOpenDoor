"use client";

import React, { useState } from "react";
import {
  Film,
  Sparkles,
  Layers,
  Video,
  Upload,
} from "lucide-react";
import { MotionBrushCanvas, MotionZone } from "./MotionBrushCanvas";
import { CameraControls, CameraControlState } from "./CameraControls";

interface VideoTimelineProps {
  initialImage: string | null;
  onSendToEnhance?: (imageSrc: string) => void;
}

const INITIAL_MOTION_ZONES: MotionZone[] = [
  { id: 1, name: "Foreground (Zone 1)", color: "#ec4899", vx: 0, vy: 0, vz: 4, noise: 2 },
  { id: 2, name: "Background (Zone 2)", color: "#06b6d4", vx: 2, vy: 0, vz: 0, noise: 1 },
  { id: 3, name: "Subject (Zone 3)", color: "#f59e0b", vx: 0, vy: -2, vz: 2, noise: 3 },
];

export function VideoTimeline({ initialImage }: VideoTimelineProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(initialImage);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<4 | 8 | 16>(4);
  const [aspectRatio] = useState("16:9");
  const [motionStrength, setMotionStrength] = useState(5);
  
  // Runway Motion Brush state
  const [motionZones, setMotionZones] = useState<MotionZone[]>(INITIAL_MOTION_ZONES);
  const [activeZoneId, setActiveZoneId] = useState(1);

  // Runway Camera state
  const [camera, setCamera] = useState<CameraControlState>({
    pan: 0,
    tilt: 0,
    zoom: 2,
    roll: 0,
    speed: 5,
    smooth: true,
  });

  // Active Tab inside Video Director
  const [directorTab, setDirectorTab] = useState<"brush" | "camera">("brush");

  // Video generation states
  const [isGenerating, setIsGenerating] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSourceImage(String(event.target?.result || ""));
    };
    reader.readAsDataURL(file);
  };

  const triggerGenerateVideo = async () => {
    setIsGenerating(true);
    try {
      await fetch("/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "Cinematic fluid camera motion, hyper-detailed temporal dynamics",
          image: sourceImage,
          duration,
          aspectRatio,
          motionBrush: motionZones,
          cameraControl: camera,
          motionStrength,
        }),
      });
    } catch (err) {
      console.error("Video generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Video Director Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-white" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            OpenDoor Video Studio (Runway Gen-3 Engine)
          </span>
        </div>

        {/* Duration Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Duration:</span>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-1 border border-white/5">
            {([4, 8, 16] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`rounded px-2.5 py-0.5 text-xs font-medium transition-all ${
                  duration === d ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-400 hover:text-white"
                }`}
              >
                {d}s
              </button>
            ))}
          </div>

          <label className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white">
            <Upload className="w-3.5 h-3.5" />
            <span>Reference Frame</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Main Director Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Motion Canvas & Controls */}
        <div className="lg:col-span-8 space-y-4">
          {/* Sub-tab Navigation: Motion Brush vs Camera */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <button
              type="button"
              onClick={() => setDirectorTab("brush")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                directorTab === "brush"
                  ? "bg-white text-zinc-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>1. Motion Brush Canvas</span>
            </button>
            <button
              type="button"
              onClick={() => setDirectorTab("camera")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                directorTab === "camera"
                  ? "bg-white text-zinc-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>2. 6-Axis Camera Director</span>
            </button>
          </div>

          {directorTab === "brush" ? (
            <MotionBrushCanvas
              imageSrc={sourceImage}
              zones={motionZones}
              setZones={setMotionZones}
              activeZoneId={activeZoneId}
              setActiveZoneId={setActiveZoneId}
            />
          ) : (
            <CameraControls camera={camera} setCamera={setCamera} />
          )}
        </div>

        {/* Right: Generation Inspector & Scene Output */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4 rounded-xl border border-white/10 bg-zinc-950 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Scene Parameters
              </span>
              <span className="text-xs text-amber-400 font-mono">Runway Pipeline</span>
            </div>

            {/* Prompt for video motion */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Director Motion Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Camera slowly pushes in through atmospheric fog, flowing liquid light, smooth 60fps"
                className="w-full h-24 resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-white/20 focus:outline-none"
              />
            </div>

            {/* Motion Intensity Slider */}
            <div className="space-y-1 rounded-lg bg-zinc-900/60 p-2.5 border border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-300">Motion Intensity</span>
                <span className="font-mono text-zinc-400">{motionStrength}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={motionStrength}
                onChange={(e) => setMotionStrength(parseInt(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            {/* Scene Preview / Generated Frame */}
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-zinc-900 flex items-center justify-center">
              {sourceImage ? (
                <img
                  src={sourceImage}
                  alt="Video Frame"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center p-4 text-zinc-600">
                  <Film className="w-8 h-8 mx-auto mb-1 opacity-50" />
                  <span className="text-[11px]">Preview Frame</span>
                </div>
              )}

              {isGenerating && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/70 backdrop-blur-xs">
                  <Sparkles className="h-8 w-8 animate-spin text-amber-400" />
                  <span className="mt-2 text-xs font-medium text-zinc-200">
                    Synthesizing Video Frames...
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Trigger Video Generation Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={triggerGenerateVideo}
              disabled={isGenerating || (!sourceImage && !prompt.trim())}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-white/10 hover:bg-zinc-200 disabled:opacity-40 transition-all"
            >
              <Film className="w-4 h-4" />
              <span>{isGenerating ? "Rendering Video..." : `Render ${duration}s Video Scene`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
