"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  Search,
  Zap,
  Film,
  Cpu,
  Layers,
  X,
} from "lucide-react";
import type { StudioModelOption } from "@/lib/studio-constants";

interface StudioModelPickerProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  models: StudioModelOption[];
  disabled?: boolean;
}

export function CompanyLogo({ provider, className = "h-3.5 w-3.5" }: { provider: string; className?: string }) {
  switch (provider) {
    case "google":
    case "vertex":
      return (
        <svg className={className} viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
      );
    case "black-forest-labs":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" stroke="#60A5FA" strokeWidth="2" fill="rgba(96,165,250,0.2)" />
          <line x1="12" y1="2" x2="12" y2="22" stroke="#60A5FA" strokeWidth="1.5" />
        </svg>
      );
    case "stability-ai":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#A78BFA" strokeWidth="2" fill="rgba(167,139,250,0.15)" />
          <circle cx="9" cy="10" r="2" fill="#A78BFA" />
          <circle cx="15" cy="10" r="2" fill="#A78BFA" />
          <path d="M8 15 Q12 18 16 15" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "runway":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#F43F5E" />
          <path d="M7 6h5a3.5 3.5 0 0 1 3.5 3.5v0a3.5 3.5 0 0 1-3.5 3.5H7V6zm0 7h4l4 5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "alibaba":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#F97316" />
          <path d="M6 13c1.5-4 7-6 12-2-1 4-6 6-12 2z" fill="#FFFFFF" />
          <circle cx="15" cy="9" r="1.5" fill="#FFFFFF" />
        </svg>
      );
    case "lightricks":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#06B6D4" />
          <path d="M12 4l2.5 5.5L20 12l-5.5 2.5L12 20l-2.5-5.5L4 12l5.5-2.5L12 4z" fill="#FFFFFF" />
        </svg>
      );
    default:
      return (
        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-info/20 text-info font-bold text-[8px]">
          OD
        </div>
      );
  }
}

export function StudioModelPicker({
  selectedModel,
  onSelectModel,
  models,
  disabled = false,
}: StudioModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const popoverRef = useRef<HTMLDivElement | null>(null);

  const current = useMemo(
    () => models.find((m) => m.id === selectedModel) || models[0],
    [models, selectedModel]
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.tagline.toLowerCase().includes(search.toLowerCase()) ||
        m.companyName.toLowerCase().includes(search.toLowerCase()) ||
        (m.badge && m.badge.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;

      if (categoryFilter === "all") return true;
      if (categoryFilter === "google") return m.provider === "google" || m.family === "google";
      if (categoryFilter === "flux") return m.family === "flux";
      if (categoryFilter === "video") return m.category === "video";
      if (categoryFilter === "turbo") return m.speed === "realtime";
      if (categoryFilter === "sdxl") return m.family === "sdxl";
      return true;
    });
  }, [categoryFilter, models, search]);

  return (
    <div ref={popoverRef} className="relative inline-block text-left">
      {/* Pill Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`group flex h-7.5 items-center gap-2 rounded-lg px-2.5 text-[11px] font-medium transition-all duration-150 ${
          isOpen
            ? "bg-white/[0.12] text-white border border-info/50 shadow-sm shadow-info/20"
            : "bg-[var(--studio-elevated)] text-[var(--studio-ink)] hover:bg-white/[0.08] hover:text-white border border-[var(--studio-line)]"
        } disabled:opacity-40`}
      >
        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
          <CompanyLogo provider={current?.provider || "opendoor"} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{current?.name || "Select Model"}</span>
        </div>
        <ChevronDown
          className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : "group-hover:text-zinc-200"
          }`}
        />
      </button>

      {/* Floating Popover Modal */}
      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-2.5 z-50 w-[380px] sm:w-[460px] rounded-2xl border border-white/15 bg-[#121424]/95 p-3.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
          style={{
            boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.12), 0 24px 60px -10px rgba(0, 0, 0, 0.9)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-info/20 text-info border border-info/30">
                <Cpu className="h-3 w-3" />
              </div>
              <span className="text-[12px] font-semibold text-white tracking-tight">AI Foundation Models</span>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative mt-2.5 mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Google, Flux, Veo, checkpoints..."
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-8 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:border-info/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none">
            {[
              { id: "all", label: "All Models" },
              { id: "google", label: "Google DeepMind" },
              { id: "flux", label: "Flux 12B" },
              { id: "video", label: "Video Engines" },
              { id: "turbo", label: "Turbo Fast" },
              { id: "sdxl", label: "Stability AI" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all ${
                  categoryFilter === cat.id
                    ? "bg-info/20 text-info border border-info/40"
                    : "bg-white/[0.03] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] border border-transparent"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Models Scrollable List */}
          <div className="od-studio-scroll flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-0.5 pt-1">
            {filteredModels.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500 gap-1.5">
                <Layers className="h-6 w-6 opacity-30" />
                <span className="text-[11px]">No matching models found</span>
              </div>
            ) : (
              filteredModels.map((model) => {
                const isSelected = model.id === selectedModel;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(model.id);
                      setIsOpen(false);
                    }}
                    className={`group flex w-full flex-col rounded-xl p-2.5 text-left transition-all duration-150 ${
                      isSelected
                        ? "bg-info/15 border border-info/50 shadow-xs"
                        : "bg-black/30 hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/15"
                    }`}
                  >
                    {/* Top Row: Provider Logo + Name + Badges + Check */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/5 border border-white/10 p-0.5">
                          <CompanyLogo provider={model.provider} className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-mono uppercase tracking-wide text-zinc-500 truncate">
                            {model.companyName}
                          </span>
                          <span className="text-[12px] font-semibold text-white truncate">
                            {model.name}
                          </span>
                        </div>
                        {model.badge && (
                          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-mono font-medium text-info border border-white/10">
                            {model.badge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {model.speed === "realtime" && (
                          <span className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            <Zap className="h-2.5 w-2.5" />
                            <span>Realtime</span>
                          </span>
                        )}
                        {model.category === "video" && (
                          <span className="flex items-center gap-0.5 text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                            <Film className="h-2.5 w-2.5" />
                            <span>Video</span>
                          </span>
                        )}
                        {isSelected && (
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-info text-white">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tagline Description */}
                    <p className="mt-1 pl-7 text-[11px] font-normal leading-relaxed text-zinc-400 line-clamp-2">
                      {model.tagline}
                    </p>

                    {/* Footer: Company Name & Supported Aspect Ratios */}
                    <div className="mt-1.5 pl-7 flex items-center justify-between text-[9px] font-mono text-zinc-500">
                      <span className="text-zinc-400 font-medium">{model.companyName}</span>
                      <span>Aspects: {model.aspectRatios.join(", ")}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
