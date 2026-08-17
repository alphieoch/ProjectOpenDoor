"use client";

import React from "react";
import {
  Video,
  Eye,
} from "lucide-react";

export interface CameraControlState {
  pan: number; // -10 to +10 (Left / Right)
  tilt: number; // -10 to +10 (Up / Down)
  zoom: number; // -10 to +10 (In / Out)
  roll: number; // -10 to +10 (CCW / CW)
  speed: number; // 1 to 10
  smooth: boolean;
}

interface CameraControlsProps {
  camera: CameraControlState;
  setCamera: React.Dispatch<React.SetStateAction<CameraControlState>>;
}

const PRESETS = [
  {
    name: "Static Shot",
    state: { pan: 0, tilt: 0, zoom: 0, roll: 0, speed: 5, smooth: true },
  },
  {
    name: "Cinematic Push In",
    state: { pan: 0, tilt: 1, zoom: 6, roll: 0, speed: 4, smooth: true },
  },
  {
    name: "Drone Flyover",
    state: { pan: 2, tilt: -6, zoom: 4, roll: 1, speed: 6, smooth: true },
  },
  {
    name: "Dutch Tilt Pan",
    state: { pan: -5, tilt: 3, zoom: 2, roll: 4, speed: 5, smooth: true },
  },
  {
    name: "Slow Orbit",
    state: { pan: 7, tilt: 0, zoom: 1, roll: 0, speed: 3, smooth: true },
  },
];

export function CameraControls({ camera, setCamera }: CameraControlsProps) {
  const updateCamera = (key: keyof CameraControlState, value: number | boolean) => {
    setCamera((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Runway 6-Axis Camera Director
          </span>
        </div>
        <span className="text-xs text-zinc-500">Director Mode</span>
      </div>

      {/* Quick Camera Presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => setCamera(preset.state)}
            className="whitespace-nowrap rounded-lg border border-white/5 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 3D Visual Camera Orientation Gizmo */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-white/5 bg-zinc-900/60 p-4">
          <div className="mb-3 text-[11px] font-medium text-zinc-400">
            3D Camera Trajectory Gizmo
          </div>
          <div
            className="relative flex h-28 w-28 items-center justify-center rounded-xl border border-white/20 bg-zinc-800/80 shadow-2xl transition-transform duration-300"
            style={{
              transform: `perspective(400px) rotateX(${camera.tilt * 2}deg) rotateY(${camera.pan * 2}deg) rotateZ(${camera.roll * 2}deg) scale(${1 + camera.zoom * 0.03})`,
            }}
          >
            <div className="absolute inset-2 rounded-lg border border-dashed border-amber-400/50 flex items-center justify-center">
              <Eye className="w-8 h-8 text-amber-400/80" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-zinc-950 px-1 text-[9px] font-mono text-zinc-400">
              FRONT
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
            <span>P:{camera.pan}</span>
            <span>T:{camera.tilt}</span>
            <span>Z:{camera.zoom}</span>
            <span>R:{camera.roll}</span>
          </div>
        </div>

        {/* 6-Axis Parameter Sliders */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pan (Horizontal Rotation) */}
          <div className="space-y-1 rounded-lg bg-zinc-900/60 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Pan (Left / Right)</span>
              <span className="font-mono text-zinc-400">{camera.pan}</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={camera.pan}
              onChange={(e) => updateCamera("pan", parseInt(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          {/* Tilt (Vertical Pitch) */}
          <div className="space-y-1 rounded-lg bg-zinc-900/60 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Tilt (Up / Down)</span>
              <span className="font-mono text-zinc-400">{camera.tilt}</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={camera.tilt}
              onChange={(e) => updateCamera("tilt", parseInt(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          {/* Zoom (Dolly In / Out) */}
          <div className="space-y-1 rounded-lg bg-zinc-900/60 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Zoom (Dolly In / Out)</span>
              <span className="font-mono text-zinc-400">{camera.zoom}</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={camera.zoom}
              onChange={(e) => updateCamera("zoom", parseInt(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          {/* Roll (Dutch Angle) */}
          <div className="space-y-1 rounded-lg bg-zinc-900/60 p-2.5 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Roll (Rotation)</span>
              <span className="font-mono text-zinc-400">{camera.roll}</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              value={camera.roll}
              onChange={(e) => updateCamera("roll", parseInt(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          {/* Camera Speed & Motion Smoothness */}
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-zinc-900/40 p-2.5 border border-white/5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-zinc-300">Speed:</span>
              <span className="text-xs font-mono text-zinc-400">{camera.speed}x</span>
              <input
                type="range"
                min={1}
                max={10}
                value={camera.speed}
                onChange={(e) => updateCamera("speed", parseInt(e.target.value))}
                className="w-28 accent-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={camera.smooth}
                onChange={(e) => updateCamera("smooth", e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-white"
              />
              <span>Cinematic Bezier Smoothing</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
