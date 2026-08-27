"use client";

import { useState } from "react";
import {
  Search,
  Check,
  Move,
  Eye,
  Sparkles,
  Camera,
  Layers,
  X,
} from "lucide-react";
import { Chip } from "@heroui/react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0, 0, 1] as const;
const SPRING_PRESS = { type: "spring" as const, stiffness: 500, damping: 28 };

export interface MotionPreset {
  id: string;
  name: string;
  category: "motion" | "angle" | "format" | "effect" | "transition";
  description: string;
  promptTag: string;
  iconBg: string;
  badge?: string;
  previewGradient: string;
}

export const LUMA_MOTION_PRESETS: MotionPreset[] = [
  // Motion
  {
    id: "static",
    name: "Static",
    category: "motion",
    description: "Locked-off tripod shot with zero camera movement, focusing on in-scene physics.",
    promptTag: "static camera shot, tripod locked",
    iconBg: "from-zinc-800 to-zinc-900",
    previewGradient: "from-zinc-800/80 via-zinc-900 to-black",
  },
  {
    id: "handheld",
    name: "Handheld",
    category: "motion",
    description: "Natural organic micro-shakes and breathing camera movement for gritty realism.",
    promptTag: "handheld camera movement, subtle organic shake",
    iconBg: "from-amber-900/60 to-zinc-900",
    badge: "Organic",
    previewGradient: "from-amber-950/50 via-zinc-900 to-black",
  },
  {
    id: "zoom-in",
    name: "Zoom In",
    category: "motion",
    description: "Smooth cinematic push-in focusing in on the subject.",
    promptTag: "camera pushes in, smooth dolly-in zoom",
    iconBg: "from-blue-900/60 to-zinc-900",
    previewGradient: "from-blue-950/50 via-zinc-900 to-black",
  },
  {
    id: "zoom-out",
    name: "Zoom Out",
    category: "motion",
    description: "Camera pulls back to reveal the wider environment and atmosphere.",
    promptTag: "camera pulls back, smooth zoom out reveal",
    iconBg: "from-blue-900/60 to-zinc-900",
    previewGradient: "from-blue-950/50 via-zinc-900 to-black",
  },
  {
    id: "orbit-left",
    name: "Orbit 360°",
    category: "motion",
    description: "Continuous rotational orbit around the subject maintaining focus at center.",
    promptTag: "360 orbit camera rotation around center subject",
    iconBg: "from-purple-900/60 to-zinc-900",
    badge: "Cinematic",
    previewGradient: "from-purple-950/50 via-zinc-900 to-black",
  },
  {
    id: "pan-right",
    name: "Pan Right",
    category: "motion",
    description: "Horizontal cinematic sweep panning across the landscape from left to right.",
    promptTag: "smooth horizontal pan right, cinematic sweep",
    iconBg: "from-emerald-900/60 to-zinc-900",
    previewGradient: "from-emerald-950/50 via-zinc-900 to-black",
  },
  {
    id: "tilt-up",
    name: "Tilt Up",
    category: "motion",
    description: "Upward camera tilt from low angle looking up to the sky or ceiling.",
    promptTag: "camera tilts up dramatically, low to high reveal",
    iconBg: "from-cyan-900/60 to-zinc-900",
    previewGradient: "from-cyan-950/50 via-zinc-900 to-black",
  },
  {
    id: "fpv-drone",
    name: "FPV Drone",
    category: "motion",
    description: "High-speed acrobatic drone flight diving through obstacles and banking tight turns.",
    promptTag: "FPV drone acrobatic flight, high speed dynamic camera",
    iconBg: "from-rose-900/60 to-zinc-900",
    badge: "Speed",
    previewGradient: "from-rose-950/50 via-zinc-900 to-black",
  },

  // Angle
  {
    id: "low-angle",
    name: "Hero Low Angle",
    category: "angle",
    description: "Shooting upward from near the ground to give the subject immense scale and power.",
    promptTag: "low angle camera looking upward, heroic perspective",
    iconBg: "from-amber-900/60 to-zinc-900",
    previewGradient: "from-amber-950/50 via-zinc-900 to-black",
  },
  {
    id: "birds-eye",
    name: "Bird's Eye / Top-Down",
    category: "angle",
    description: "90-degree straight-down overhead view giving an abstract geometric perspective.",
    promptTag: "top-down bird's eye view, 90 degree overhead angle",
    iconBg: "from-sky-900/60 to-zinc-900",
    previewGradient: "from-sky-950/50 via-zinc-900 to-black",
  },
  {
    id: "dutch-angle",
    name: "Dutch Tilt",
    category: "angle",
    description: "Canted camera horizon giving tension, disorientation, and stylistic energy.",
    promptTag: "canted dutch angle shot, tilted horizon",
    iconBg: "from-orange-900/60 to-zinc-900",
    previewGradient: "from-orange-950/50 via-zinc-900 to-black",
  },

  // Format & Lens
  {
    id: "anamorphic",
    name: "Anamorphic Lens",
    category: "format",
    description: "2.39:1 widescreen aesthetic with signature horizontal blue/gold lens flares and oval bokeh.",
    promptTag: "shot on anamorphic lens, 2.39:1 aspect, streak flares and oval bokeh",
    iconBg: "from-indigo-900/60 to-zinc-900",
    badge: "Lens",
    previewGradient: "from-indigo-950/50 via-zinc-900 to-black",
  },
  {
    id: "macro-35mm",
    name: "Macro Extreme Close-Up",
    category: "format",
    description: "Ultra-close focus on microscopic textures, water droplets, eyes, and materials.",
    promptTag: "macro lens extreme close-up, razor sharp micro details, shallow depth of field",
    iconBg: "from-teal-900/60 to-zinc-900",
    previewGradient: "from-teal-950/50 via-zinc-900 to-black",
  },
  {
    id: "fisheye",
    name: "180° Fisheye",
    category: "format",
    description: "Ultra-wide spherical barrel distortion for skate video / 90s music video vibe.",
    promptTag: "fisheye lens distortion, ultra wide curved barrel perspective",
    iconBg: "from-violet-900/60 to-zinc-900",
    previewGradient: "from-violet-950/50 via-zinc-900 to-black",
  },

  // Effect
  {
    id: "bullet-time",
    name: "Bullet Time",
    category: "effect",
    description: "Frozen time matrix effect with camera spinning around frozen debris or droplets.",
    promptTag: "bullet time frozen physics, rotating camera around frozen subject",
    iconBg: "from-emerald-900/60 to-zinc-900",
    badge: "VFX",
    previewGradient: "from-emerald-950/50 via-zinc-900 to-black",
  },
  {
    id: "slow-shutter",
    name: "Light Trails / Long Exposure",
    category: "effect",
    description: "Slow shutter motion blur creating glowing light trails from moving traffic and lights.",
    promptTag: "long exposure motion blur, luminous light trails, slow shutter",
    iconBg: "from-pink-900/60 to-zinc-900",
    previewGradient: "from-pink-950/50 via-zinc-900 to-black",
  },
  {
    id: "dolly-zoom",
    name: "Vertigo Dolly Zoom",
    category: "effect",
    description: "Simultaneous dolly-in and zoom-out causing the background to warp while subject stays still.",
    promptTag: "vertigo dolly zoom effect, zolly shot, background warping",
    iconBg: "from-red-900/60 to-zinc-900",
    badge: "Classic",
    previewGradient: "from-red-950/50 via-zinc-900 to-black",
  },
];

interface LumaMotionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: MotionPreset) => void;
  selectedPresetId?: string;
}

export function LumaMotionPopover({
  isOpen,
  onClose,
  onSelectPreset,
  selectedPresetId,
}: LumaMotionPopoverProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  if (!isOpen) return null;

  const categories = [
    { id: "all", label: "All" },
    { id: "motion", label: "Camera Motion" },
    { id: "angle", label: "Angles" },
    { id: "format", label: "Lenses" },
    { id: "effect", label: "VFX" },
  ];

  const filteredPresets = LUMA_MOTION_PRESETS.filter((preset) => {
    const matchesCategory = activeCategory === "all" || preset.category === activeCategory;
    const matchesSearch =
      preset.name.toLowerCase().includes(search.toLowerCase()) ||
      preset.description.toLowerCase().includes(search.toLowerCase()) ||
      preset.promptTag.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="absolute bottom-full left-0 mb-3 w-[360px] sm:w-[480px] max-w-[95vw] rounded-2xl p-4 shadow-2xl z-50 backdrop-blur-2xl"
      style={{
        background: "rgba(16, 17, 24, 0.96)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 24px 64px -12px rgba(0, 0, 0, 0.95), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">
            Camera & Motion Director
          </span>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={onClose}
          className="rounded-full text-zinc-400 hover:text-white h-7 w-7 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </motion.button>
      </div>

      {/* Search Input */}
      <div className="relative my-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search camera motion, angles, or lenses..."
          className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition-colors"
        />
      </div>

      {/* Category Filter Chips with HeroUI Chip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-2 no-scrollbar">
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            size="sm"
            variant={activeCategory === cat.id ? "primary" : "soft"}
            color={activeCategory === cat.id ? "accent" : "default"}
            className="cursor-pointer font-mono text-[10px] uppercase font-semibold"
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </Chip>
        ))}
      </div>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
        {filteredPresets.map((preset) => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <motion.button
              key={preset.id}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_PRESS}
              type="button"
              onClick={() => {
                onSelectPreset(preset);
                onClose();
              }}
              className={cn(
                "group relative rounded-xl border text-left transition-all duration-150 overflow-hidden cursor-pointer p-3 flex flex-col justify-between h-full",
                isSelected
                  ? "border-cyan-500 bg-gradient-to-br from-cyan-950/40 via-purple-950/30 to-black shadow-md shadow-cyan-500/20"
                  : "border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] hover:border-white/25 hover:from-white/10"
              )}
            >
              {/* Background gradient texture */}
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-br opacity-40 pointer-events-none",
                  preset.previewGradient
                )}
              />

              <div className="relative z-10 flex flex-col justify-between h-full w-full">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {preset.category === "motion" && <Move className="h-3.5 w-3.5 text-blue-400" />}
                      {preset.category === "angle" && <Eye className="h-3.5 w-3.5 text-amber-400" />}
                      {preset.category === "format" && <Camera className="h-3.5 w-3.5 text-emerald-400" />}
                      {preset.category === "effect" && <Sparkles className="h-3.5 w-3.5 text-purple-400" />}
                      {preset.category === "transition" && <Layers className="h-3.5 w-3.5 text-pink-400" />}
                      <span className="text-xs font-bold text-white tracking-tight">{preset.name}</span>
                    </div>

                    {preset.badge && (
                      <span className="rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[8px] font-mono h-4 px-1.5 flex items-center">
                        {preset.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-snug line-clamp-2">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-2.5 pt-1.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-cyan-400 truncate max-w-[100px]">
                    +{preset.promptTag.split(",")[0]}
                  </span>
                  {isSelected && <Check className="h-3 w-3 text-cyan-400" />}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
