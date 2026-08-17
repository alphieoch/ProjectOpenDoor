"use client";

import React, { useRef, useState } from "react";
import {
  Brush,
  Eraser,
  Trash2,
  Compass,
} from "lucide-react";

export interface MotionZone {
  id: number;
  name: string;
  color: string;
  vx: number; // -10 to +10
  vy: number; // -10 to +10
  vz: number; // -10 to +10
  noise: number; // 0 to 10
}

interface MotionBrushCanvasProps {
  imageSrc: string | null;
  zones: MotionZone[];
  setZones: React.Dispatch<React.SetStateAction<MotionZone[]>>;
  activeZoneId: number;
  setActiveZoneId: (id: number) => void;
}

export function MotionBrushCanvas({
  imageSrc,
  zones,
  setZones,
  activeZoneId,
  setActiveZoneId,
}: MotionBrushCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(28);
  const [isDrawing, setIsDrawing] = useState(false);

  const activeZone = zones.find((z) => z.id === activeZoneId) || zones[0];

  const updateActiveZone = (key: keyof MotionZone, value: number) => {
    setZones((prev) =>
      prev.map((z) => (z.id === activeZoneId ? { ...z, [key]: value } : z))
    );
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : activeZone.color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.globalAlpha = tool === "eraser" ? 1 : 0.6;

    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.closePath();
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="space-y-4">
      {/* Motion Brush Zone Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950 p-3">
        <div className="flex items-center gap-2">
          <Brush className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Runway Motion Brush
          </span>
        </div>

        {/* Brush Zones Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {zones.map((zone) => {
            const isSelected = activeZoneId === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => setActiveZoneId(zone.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-zinc-800 text-white border border-white/30 shadow-md"
                    : "bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5"
                }`}
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <span>{zone.name}</span>
              </button>
            );
          })}
        </div>

        {/* Drawing & Eraser Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTool("brush")}
            title="Motion Brush"
            className={`rounded-lg p-1.5 transition-all ${
              tool === "brush" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Brush className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTool("eraser")}
            title="Erase Mask"
            className={`rounded-lg p-1.5 transition-all ${
              tool === "eraser" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <span className="w-6 text-right">{brushSize}px</span>
            <input
              type="range"
              min={8}
              max={60}
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-16 accent-white"
            />
          </div>
          <button
            type="button"
            onClick={clearMask}
            title="Clear Mask"
            className="rounded-lg p-1.5 text-zinc-400 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Overlay for Motion Painting */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt="Reference frame"
            className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
            <Compass className="w-10 h-10 stroke-[1] mb-2 opacity-50" />
            <p className="text-xs">Upload or generate an image to paint motion brush zones</p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="relative z-10 h-full w-full touch-none cursor-crosshair"
        />
      </div>

      {/* Directional Velocity Vectors for Active Brush Zone */}
      <div className="rounded-xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: activeZone.color }}
            />
            <span className="text-xs font-semibold text-white">
              {activeZone.name} Motion Velocity Controls
            </span>
          </div>
          <span className="text-xs text-zinc-500">Runway 3D Vector Engine</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Horizontal Velocity Vx */}
          <div className="space-y-1.5 rounded-lg bg-zinc-900/80 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Horizontal (X)</span>
              <span className="font-mono text-zinc-400">
                {activeZone.vx > 0 ? `+${activeZone.vx}` : activeZone.vx}
              </span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={activeZone.vx}
              onChange={(e) => updateActiveZone("vx", parseInt(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>← Left</span>
              <span>Right →</span>
            </div>
          </div>

          {/* Vertical Velocity Vy */}
          <div className="space-y-1.5 rounded-lg bg-zinc-900/80 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Vertical (Y)</span>
              <span className="font-mono text-zinc-400">
                {activeZone.vy > 0 ? `+${activeZone.vy}` : activeZone.vy}
              </span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={activeZone.vy}
              onChange={(e) => updateActiveZone("vy", parseInt(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>↑ Up</span>
              <span>Down ↓</span>
            </div>
          </div>

          {/* Proximity / Depth Vz */}
          <div className="space-y-1.5 rounded-lg bg-zinc-900/80 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Proximity / Zoom (Z)</span>
              <span className="font-mono text-zinc-400">{activeZone.vz > 0 ? `+${activeZone.vz}` : activeZone.vz}</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={activeZone.vz}
              onChange={(e) => updateActiveZone("vz", parseInt(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Far (Away)</span>
              <span>Near (Closer)</span>
            </div>
          </div>

          {/* Ambient Turbulence / Noise */}
          <div className="space-y-1.5 rounded-lg bg-zinc-900/80 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Turbulence / Noise</span>
              <span className="font-mono text-zinc-400">{activeZone.noise}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={activeZone.noise}
              onChange={(e) => updateActiveZone("noise", parseInt(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Smooth</span>
              <span>Turbulent</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
