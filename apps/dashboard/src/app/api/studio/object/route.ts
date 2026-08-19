import { NextResponse } from "next/server";

export interface Product3DPreset {
  id: string;
  name: string;
  category: "electronics" | "footwear" | "furniture" | "vehicles" | "industrial" | "accessories";
  prompt: string;
  tag: string;
  primaryColor: string;
  secondaryColor: string;
  roughness: number;
  metalness: number;
  geometryType: "drone" | "sneaker" | "chair" | "watch" | "teapot" | "helmet" | "cylinder" | "box";
  polyCount: number;
  dimensions: string;
}

export const PRODUCT_3D_PRESETS: Product3DPreset[] = [
  {
    id: "quad-drone",
    name: "Carbon Stealth Quad-Drone",
    category: "vehicles",
    prompt: "Futuristic quadcopter drone with 4 carbon-fiber rotor arms, 4K gimbal camera, glowing cyan telemetry LEDs, and aerodynamic matte black fuselage",
    tag: "Aero · 4K Gimbal",
    primaryColor: "#18181b",
    secondaryColor: "#06b6d4",
    roughness: 0.25,
    metalness: 0.85,
    geometryType: "drone",
    polyCount: 48200,
    dimensions: "320 × 320 × 95 mm",
  },
  {
    id: "cyber-sneaker",
    name: "AeroPulse Cyber Sneaker",
    category: "footwear",
    prompt: "Ergonomic running sneaker with translucent air cushion midsole, breathable woven mesh upper in vibrant neon fuchsia, and metallic silver support cage",
    tag: "Footwear · Air Sole",
    primaryColor: "#d946ef",
    secondaryColor: "#e2e8f0",
    roughness: 0.45,
    metalness: 0.35,
    geometryType: "sneaker",
    polyCount: 62400,
    dimensions: "295 × 110 × 140 mm",
  },
  {
    id: "scandi-chair",
    name: "Nordic Minimalist Armchair",
    category: "furniture",
    prompt: "Scandinavian lounge chair with curved steam-bent oak frame, rich textured oatmeal bouclé upholstery, and brushed brass feet caps",
    tag: "Furniture · Oak & Bouclé",
    primaryColor: "#f5f5f4",
    secondaryColor: "#78350f",
    roughness: 0.8,
    metalness: 0.1,
    geometryType: "chair",
    polyCount: 36800,
    dimensions: "780 × 820 × 740 mm",
  },
  {
    id: "chrono-watch",
    name: "Apex Chronograph Smartwatch",
    category: "accessories",
    prompt: "Luxury titanium smartwatch with sapphire crystal domed lens, dual-dial digital tachymeter, knurled rotating crown, and fluoroelastomer strap",
    tag: "Watch · Titanium",
    primaryColor: "#3f3f46",
    secondaryColor: "#38bdf8",
    roughness: 0.15,
    metalness: 0.95,
    geometryType: "watch",
    polyCount: 54100,
    dimensions: "44 × 44 × 12 mm",
  },
  {
    id: "ceramic-teapot",
    name: "Zen Matte Ceramic Pour-Over",
    category: "industrial",
    prompt: "Japanese minimalist ceramic pour-over kettle with ergonomic carved walnut handle, gooseneck precision spout, and tactile charcoal glaze finish",
    tag: "Ceramics · Walnut",
    primaryColor: "#27272a",
    secondaryColor: "#92400e",
    roughness: 0.65,
    metalness: 0.05,
    geometryType: "teapot",
    polyCount: 29500,
    dimensions: "240 × 130 × 165 mm",
  },
  {
    id: "cyber-helmet",
    name: "Neo-Tokyo Visor Helmet",
    category: "electronics",
    prompt: "Cyberpunk motorcycle helmet with magnetic HUD visor, integrated air filtration ports, carbon composite shell, and iridescent gold chrome shield",
    tag: "HUD · Carbon Shell",
    primaryColor: "#09090b",
    secondaryColor: "#eab308",
    roughness: 0.2,
    metalness: 0.8,
    geometryType: "helmet",
    polyCount: 71200,
    dimensions: "350 × 260 × 280 mm",
  },
];

export async function GET() {
  return NextResponse.json({
    presets: PRODUCT_3D_PRESETS,
    engines: [
      { id: "opendoor-shap-e-3d", name: "OpenDoor 3D Mesh Engine (GLB/OBJ)", supportedFormats: ["obj", "glb", "stl"] },
      { id: "meshy-4-product", name: "Meshy-4 Product Studio (Photoreal)", supportedFormats: ["obj", "glb", "fbx", "usdz"] },
    ],
  });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let prompt = "";
    let model = "opendoor-shap-e-3d";
    let presetId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      prompt = String(form.get("prompt") || "");
      model = String(form.get("model") || "opendoor-shap-e-3d");
      presetId = form.get("presetId") ? String(form.get("presetId")) : null;
    } else {
      const json = await req.json().catch(() => ({}));
      prompt = json.prompt || "";
      model = json.model || "opendoor-shap-e-3d";
      presetId = json.presetId || null;
    }

    const trimmed = prompt.trim();
    const matchedPreset = presetId
      ? PRODUCT_3D_PRESETS.find((p) => p.id === presetId)
      : PRODUCT_3D_PRESETS.find((p) =>
          trimmed.toLowerCase().includes(p.name.toLowerCase()) ||
          trimmed.toLowerCase().includes(p.geometryType)
        ) || PRODUCT_3D_PRESETS[0];

    // Determine colors & materials from prompt keywords
    const isGold = /gold|brass|amber|yellow/i.test(trimmed);
    const isCyan = /cyan|neon|blue|azure/i.test(trimmed);
    const isEmerald = /emerald|green|forest|teal/i.test(trimmed);
    const isPink = /pink|fuchsia|purple|magenta/i.test(trimmed);
    const isWhite = /white|silver|ceramic|light/i.test(trimmed);
    const isMetallic = /metal|chrome|titanium|carbon|steel|copper/i.test(trimmed);

    const primaryColor = isWhite
      ? "#f4f4f5"
      : isCyan
        ? "#083344"
        : isEmerald
          ? "#022c22"
          : isPink
            ? "#500724"
            : matchedPreset?.primaryColor || "#18181b";

    const accentColor = isGold
      ? "#eab308"
      : isCyan
        ? "#06b6d4"
        : isEmerald
          ? "#10b981"
          : isPink
            ? "#ec4899"
            : matchedPreset?.secondaryColor || "#38bdf8";

    const objectResult = {
      id: `3d-obj-${Date.now()}`,
      name: (trimmed.split(/[,.]/)[0] || matchedPreset?.name || "3D Product").toUpperCase().slice(0, 36),
      prompt: trimmed || matchedPreset?.prompt,
      model,
      geometryType: matchedPreset?.geometryType || "drone",
      primaryColor,
      secondaryColor: accentColor,
      roughness: isMetallic ? 0.2 : 0.6,
      metalness: isMetallic ? 0.9 : 0.2,
      polyCount: Math.floor(35000 + Math.random() * 30000),
      dimensions: matchedPreset?.dimensions || "300 × 300 × 120 mm",
      format: "glb",
      timestamp: Date.now(),
      specs: {
        topology: "Quad-dominant watertight mesh",
        materials: ["PBR Albedo", "Roughness/Metallic Map", "Normal Map (OpenGL)", "Ambient Occlusion"],
        scale: "1:1 Metric",
      },
    };

    return NextResponse.json(objectResult);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate 3D object" },
      { status: 500 }
    );
  }
}
