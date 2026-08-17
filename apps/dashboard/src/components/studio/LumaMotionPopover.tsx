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
import { Chip, Button, Card, CardContent } from "@heroui/react";
import { cn } from "@/lib/utils";

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
    description: "Expansive pull-back revealing surrounding landscape and environmental scale.",
    promptTag: "camera pulls back, smooth zoom out landscape reveal",
    iconBg: "from-purple-900/60 to-zinc-900",
    previewGradient: "from-purple-950/50 via-zinc-900 to-black",
  },
  {
    id: "pan-left",
    name: "Pan Left",
    category: "motion",
    description: "Horizontal camera pan sweeping from right to left across the horizon.",
    promptTag: "camera pans left smoothly across horizon",
    iconBg: "from-indigo-900/60 to-zinc-900",
    previewGradient: "from-indigo-950/50 via-zinc-900 to-black",
  },
  {
    id: "pan-right",
    name: "Pan Right",
    category: "motion",
    description: "Horizontal camera pan sweeping from left to right across the horizon.",
    promptTag: "camera pans right smoothly across horizon",
    iconBg: "from-indigo-900/60 to-zinc-900",
    previewGradient: "from-indigo-950/50 via-zinc-900 to-black",
  },
  {
    id: "orbit-360",
    name: "Orbit 360",
    category: "motion",
    description: "Full circular 360-degree rotational orbit around the central focal subject.",
    promptTag: "360 degree rotational orbit camera around subject",
    iconBg: "from-cyan-900/60 to-zinc-900",
    badge: "Dynamic",
    previewGradient: "from-cyan-950/50 via-zinc-900 to-black",
  },
  {
    id: "crane-up",
    name: "Crane Up",
    category: "motion",
    description: "Vertical crane rise ascending upwards to an elevated god's eye view.",
    promptTag: "crane shot ascends vertically upwards, rising camera",
    iconBg: "from-emerald-900/60 to-zinc-900",
    previewGradient: "from-emerald-950/50 via-zinc-900 to-black",
  },

  // Angle
  {
    id: "low-angle",
    name: "Low Angle",
    category: "angle",
    description: "Camera positioned low looking upwards, granting grandeur and heroic stature.",
    promptTag: "low angle shot looking upwards, towering heroic perspective",
    iconBg: "from-amber-900/60 to-zinc-900",
    previewGradient: "from-amber-950/50 via-zinc-900 to-black",
  },
  {
    id: "high-angle",
    name: "High Angle",
    category: "angle",
    description: "Camera placed high looking down on the subject, highlighting scale.",
    promptTag: "high angle shot looking down, overview perspective",
    iconBg: "from-orange-900/60 to-zinc-900",
    previewGradient: "from-orange-950/50 via-zinc-900 to-black",
  },
  {
    id: "aerial-drone",
    name: "Aerial Drone",
    category: "angle",
    description: "Sweeping high-altitude FPV drone cinematography capturing entire environment.",
    promptTag: "aerial drone cinematography, sweeping bird's-eye view, FPV flyover",
    iconBg: "from-teal-900/60 to-zinc-900",
    badge: "Cinematic",
    previewGradient: "from-teal-950/50 via-zinc-900 to-black",
  },
  {
    id: "ground-level",
    name: "Ground Level",
    category: "angle",
    description: "Extreme close-to-earth perspective gliding directly above the terrain.",
    promptTag: "ground level macro perspective, skimming just above the surface",
    iconBg: "from-stone-900/60 to-zinc-900",
    previewGradient: "from-stone-950/50 via-zinc-900 to-black",
  },

  // Format
  {
    id: "anamorphic",
    name: "2.39:1 Anamorphic",
    category: "format",
    description: "Wide widescreen format with horizontal lens flares and soft oval bokeh.",
    promptTag: "shot on 35mm anamorphic lens, 2.39:1 aspect ratio, oval bokeh, subtle blue streak lens flares",
    iconBg: "from-sky-900/60 to-zinc-900",
    badge: "Film",
    previewGradient: "from-sky-950/50 via-zinc-900 to-black",
  },
  {
    id: "imax-70mm",
    name: "IMAX 70mm",
    category: "format",
    description: "Ultra-crisp 70mm film format with hyper-realistic detail and deep dynamic range.",
    promptTag: "shot on 70mm IMAX film, ultra high resolution, breathtaking depth of field, photorealistic",
    iconBg: "from-violet-900/60 to-zinc-900",
    previewGradient: "from-violet-950/50 via-zinc-900 to-black",
  },

  // Effect
  {
    id: "slow-motion",
    name: "120fps Slow Mo",
    category: "effect",
    description: "Ultra-high framerate slow motion rendering fluid micro-details and motion droplets.",
    promptTag: "120fps ultra slow motion, fluid dynamic motion, high framerate capture",
    iconBg: "from-fuchsia-900/60 to-zinc-900",
    badge: "120fps",
    previewGradient: "from-fuchsia-950/50 via-zinc-900 to-black",
  },
  {
    id: "hyperlapse",
    name: "Hyperlapse",
    category: "effect",
    description: "Accelerated motion through time and space with seamless moving camera.",
    promptTag: "cinematic hyperlapse, moving camera timelapse, fast forward time flow",
    iconBg: "from-rose-900/60 to-zinc-900",
    previewGradient: "from-rose-950/50 via-zinc-900 to-black",
  },
];

interface LumaMotionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: MotionPreset) => void;
  selectedPresetId?: string | null;
}

export function LumaMotionPopover({
  isOpen,
  onClose,
  onSelectPreset,
  selectedPresetId,
}: LumaMotionPopoverProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  if (!isOpen) return null;

  const categories = [
    { id: "all", label: "All" },
    { id: "motion", label: "Motion" },
    { id: "angle", label: "Angle" },
    { id: "format", label: "Format" },
    { id: "effect", label: "Effect" },
  ];

  const filteredPresets = LUMA_MOTION_PRESETS.filter((p) => {
    const matchesCategory = activeCategory === "all" || p.category === activeCategory;
    const matchesSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div
      className="absolute bottom-full left-0 mb-3 w-[360px] sm:w-[480px] max-w-[95vw] rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
      style={{
        background: "rgba(16, 17, 24, 0.94)",
        backdropFilter: "blur(32px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.9), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">
            Camera & Motion Director
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onPress={onClose}
          className="rounded-full text-zinc-400 hover:text-white h-7 w-7 min-w-7 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative my-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search camera motion, angles, or lenses..."
          className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
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

      {/* Preset Cards Grid with HeroUI Card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
        {filteredPresets.map((preset) => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <Card
              key={preset.id}
              onClick={() => {
                onSelectPreset(preset);
                onClose();
              }}
              className={cn(
                "group relative border text-left transition-all duration-150 overflow-hidden cursor-pointer",
                isSelected
                  ? "border-indigo-500 bg-gradient-to-br from-indigo-950/60 via-purple-950/30 to-black shadow-md shadow-indigo-500/20"
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

              <CardContent className="p-3 relative z-10 flex flex-col justify-between h-full">
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
                      <Chip size="sm" variant="soft" color="accent" className="text-[8px] h-4 px-1">
                        {preset.badge}
                      </Chip>
                    )}
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-snug line-clamp-2">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-2.5 pt-1.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-indigo-300 truncate max-w-[100px]">
                    {preset.promptTag.split(",")[0]}
                  </span>
                  {isSelected && <Check className="h-3 w-3 text-indigo-400 shrink-0" />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
