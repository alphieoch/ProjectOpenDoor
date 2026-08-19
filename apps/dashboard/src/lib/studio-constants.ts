export type StudioTool = "txt2img" | "img2img" | "txt2vid" | "img2vid" | "v2v" | "nodes" | "txt2obj" | "sound_fx";
export type StudioResolution = "low" | "medium" | "high";
export type StudioModelTier = "basic" | "medium" | "high" | "max";

export interface StudioModelOption {
  id: string;
  name: string;
  category: "image" | "video" | "enhance" | "3d" | "sound";
  family?: "flux" | "sdxl" | "video" | "google" | "vertex" | "custom" | "3d-mesh" | "audio";
  speed?: "realtime" | "fast" | "standard" | "high-quality";
  badge?: string;
  tagline: string;
  provider: "opendoor" | "google" | "vertex" | "black-forest-labs" | "stability-ai" | "runway" | "alibaba" | "lightricks" | "openai" | "private-gpu";
  companyName: string;
  aspectRatios: string[];
  maxDuration?: number;
  supportsMotionBrush?: boolean;
  supportsCameraControl?: boolean;
  isAvailable?: boolean;
}

export const OPENDOOR_STUDIO_MODELS: StudioModelOption[] = [
  // ── Google DeepMind Models (Vertex AI) ──────────────────────────────────
  {
    id: "gemini-3.1-flash-image",
    name: "Nano Banana",
    category: "image",
    family: "google",
    speed: "fast",
    badge: "Gemini 3.1 Flash Image",
    tagline: "Google's current Nano Banana model. Fast native Gemini stills, clean text, and reference edits up to 4K.",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "21:9"],
    isAvailable: true,
  },
  {
    id: "gemini-3-pro-image",
    name: "Nano Banana Pro",
    category: "image",
    family: "google",
    speed: "high-quality",
    badge: "Gemini 3 Pro Image",
    tagline: "Higher-fidelity Nano Banana for production 2K/4K stills and tighter subject consistency.",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "21:9"],
    isAvailable: true,
  },
  {
    id: "google-imagen-3",
    name: "Google Imagen 3 (Ultra 8K)",
    category: "image",
    family: "google",
    speed: "high-quality",
    badge: "Google Imagen 3",
    tagline: "Google DeepMind's flagship image generation model with exceptional photorealism, fine details, and clear typography rendering",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    isAvailable: true,
  },
  {
    id: "google-imagen-3-fast",
    name: "Google Imagen 3 Fast",
    category: "image",
    family: "google",
    speed: "realtime",
    badge: "Google Fast",
    tagline: "High-throughput low-latency version of Imagen 3 for real-time interactive generation and rapid iterations",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    isAvailable: true,
  },
  {
    id: "opendoor-imagen-ultra",
    name: "OpenDoor Ultra Photoreal (8K)",
    category: "image",
    family: "google",
    speed: "high-quality",
    badge: "Photoreal 8K",
    tagline: "Photorealistic 8K fidelity, micro-texture typography & scene composition powered by Google Imagen 3",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    isAvailable: true,
  },
  {
    id: "veo-3.1-fast-generate-001",
    name: "Veo 3.1 Fast",
    category: "video",
    family: "google",
    speed: "fast",
    badge: "Google Veo 3.1 Fast",
    tagline: "Google DeepMind's current Veo model for prompt-accurate clips with camera motion and physics.",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDuration: 8,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },
  {
    id: "veo-3.1-generate-001",
    name: "Veo 3.1",
    category: "video",
    family: "google",
    speed: "high-quality",
    badge: "Google Veo 3.1",
    tagline: "Higher-fidelity Veo for cinematic text-to-video and image-to-video on Vertex.",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDuration: 8,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },
  {
    id: "google-veo-2",
    name: "Google Veo 2 (Cinematic Video)",
    category: "video",
    family: "google",
    speed: "high-quality",
    badge: "Routes to Veo 3.1",
    tagline: "Studio label for cinematic Veo. This project runs it as Veo 3.1 on Vertex.",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDuration: 8,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },
  {
    id: "opendoor-veo-cinematic",
    name: "OpenDoor Veo Cinematic (Vertex Video)",
    category: "video",
    family: "google",
    speed: "high-quality",
    badge: "1080p Coherent",
    tagline: "High-definition temporal coherence with direct camera trajectory control powered by Google Veo",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["16:9", "9:16"],
    maxDuration: 8,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },

  // ── Black Forest Labs (Flux Lineup) ──────────────────────────────────────
  {
    id: "opendoor-flux-canvas",
    name: "OpenDoor Flux Canvas v2",
    category: "image",
    family: "flux",
    speed: "realtime",
    badge: "Interactive SOTA",
    tagline: "Sub-second real-time interactive generation & live brush synthesis",
    provider: "black-forest-labs",
    companyName: "Black Forest Labs",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2", "21:9"],
    isAvailable: true,
  },
  {
    id: "flux-1-schnell",
    name: "Flux.1 Schnell (Turbo)",
    category: "image",
    family: "flux",
    speed: "realtime",
    badge: "4-Step Ultra Fast",
    tagline: "Ultra-fast 4-step diffusion distillation for instant high-quality drafts",
    provider: "black-forest-labs",
    companyName: "Black Forest Labs",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2"],
    isAvailable: true,
  },
  {
    id: "flux-1-dev",
    name: "Flux.1 Dev (Pro 12B)",
    category: "image",
    family: "flux",
    speed: "high-quality",
    badge: "12B SOTA Quality",
    tagline: "12-billion parameter flagship model with extreme prompt adherence and typography",
    provider: "black-forest-labs",
    companyName: "Black Forest Labs",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2", "21:9"],
    isAvailable: true,
  },

  // ── Stability AI Models ──────────────────────────────────────────────────
  {
    id: "sdxl-realvis-v5",
    name: "RealVisXL V5.0 Photoreal",
    category: "image",
    family: "sdxl",
    speed: "fast",
    badge: "Skin & Architecture",
    tagline: "Specialized for realistic human portraits, natural lighting, and architectural scenes",
    provider: "stability-ai",
    companyName: "Stability AI",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2"],
    isAvailable: true,
  },
  {
    id: "dreamshaper-xl",
    name: "DreamShaper XL (Cinematic)",
    category: "image",
    family: "sdxl",
    speed: "fast",
    badge: "Cinematic Art",
    tagline: "Richly stylized art, fantasy aesthetics, and dramatic cinematic lighting",
    provider: "stability-ai",
    companyName: "Stability AI",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3"],
    isAvailable: true,
  },
  {
    id: "animatediff-v3",
    name: "AnimateDiff V3 Motion Module",
    category: "video",
    family: "video",
    speed: "fast",
    badge: "Motion Module",
    tagline: "Temporal motion adapter for styling and transforming images into looping video",
    provider: "stability-ai",
    companyName: "Stability AI",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3"],
    maxDuration: 6,
    isAvailable: true,
  },

  // ── Runway Models ────────────────────────────────────────────────────────
  {
    id: "opendoor-runway-motion-v3",
    name: "OpenDoor Motion Director (Runway Engine)",
    category: "video",
    family: "video",
    speed: "standard",
    badge: "Motion Director",
    tagline: "Multi-zone motion brush with 6-axis camera navigation & cinematic frame rate",
    provider: "runway",
    companyName: "Runway",
    aspectRatios: ["16:9", "9:16", "1:1", "21:9"],
    maxDuration: 16,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },

  // ── Luma AI Models ───────────────────────────────────────────────────────
  {
    id: "luma-dream-machine",
    name: "Luma Dream Machine 1.5 (Ray 2)",
    category: "video",
    family: "video",
    speed: "high-quality",
    badge: "Luma Dream Machine",
    tagline: "Dream Machine-style motion. On this platform it runs through Google Veo 3.1 Fast, not a placeholder clip.",
    provider: "opendoor",
    companyName: "Luma AI",
    aspectRatios: ["16:9", "9:16", "1:1", "21:9", "4:3"],
    maxDuration: 14,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },

  // ── Alibaba Wan Team ─────────────────────────────────────────────────────
  {
    id: "wan-2-1-video",
    name: "Wan 2.1 Video (Open SOTA)",
    category: "video",
    family: "video",
    speed: "standard",
    badge: "Open SOTA Video",
    tagline: "State-of-the-art text-to-video & image-to-video with natural fluid physics",
    provider: "alibaba",
    companyName: "Alibaba Cloud",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDuration: 10,
    supportsMotionBrush: true,
    supportsCameraControl: true,
    isAvailable: true,
  },

  // ── Lightricks Models ────────────────────────────────────────────────────
  {
    id: "ltx-video-fast",
    name: "LTX-Video Realtime (24fps)",
    category: "video",
    family: "video",
    speed: "realtime",
    badge: "Fast 24fps",
    tagline: "High-framerate real-time video generation with prompt-following motion",
    provider: "lightricks",
    companyName: "Lightricks",
    aspectRatios: ["16:9", "9:16"],
    maxDuration: 8,
    isAvailable: true,
  },

  // ── OpenDoor Enhancement ─────────────────────────────────────────────────
  {
    id: "opendoor-krea-enhance-4k",
    name: "OpenDoor 4K Enhancer (Krea Pipeline)",
    category: "enhance",
    family: "custom",
    speed: "fast",
    badge: "4K Super-Res",
    tagline: "Deep detail magnification, face recovery, and texture synthesis up to 8K",
    provider: "opendoor",
    companyName: "OpenDoor Studio",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3"],
    isAvailable: true,
  },

  // ── 3D Object & Product Synthesis Models ──────────────────────────────────
  {
    id: "opendoor-shap-e-3d",
    name: "OpenDoor 3D Mesh Engine (GLB/OBJ)",
    category: "3d",
    family: "3d-mesh",
    speed: "fast",
    badge: "PBR 3D",
    tagline: "High-topology 3D object generator with procedural PBR materials and instant mesh export",
    provider: "opendoor",
    companyName: "OpenDoor 3D Labs",
    aspectRatios: ["1:1", "16:9", "9:16"],
    isAvailable: true,
  },
  {
    id: "meshy-4-product",
    name: "Meshy-4 Product Studio (Photoreal)",
    category: "3d",
    family: "3d-mesh",
    speed: "high-quality",
    badge: "Industrial 3D",
    tagline: "Industrial design and product geometry synthesizer with clean quad topology and 4K textures",
    provider: "private-gpu",
    companyName: "Meshy Studio",
    aspectRatios: ["1:1", "16:9"],
    isAvailable: true,
  },

  // ── Sound & Audio Synthesis Models ───────────────────────────────────────
  {
    id: "opendoor-cinematic-sfx",
    name: "OpenDoor Cinematic Audio & Foley Engine",
    category: "sound",
    family: "audio",
    speed: "fast",
    badge: "Cinema SFX",
    tagline: "High-fidelity Foley sound effects, immersive soundscapes, and cinematic musical ambience synthesis",
    provider: "opendoor",
    companyName: "OpenDoor Audio Labs",
    aspectRatios: ["1:1"],
    isAvailable: true,
  },
  {
    id: "elevenlabs-sound-fx",
    name: "ElevenLabs Sound Effects v2",
    category: "sound",
    family: "audio",
    speed: "realtime",
    badge: "Realtime SFX",
    tagline: "Ultra-realistic sound effects and environmental audio cues from text descriptions",
    provider: "private-gpu",
    companyName: "ElevenLabs",
    aspectRatios: ["1:1"],
    isAvailable: true,
  },
  {
    id: "google-audiolm-fx",
    name: "Google AudioLM Studio Ambience",
    category: "sound",
    family: "google",
    speed: "high-quality",
    badge: "AudioLM",
    tagline: "Google's audio synthesis model for coherent acoustic environments, spatial sound, and Foley",
    provider: "google",
    companyName: "Google DeepMind",
    aspectRatios: ["1:1"],
    isAvailable: true,
  },
];

export const STUDIO_MODEL_TIER_OPTIONS: { id: StudioModelTier | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "basic", label: "Basic" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
];

export const STUDIO_PROVIDER_LABELS: Record<StudioModelOption["provider"], string> = {
  google: "Google",
  vertex: "Google",
  "black-forest-labs": "Black Forest",
  "stability-ai": "Stability",
  runway: "Runway",
  alibaba: "Alibaba",
  lightricks: "Lightricks",
  opendoor: "OpenDoor",
  openai: "OpenAI",
  "private-gpu": "Private GPU",
};

export function getStudioModelTier(model: StudioModelOption): StudioModelTier {
  if (model.speed === "realtime") return "basic";
  if (model.speed === "fast") return "medium";
  if (model.speed === "standard") return "high";
  return "max";
}

export function getStudioProviderLabel(provider: StudioModelOption["provider"]): string {
  return STUDIO_PROVIDER_LABELS[provider] || provider;
}

export function getModelsForTool(tool: StudioTool, models: StudioModelOption[] = OPENDOOR_STUDIO_MODELS): StudioModelOption[] {
  if (tool === "txt2vid" || tool === "img2vid" || tool === "v2v") {
    return models.filter((m) => m.category === "video");
  }
  if (tool === "txt2obj") {
    return models.filter((m) => m.category === "3d");
  }
  if (tool === "sound_fx") {
    return models.filter((m) => m.category === "sound");
  }
  // txt2img, img2img, nodes
  return models.filter((m) => m.category === "image" || m.category === "enhance");
}

export function getDefaultModelForTool(tool: StudioTool): string {
  if (tool === "txt2vid" || tool === "img2vid" || tool === "v2v") {
    return "veo-3.1-fast-generate-001";
  }
  if (tool === "txt2obj") {
    return "opendoor-shap-e-3d";
  }
  if (tool === "sound_fx") {
    return "opendoor-cinematic-sfx";
  }
  return "gemini-3.1-flash-image";
}

export function resolveStudioApiModel(modelId: string): string {
  const aliases: Record<string, string> = {
    "nano-banana": "gemini-3.1-flash-image",
    "nano-banana-2": "gemini-3.1-flash-image",
    "google-nano-banana": "gemini-3.1-flash-image",
    "gemini-2.5-flash-image": "gemini-3.1-flash-image",
    "gemini-3.1-flash-image-preview": "gemini-3.1-flash-image",
    "nano-banana-pro": "gemini-3-pro-image",
    "gemini-3-pro-image-preview": "gemini-3-pro-image",
  };
  return aliases[modelId] || modelId;
}

export function resolveStudioVideoModel(modelId: string): string {
  const aliases: Record<string, string> = {
    "luma-dream-machine": "veo-3.1-fast-generate-001",
    "google-veo-2": "veo-3.1-generate-001",
    "opendoor-veo-cinematic": "veo-3.1-generate-001",
    "wan-2-1-video": "veo-3.1-fast-generate-001",
    "ltx-video-fast": "veo-3.1-fast-generate-001",
    "animatediff-v3": "veo-3.1-fast-generate-001",
    "opendoor-runway-motion-v3": "veo-3.1-fast-generate-001",
    "veo-3.1-fast": "veo-3.1-fast-generate-001",
    "veo-3.1": "veo-3.1-generate-001",
  };
  return aliases[modelId] || modelId;
}

export function isGoogleStudioImageModel(modelId: string): boolean {
  return /gemini-.*-image|imagen/i.test(resolveStudioApiModel(modelId));
}

export function resolutionToGeminiSize(resolution: StudioResolution): "1K" | "2K" | "4K" {
  if (resolution === "high") return "4K";
  if (resolution === "medium") return "2K";
  return "1K";
}

export function resolutionToVideoLabel(resolution: StudioResolution): "720p" | "1080p" | "4k" {
  if (resolution === "high") return "4k";
  if (resolution === "medium") return "1080p";
  return "720p";
}

export const STUDIO_RESOLUTION_OPTIONS: { id: StudioResolution; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export const STUDIO_VIDEO_DURATION_MIN = 4;
export const STUDIO_VIDEO_DURATION_MAX = 8;
export const STUDIO_VIDEO_DURATIONS = [4, 6, 8] as const;
export type StudioVideoDuration = (typeof STUDIO_VIDEO_DURATIONS)[number];

export function clampStudioVideoDuration(raw: unknown): StudioVideoDuration {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 6;
  const clamped = Math.min(STUDIO_VIDEO_DURATION_MAX, Math.max(STUDIO_VIDEO_DURATION_MIN, n));
  if (clamped < 5) return 4;
  if (clamped < 7) return 6;
  return 8;
}

export function previewStudioVideoDuration(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 6;
  return Math.round(Math.min(STUDIO_VIDEO_DURATION_MAX, Math.max(STUDIO_VIDEO_DURATION_MIN, n)) * 10) / 10;
}

export function studioErrorMessage(payload: unknown, fallback = "Generation failed"): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as Record<string, unknown>;
  if (typeof row.error === "string" && row.error.trim()) return row.error;
  if (row.error && typeof row.error === "object") {
    const nested = row.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
  }
  if (typeof row.message === "string" && row.message.trim()) return row.message;
  return fallback;
}

export function sizeFromAspectAndResolution(aspectRatio: string, resolution: StudioResolution): string {
  const longEdge = resolution === "high" ? 2160 : resolution === "medium" ? 1080 : 720;
  const [aw, ah] = String(aspectRatio || "1:1").split(":").map(Number);
  if (!aw || !ah) return `${longEdge}x${longEdge}`;
  if (aw >= ah) {
    return `${longEdge}x${Math.max(1, Math.round((longEdge * ah) / aw))}`;
  }
  return `${Math.max(1, Math.round((longEdge * aw) / ah))}x${longEdge}`;
}

export const STYLE_PRESETS = [
  {
    id: "none",
    name: "None (Raw Prompt)",
    icon: "Sparkles",
    promptSuffix: "",
    previewGradient: "from-zinc-700 to-zinc-900",
  },
  {
    id: "photorealistic",
    name: "Photorealistic 8K",
    icon: "Camera",
    promptSuffix: ", highly detailed photograph, 85mm f/1.4 lens, natural lighting, ultra-realistic texture, 8k resolution, award winning photography",
    previewGradient: "from-amber-600/30 to-amber-900/40",
  },
  {
    id: "cinematic",
    name: "Cinematic Film",
    icon: "Film",
    promptSuffix: ", cinematic movie still, 35mm anamorphic lens, shallow depth of field, dramatic color grading, atmospheric haze, moody lighting, Panavision",
    previewGradient: "from-blue-600/30 to-indigo-950/60",
  },
  {
    id: "anime",
    name: "Anime / Studio Ghibli",
    icon: "Palette",
    promptSuffix: ", master anime key visual, Makoto Shinkai and Studio Ghibli style, vibrant colors, lush environmental details, soft emotional lighting, cell shaded",
    previewGradient: "from-pink-600/30 to-rose-950/60",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk / Sci-Fi",
    icon: "Zap",
    promptSuffix: ", futuristic cyberpunk aesthetic, neon volumetric lighting, chrome reflections, wet asphalt, hologram interface, intricate technological detailing",
    previewGradient: "from-cyan-500/30 to-purple-950/60",
  },
  {
    id: "unreal-3d",
    name: "3D Render / Unreal 5",
    icon: "Layers",
    promptSuffix: ", Unreal Engine 5 render, Octane render, ray tracing, subsurface scattering, ambient occlusion, hyper-detailed materials, 8k CGI masterpiece",
    previewGradient: "from-emerald-600/30 to-teal-950/60",
  },
  {
    id: "architecture",
    name: "Architectural Digest",
    icon: "Home",
    promptSuffix: ", architectural photography, modern minimalist design, clean lines, brutalist concrete and warm cedar wood, floor-to-ceiling glass, golden hour sunlight",
    previewGradient: "from-orange-500/30 to-stone-900/60",
  },
  {
    id: "dark-fantasy",
    name: "Dark Fantasy / Elden",
    icon: "Flame",
    promptSuffix: ", dark fantasy concept art, mystical fog, ancient ominous ruins, ethereal glowing magic runes, oil painting texture, moody grimdark atmosphere",
    previewGradient: "from-red-600/30 to-zinc-950/80",
  },
  {
    id: "watercolor",
    name: "Artistic Watercolor",
    icon: "Brush",
    promptSuffix: ", expressive watercolor and ink wash painting, fluid color bleed, textured cold-press paper grain, delicate splatters, evocative impressionist style",
    previewGradient: "from-sky-500/30 to-violet-950/50",
  },
];
