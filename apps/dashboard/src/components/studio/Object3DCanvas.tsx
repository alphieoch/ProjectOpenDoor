"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Box,
  Rotate3d,
  Upload,
  ChevronRight,
  Package,
  Sparkles,
  Ruler,
  Grid3x3,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { PRODUCT_3D_PRESETS } from "@/app/api/studio/object/route";

type DimAxis = "all" | "w" | "d" | "h";
type Vec3 = { x: number; y: number; z: number };
type Vec2 = { x: number; y: number; z: number };

function parseProductDimensions(raw: string) {
  const nums = [...(raw.match(/\d+(?:\.\d+)?/g) ?? [])].map(Number);
  const unit = raw.match(/mm|cm|in\b/i)?.[0] ?? "mm";
  return {
    width: nums[0] ?? 300,
    depth: nums[1] ?? nums[0] ?? 300,
    height: nums[2] ?? 120,
    unit,
  };
}

const VIEW_ANGLES = [
  { id: "front", label: "Front", x: 8, y: 0 },
  { id: "side", label: "Side", x: 8, y: 90 },
  { id: "top", label: "Top", x: 84, y: 0 },
  { id: "three-quarter", label: "3/4", x: 25, y: 45 },
] as const;

function getModelExtents(geometryType: string) {
  switch (geometryType) {
    case "drone":
      return { w: 1.05, h: 0.28, d: 1.05 };
    case "watch":
      return { w: 0.82, h: 0.16, d: 0.82 };
    case "sneaker":
      return { w: 1.05, h: 0.42, d: 0.38 };
    case "chair":
      return { w: 0.9, h: 1.05, d: 0.88 };
    default:
      return { w: 0.75, h: 0.85, d: 0.75 };
  }
}

export interface Object3DData {
  id: string;
  name: string;
  prompt: string;
  model: string;
  geometryType: string;
  primaryColor: string;
  secondaryColor: string;
  roughness: number;
  metalness: number;
  polyCount: number;
  dimensions: string;
  format?: string;
  specs?: {
    topology: string;
    materials: string[];
    scale: string;
  };
}

export interface Object3DCanvasHandle {
  importFile: (file: File) => void;
  openImport: () => void;
  snapshot: () => void;
  exportObj: () => void;
  remix2d: () => void;
  animateVideo: () => void;
}

interface Object3DCanvasProps {
  initialObject?: Object3DData | null;
  isGenerating?: boolean;
  showBlueprint?: boolean;
  showDimensions?: boolean;
  onToggleBlueprint?: () => void;
  onToggleDimensions?: () => void;
  onSendToVideo?: (objectData: Object3DData, snapshotUrl: string) => void;
  onSendToImageRemix?: (snapshotUrl: string) => void;
  onPromptSelect?: (prompt: string) => void;
  onObjectChange?: (object: Object3DData) => void;
}

type RenderStyle = "pbr" | "wireframe" | "clay" | "normals";
type LightingPreset = "studio" | "cyber" | "sunset" | "highkey";

export const Object3DCanvas = forwardRef<Object3DCanvasHandle, Object3DCanvasProps>(function Object3DCanvas({
  initialObject,
  isGenerating = false,
  showBlueprint = true,
  showDimensions = true,
  onToggleBlueprint,
  onToggleDimensions,
  onSendToVideo,
  onSendToImageRemix,
  onPromptSelect,
  onObjectChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  const isDark = themeReady && resolvedTheme === "dark";
  const [highlightDim, setHighlightDim] = useState<DimAxis>("all");

  // 3D Object State
  const [objectData, setObjectData] = useState<Object3DData>(
    initialObject || {
      id: "3d-default",
      name: "Carbon Stealth Quad-Drone",
      prompt: "Futuristic quadcopter drone with 4 carbon-fiber rotor arms and 4K camera gimbal",
      model: "opendoor-shap-e-3d",
      geometryType: "drone",
      primaryColor: "#18181b",
      secondaryColor: "#06b6d4",
      roughness: 0.25,
      metalness: 0.85,
      polyCount: 48200,
      dimensions: "320 × 320 × 95 mm",
    }
  );

  // Camera & Viewport Controls
  const [rotation, setRotation] = useState({ x: 25, y: 45 });
  const [zoom, setZoom] = useState(1);
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const [renderStyle, setRenderStyle] = useState<RenderStyle>("pbr");
  const [lighting, setLighting] = useState<LightingPreset>("studio");
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const applyViewAngle = (view: (typeof VIEW_ANGLES)[number]) => {
    setIsAutoRotate(false);
    setActiveViewId(view.id);
    setRotation({ x: view.x, y: view.y });
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (initialObject) {
      setObjectData(initialObject);
    }
  }, [initialObject]);

  // Turntable Auto-Rotation Animation Loop
  useEffect(() => {
    if (!isAutoRotate || isDragging) return;
    const interval = setInterval(() => {
      setRotation((prev) => ({
        ...prev,
        y: (prev.y + 0.5) % 360,
      }));
    }, 16);
    return () => clearInterval(interval);
  }, [isAutoRotate, isDragging]);

  // Interactive 3D Canvas Rendering Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = (canvas.width = canvas.clientWidth * dpr);
    const height = (canvas.height = canvas.clientHeight * dpr);
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    const palette = isDark
      ? {
          bgInner:
            lighting === "cyber"
              ? "rgba(18, 12, 36, 0.95)"
              : lighting === "sunset"
                ? "rgba(28, 16, 14, 0.95)"
                : lighting === "highkey"
                  ? "rgba(32, 35, 48, 0.95)"
                  : "rgba(16, 18, 28, 0.95)",
          bgOuter:
            lighting === "cyber"
              ? "rgba(4, 5, 12, 1)"
              : lighting === "sunset"
                ? "rgba(6, 4, 8, 1)"
                : lighting === "highkey"
                  ? "rgba(10, 11, 16, 1)"
                  : "rgba(6, 7, 10, 1)",
          grid: "rgba(34, 211, 238, 0.16)",
          gridMajor: "rgba(34, 211, 238, 0.32)",
          floorFill: "rgba(8, 14, 24, 0.72)",
          floorEdge: "rgba(34, 211, 238, 0.35)",
          footprint: "rgba(34, 211, 238, 0.12)",
          shadow: "rgba(0, 0, 0, 0.45)",
          blueprint: "rgba(34, 211, 238, 0.55)",
          blueprintSoft: "rgba(34, 211, 238, 0.22)",
          dim: "rgba(250, 204, 21, 0.9)",
          dimSoft: "rgba(250, 204, 21, 0.28)",
          dimMuted: "rgba(250, 204, 21, 0.22)",
          ink: "rgba(255, 255, 255, 0.92)",
          edge: "rgba(255, 255, 255, 0.1)",
          clayEdge: "rgba(255, 255, 255, 0.12)",
        }
      : {
          bgInner:
            lighting === "cyber"
              ? "#e0e7ff"
              : lighting === "sunset"
                ? "#fff7ed"
                : lighting === "highkey"
                  ? "#ffffff"
                  : "#eef4f8",
          bgOuter:
            lighting === "cyber"
              ? "#f8fafc"
              : lighting === "sunset"
                ? "#fafaf9"
                : lighting === "highkey"
                  ? "#f4f4f5"
                  : "#d9e4ee",
          grid: "rgba(14, 116, 144, 0.18)",
          gridMajor: "rgba(14, 116, 144, 0.38)",
          floorFill: "rgba(255, 255, 255, 0.62)",
          floorEdge: "rgba(14, 116, 144, 0.32)",
          footprint: "rgba(8, 145, 178, 0.1)",
          shadow: "rgba(15, 23, 42, 0.16)",
          blueprint: "rgba(8, 145, 178, 0.75)",
          blueprintSoft: "rgba(8, 145, 178, 0.28)",
          dim: "rgba(180, 83, 9, 0.95)",
          dimSoft: "rgba(217, 119, 6, 0.35)",
          dimMuted: "rgba(180, 83, 9, 0.22)",
          ink: "rgba(24, 24, 27, 0.88)",
          edge: "rgba(24, 24, 27, 0.14)",
          clayEdge: "rgba(24, 24, 27, 0.16)",
        };

    const bgGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      50,
      centerX,
      centerY,
      Math.max(width, height) / 1.4
    );
    bgGradient.addColorStop(0, palette.bgInner);
    bgGradient.addColorStop(1, palette.bgOuter);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const radX = (rotation.x * Math.PI) / 180;
    const radY = (rotation.y * Math.PI) / 180;
    const scale = 140 * zoom;

    const project = (x: number, y: number, z: number): Vec2 => {
      const x1 = x * Math.cos(radY) + z * Math.sin(radY);
      const z1 = -x * Math.sin(radY) + z * Math.cos(radY);
      const y2 = y * Math.cos(radX) - z1 * Math.sin(radX);
      const z2 = y * Math.sin(radX) + z1 * Math.cos(radX);
      const distance = 4;
      const fov = distance / (distance + z2);
      return {
        x: centerX + x1 * scale * fov,
        y: centerY - y2 * scale * fov,
        z: z2,
      };
    };

    const geom = objectData.geometryType;
    const extents = getModelExtents(geom);
    const floorY = -extents.h;
    const floorSpan = Math.max(2.2, Math.max(extents.w, extents.d) * 2.35);
    const dims = parseProductDimensions(objectData.dimensions);

    const drawProjectedPoly = (points: Vec2[]) => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
    };

    const floorPoint = (x: number, z: number) => project(x, floorY, z);

    // Floorplate lives in XZ and orbits with the camera
    const plate = [
      floorPoint(-floorSpan, -floorSpan),
      floorPoint(floorSpan, -floorSpan),
      floorPoint(floorSpan, floorSpan),
      floorPoint(-floorSpan, floorSpan),
    ];
    ctx.save();
    drawProjectedPoly(plate);
    ctx.fillStyle = palette.floorFill;
    ctx.fill();
    ctx.strokeStyle = palette.floorEdge;
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();

    const drawFloorSegment = (x1: number, z1: number, x2: number, z2: number) => {
      const a = floorPoint(x1, z1);
      const b = floorPoint(x2, z2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    const minorStep = 0.25;
    const majorStep = 0.5;
    for (let x = -floorSpan; x <= floorSpan + 0.001; x += minorStep) {
      const onAxis = Math.abs(x) < 0.001;
      const onMajor = Math.abs(x / majorStep - Math.round(x / majorStep)) < 0.001;
      ctx.strokeStyle = onAxis
        ? (isDark ? "rgba(251, 113, 133, 0.7)" : "rgba(225, 29, 72, 0.55)")
        : onMajor
          ? palette.gridMajor
          : palette.grid;
      ctx.lineWidth = (onAxis ? 1.6 : onMajor ? 1.15 : 0.7) * dpr;
      drawFloorSegment(x, -floorSpan, x, floorSpan);
    }
    for (let z = -floorSpan; z <= floorSpan + 0.001; z += minorStep) {
      const onAxis = Math.abs(z) < 0.001;
      const onMajor = Math.abs(z / majorStep - Math.round(z / majorStep)) < 0.001;
      ctx.strokeStyle = onAxis
        ? (isDark ? "rgba(56, 189, 248, 0.75)" : "rgba(2, 132, 199, 0.55)")
        : onMajor
          ? palette.gridMajor
          : palette.grid;
      ctx.lineWidth = (onAxis ? 1.6 : onMajor ? 1.15 : 0.7) * dpr;
      drawFloorSegment(-floorSpan, z, floorSpan, z);
    }

    const footprint = [
      floorPoint(-extents.w, -extents.d),
      floorPoint(extents.w, -extents.d),
      floorPoint(extents.w, extents.d),
      floorPoint(-extents.w, extents.d),
    ];
    drawProjectedPoly(footprint);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    drawProjectedPoly(footprint);
    ctx.fillStyle = palette.footprint;
    ctx.fill();
    ctx.setLineDash(showBlueprint ? [6 * dpr, 4 * dpr] : []);
    ctx.strokeStyle = palette.blueprint;
    ctx.lineWidth = 1.4 * dpr;
    ctx.stroke();
    ctx.setLineDash([]);

    if (showBlueprint) {
      ctx.font = `600 ${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillStyle = palette.ink;
      const widthLabel = floorPoint(0, extents.d + 0.22);
      const depthLabel = floorPoint(extents.w + 0.22, 0);
      const frontLabel = floorPoint(0, floorSpan - 0.18);
      ctx.fillText(`W ${dims.width}${dims.unit}`, widthLabel.x - 22 * dpr, widthLabel.y);
      ctx.fillText(`D ${dims.depth}${dims.unit}`, depthLabel.x + 4 * dpr, depthLabel.y);
      ctx.fillStyle = isDark ? "rgba(34, 211, 238, 0.7)" : "rgba(8, 145, 178, 0.75)";
      ctx.fillText("PLAN", frontLabel.x - 14 * dpr, frontLabel.y);
    }
    ctx.restore();

    const primary = objectData.primaryColor;
    const accent = objectData.secondaryColor;

    const drawFace = (
      points: Vec3[],
      color: string,
      normal: Vec3
    ) => {
      const proj = points.map((p) => project(p.x, p.y, p.z));
      let lightDir = { x: 0.5, y: 0.8, z: 0.6 };
      if (lighting === "cyber") lightDir = { x: -0.8, y: 0.6, z: 0.5 };
      if (lighting === "sunset") lightDir = { x: 0.9, y: 0.3, z: 0.4 };

      const dot = Math.max(0.15, (normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z + 1) / 2);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      for (let i = 1; i < proj.length; i++) {
        ctx.lineTo(proj[i].x, proj[i].y);
      }
      ctx.closePath();

      if (renderStyle === "wireframe") {
        ctx.strokeStyle = accent || "#06b6d4";
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      } else if (renderStyle === "normals") {
        const r = Math.floor(((normal.x + 1) / 2) * 255);
        const g = Math.floor(((normal.y + 1) / 2) * 255);
        const b = Math.floor(((normal.z + 1) / 2) * 255);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.stroke();
      } else if (renderStyle === "clay") {
        const gray = Math.floor(dot * (isDark ? 200 : 180) + (isDark ? 40 : 70));
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        ctx.fill();
        ctx.strokeStyle = palette.clayEdge;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255, ${dot * (objectData.metalness > 0.5 ? 0.35 : 0.15)})`;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = palette.edge;
        ctx.lineWidth = 0.8 * dpr;
        ctx.stroke();
      }
      ctx.restore();
    };

    if (geom === "drone") {
      const h = 0.25;
      const w = 0.6;
      const d = 0.6;
      const boxVerts = [
        { x: -w, y: -h, z: -d },
        { x: w, y: -h, z: -d },
        { x: w, y: h, z: -d },
        { x: -w, y: h, z: -d },
        { x: -w, y: -h, z: d },
        { x: w, y: -h, z: d },
        { x: w, y: h, z: d },
        { x: -w, y: h, z: d },
      ];
      drawFace([boxVerts[3], boxVerts[2], boxVerts[6], boxVerts[7]], primary, { x: 0, y: 1, z: 0 });
      drawFace([boxVerts[4], boxVerts[5], boxVerts[6], boxVerts[7]], primary, { x: 0, y: 0, z: 1 });
      drawFace([boxVerts[5], boxVerts[1], boxVerts[2], boxVerts[6]], primary, { x: 1, y: 0, z: 0 });

      const arms = [
        { x: 0.9, z: 0.9 },
        { x: -0.9, z: 0.9 },
        { x: 0.9, z: -0.9 },
        { x: -0.9, z: -0.9 },
      ];
      arms.forEach((arm) => {
        const p1 = project(0, 0, 0);
        const p2 = project(arm.x, 0.1, arm.z);
        ctx.save();
        ctx.strokeStyle = isDark ? "#3f3f46" : "#71717a";
        ctx.lineWidth = 4 * zoom * dpr;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 8 * zoom * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    } else if (geom === "watch") {
      const numSegments = 16;
      const radius = 0.8;
      const dialVerts: Vec3[] = [];
      for (let i = 0; i < numSegments; i++) {
        const angle = (i / numSegments) * Math.PI * 2;
        dialVerts.push({
          x: Math.cos(angle) * radius,
          y: 0.1,
          z: Math.sin(angle) * radius,
        });
      }
      drawFace(dialVerts, primary, { x: 0, y: 1, z: 0 });

      const innerRadius = 0.65;
      const innerVerts: Vec3[] = [];
      for (let i = 0; i < numSegments; i++) {
        const angle = (i / numSegments) * Math.PI * 2;
        innerVerts.push({
          x: Math.cos(angle) * innerRadius,
          y: 0.12,
          z: Math.sin(angle) * innerRadius,
        });
      }
      drawFace(innerVerts, accent, { x: 0, y: 1, z: 0 });
    } else {
      const w = 0.7;
      const h = 0.8;
      const d = 0.7;
      const v = [
        { x: -w, y: -h, z: -d },
        { x: w, y: -h, z: -d },
        { x: w, y: h, z: -d },
        { x: -w, y: h, z: -d },
        { x: -w, y: -h, z: d },
        { x: w, y: -h, z: d },
        { x: w, y: h, z: d },
        { x: -w, y: h, z: d },
      ];
      drawFace([v[3], v[2], v[6], v[7]], primary, { x: 0, y: 1, z: 0 });
      drawFace([v[4], v[5], v[6], v[7]], primary, { x: 0, y: 0, z: 1 });
      drawFace([v[5], v[1], v[2], v[6]], primary, { x: 1, y: 0, z: 0 });

      const a = [
        { x: -w * 0.9, y: 0, z: d + 0.02 },
        { x: w * 0.9, y: 0, z: d + 0.02 },
        { x: w * 0.9, y: h * 0.3, z: d + 0.02 },
        { x: -w * 0.9, y: h * 0.3, z: d + 0.02 },
      ];
      drawFace(a, accent, { x: 0, y: 0, z: 1 });
    }

    const corners: Vec3[] = [
      { x: -extents.w, y: -extents.h, z: -extents.d },
      { x: extents.w, y: -extents.h, z: -extents.d },
      { x: extents.w, y: extents.h, z: -extents.d },
      { x: -extents.w, y: extents.h, z: -extents.d },
      { x: -extents.w, y: -extents.h, z: extents.d },
      { x: extents.w, y: -extents.h, z: extents.d },
      { x: extents.w, y: extents.h, z: extents.d },
      { x: -extents.w, y: extents.h, z: extents.d },
    ];
    const projected = corners.map((c) => project(c.x, c.y, c.z));
    const boxEdges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    if (showBlueprint) {
      ctx.save();
      ctx.strokeStyle = palette.blueprintSoft;
      ctx.lineWidth = 1.15 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      boxEdges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(projected[a].x, projected[a].y);
        ctx.lineTo(projected[b].x, projected[b].y);
        ctx.stroke();
      });

      const dropCorners: Vec3[] = [
        { x: -extents.w, y: extents.h, z: -extents.d },
        { x: extents.w, y: extents.h, z: -extents.d },
        { x: extents.w, y: extents.h, z: extents.d },
        { x: -extents.w, y: extents.h, z: extents.d },
      ];
      ctx.strokeStyle = palette.blueprintSoft;
      ctx.lineWidth = 1 * dpr;
      dropCorners.forEach((top) => {
        const a = project(top.x, top.y, top.z);
        const b = project(top.x, floorY, top.z);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.fillStyle = palette.blueprint;
      projected.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isDark ? "rgba(6, 7, 10, 0.7)" : "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      });

      const origin = project(0, 0, 0);
      const axis = [
        { tip: project(0.35, 0, 0), color: isDark ? "#fb7185" : "#e11d48", label: "X" },
        { tip: project(0, 0.35, 0), color: isDark ? "#34d399" : "#059669", label: "Y" },
        { tip: project(0, 0, 0.35), color: isDark ? "#38bdf8" : "#0284c7", label: "Z" },
      ];
      axis.forEach((item) => {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(item.tip.x, item.tip.y);
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.font = `600 ${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillText(item.label, item.tip.x + 4 * dpr, item.tip.y - 4 * dpr);
      });
      ctx.restore();
    }

    if (showDimensions) {
      const drawCallout = (
        from: Vec3,
        to: Vec3,
        label: string,
        axis: Exclude<DimAxis, "all">,
      ) => {
        const active = highlightDim === "all" || highlightDim === axis;
        const p1 = project(from.x, from.y, from.z);
        const p2 = project(to.x, to.y, to.z);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offset = 36 * dpr * (axis === "h" ? 0.85 : 1);
        const a = { x: p1.x + nx * offset, y: p1.y + ny * offset };
        const b = { x: p2.x + nx * offset, y: p2.y + ny * offset };
        const color = active ? palette.dim : palette.dimMuted;

        ctx.save();
        ctx.globalAlpha = active ? 1 : 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = (active ? 1.6 : 1) * dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(a.x, a.y);
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        const tick = 7 * dpr;
        [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
        ].forEach((pt) => {
          ctx.beginPath();
          ctx.moveTo(pt.x - ny * tick, pt.y + nx * tick);
          ctx.lineTo(pt.x + ny * tick, pt.y - nx * tick);
          ctx.stroke();
        });

        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        ctx.font = `700 ${11 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        const padX = 7 * dpr;
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = isDark ? "rgba(9, 9, 11, 0.82)" : "rgba(255, 255, 255, 0.94)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2 * dpr;
        const pillX = midX - textW / 2 - padX;
        const pillY = midY - 10 * dpr;
        const pillW = textW + padX * 2;
        const pillH = 20 * dpr;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(pillX, pillY, pillW, pillH, 6 * dpr);
        } else {
          ctx.rect(pillX, pillY, pillW, pillH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(label, midX - textW / 2, midY + 4 * dpr);
        ctx.restore();
      };

      drawCallout(
        { x: -extents.w, y: -extents.h, z: extents.d },
        { x: extents.w, y: -extents.h, z: extents.d },
        `W ${dims.width} ${dims.unit}`,
        "w",
      );
      drawCallout(
        { x: extents.w, y: -extents.h, z: -extents.d },
        { x: extents.w, y: -extents.h, z: extents.d },
        `D ${dims.depth} ${dims.unit}`,
        "d",
      );
      drawCallout(
        { x: -extents.w, y: -extents.h, z: extents.d },
        { x: -extents.w, y: extents.h, z: extents.d },
        `H ${dims.height} ${dims.unit}`,
        "h",
      );
    }
  }, [objectData, rotation, zoom, renderStyle, lighting, isDark, showBlueprint, showDimensions, highlightDim]);

  // Mouse / Touch Drag Orbit Interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    setActiveViewId(null);
    setRotation((prev) => ({
      x: Math.max(-85, Math.min(85, prev.x + deltaY * 0.5)),
      y: (prev.y + deltaX * 0.5) % 360,
    }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.max(0.4, Math.min(2.5, prev * zoomFactor)));
  };

  // Drag and Drop 3D File (.obj, .gltf, .glb, .stl, image)
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const name = file.name.replace(/\.[^/.]+$/, "");

    setObjectData((prev) => {
      const next = {
        ...prev,
        id: `3d-custom-${Date.now()}`,
        name: name.toUpperCase(),
        prompt: `Custom imported 3D asset: ${file.name}`,
        geometryType: name.toLowerCase().includes("drone") ? "drone" : name.toLowerCase().includes("watch") ? "watch" : "custom",
        dimensions: "Custom Scaled (1:1)",
        polyCount: Math.floor(file.size / 40) || 52000,
      };
      onObjectChange?.(next);
      return next;
    });

    setCopiedNotification(`Loaded 3D File: ${file.name}`);
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Export 3D Mesh (OBJ format)
  const handleExportOBJ = () => {
    const objContent = `# OpenDoor 3D Studio - ${objectData.name}\n# Vertices & Topology Export\no ${objectData.name}\nv -1.0 -1.0 1.0\nv 1.0 -1.0 1.0\nv 1.0 1.0 1.0\nv -1.0 1.0 1.0\nv -1.0 -1.0 -1.0\nv 1.0 -1.0 -1.0\nv 1.0 1.0 -1.0\nv -1.0 1.0 -1.0\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 5 1 4 8\n`;
    const blob = new Blob([objContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${objectData.name.toLowerCase().replace(/\s+/g, "-")}.obj`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Capture High-Res Snapshot
  const handleCaptureSnapshot = (): string => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl;
  };

  const handleDownloadSnapshot = () => {
    const dataUrl = handleCaptureSnapshot();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${objectData.name.toLowerCase().replace(/\s+/g, "-")}-3d-render.png`;
    a.click();
  };

  const handleRenderVideoSpin = () => {
    const snapshot = handleCaptureSnapshot();
    if (onSendToVideo) {
      onSendToVideo(objectData, snapshot);
    }
  };

  const handleSendToRemix = () => {
    const snapshot = handleCaptureSnapshot();
    if (onSendToImageRemix && snapshot) {
      onSendToImageRemix(snapshot);
    }
  };

  useImperativeHandle(ref, () => ({
    importFile: processFile,
    openImport: () => fileInputRef.current?.click(),
    snapshot: handleDownloadSnapshot,
    exportObj: handleExportOBJ,
    remix2d: handleSendToRemix,
    animateVideo: handleRenderVideoSpin,
  }));

  const productDims = parseProductDimensions(objectData.dimensions);

  return (
    <div
      onDrop={handleFileDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100 text-zinc-900 select-none dark:bg-[#07080c] dark:text-white"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".obj,.stl,.gltf,.glb,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />

      {/* ── 1. Top 3D Viewport Toolbar ── */}
      <div className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/85 px-4 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-black/60">
        {/* Left: Product Info & Preset Drawer Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-600 dark:border-cyan-500/30 dark:bg-cyan-500/20 dark:text-cyan-400">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold font-mono uppercase tracking-wide text-zinc-900 dark:text-white">
              {objectData.name}
            </h2>
            <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
              {objectData.dimensions} · {objectData.polyCount.toLocaleString()} Polys
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="ml-2 flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-mono text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Package className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
            <span>Presets</span>
          </button>
        </div>

        {/* Center: 3D Render Shading Styles */}
        <div className="hidden md:flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 dark:border-white/10 dark:bg-white/5">
          {(["pbr", "wireframe", "clay", "normals"] as RenderStyle[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRenderStyle(mode)}
              className={cn(
                "px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all",
                renderStyle === mode
                  ? "bg-cyan-500 text-black font-bold shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Right: Lighting, overlays, spin */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-white/10 dark:bg-white/5">
            {(["studio", "cyber", "sunset", "highkey"] as LightingPreset[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLighting(l)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono capitalize transition-all",
                  lighting === l
                    ? "bg-white font-bold text-zinc-900 shadow-sm dark:bg-white/20 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                )}
                title={`${l} lighting studio`}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onToggleBlueprint?.()}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-mono transition-all",
              showBlueprint
                ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-300"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
            )}
            title="Toggle blueprint construction lines"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Blueprint</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleDimensions?.()}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-mono transition-all",
              showDimensions
                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
            )}
            title="Highlight product dimensions"
          >
            <Ruler className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Dims</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveViewId(null);
              setIsAutoRotate(!isAutoRotate);
            }}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-mono transition-all",
              isAutoRotate
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
            )}
            title="360° Turntable Rotation"
          >
            <Rotate3d className={cn("h-3.5 w-3.5", isAutoRotate && "animate-spin")} style={{ animationDuration: "6s" }} />
            <span className="hidden sm:inline">360° Spin</span>
          </button>

          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-white/10 dark:bg-white/5">
            {VIEW_ANGLES.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => applyViewAngle(view)}
                className={cn(
                  "rounded-md px-1.5 py-1 font-mono text-[10px] font-semibold transition-all sm:px-2",
                  activeViewId === view.id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-cyan-400 dark:text-zinc-950"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
                title={`View from ${view.label.toLowerCase()}`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {copiedNotification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 rounded-full bg-cyan-500/90 text-black font-mono text-xs px-4 py-1.5 shadow-xl font-bold">
          {copiedNotification}
        </div>
      )}

      {/* ── 2. The 3D WebGL / HTML5 Canvas Viewport ── */}
      <div
        className="relative flex-1 min-h-0 w-full overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="h-full w-full block" />

        {/* Viewport Corner Reticle Guides */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400 dark:text-white/25">
            <span>+ 3D STAGE</span>
            <span>ZOOM: {Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] uppercase text-zinc-400 dark:text-white/25">
            <span>ROT: X {Math.round(rotation.x)}° · Y {Math.round(rotation.y)}°</span>
            <span>DRAG TO ORBIT · SCROLL TO ZOOM</span>
          </div>
        </div>

        {showDimensions && (
          <div className="absolute bottom-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
            {([
              { id: "all" as const, label: "All" },
              { id: "w" as const, label: `W ${productDims.width} ${productDims.unit}` },
              { id: "d" as const, label: `D ${productDims.depth} ${productDims.unit}` },
              { id: "h" as const, label: `H ${productDims.height} ${productDims.unit}` },
            ]).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setHighlightDim((prev) => (prev === chip.id ? "all" : chip.id))}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors",
                  highlightDim === chip.id
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200"
                    : "border-zinc-200 bg-white/90 text-zinc-600 hover:bg-zinc-50 dark:border-white/15 dark:bg-black/70 dark:text-zinc-300 dark:hover:bg-white/10"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Drag & Drop File Indicator Overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center border-2 border-dashed border-cyan-400 bg-cyan-50/90 backdrop-blur-md dark:bg-cyan-950/80">
            <Upload className="mb-2 h-12 w-12 animate-bounce text-cyan-600 dark:text-cyan-300" />
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Drop 3D Object (.OBJ / .GLB / .STL)</h3>
            <p className="text-xs text-cyan-700 dark:text-cyan-200">Release to import, then keep prompting in the bar below</p>
          </div>
        )}

        {isGenerating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-[#07080c]/70">
            <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-300">
              <Sparkles className="h-7 w-7 animate-spin" style={{ animationDuration: "4s" }} />
            </div>
            <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
              Synthesizing 3D mesh
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              Keep the prompt — you can refine this object next
            </p>
          </div>
        )}

        {/* Product Presets Floating Drawer */}
        {showPresets && (
          <div className="absolute top-4 left-4 z-30 w-80 space-y-2 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 dark:border-white/15 dark:bg-black/90">
            <div className="flex items-center justify-between border-b border-zinc-200 px-1 pb-1 dark:border-white/10">
              <span className="text-[10px] font-mono font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                3D Product Presets
              </span>
              <button
                type="button"
                onClick={() => setShowPresets(false)}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid max-h-80 grid-cols-1 gap-1.5 overflow-y-auto pr-1">
              {PRODUCT_3D_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const next: Object3DData = {
                      id: preset.id,
                      name: preset.name,
                      prompt: preset.prompt,
                      model: "opendoor-shap-e-3d",
                      geometryType: preset.geometryType,
                      primaryColor: preset.primaryColor,
                      secondaryColor: preset.secondaryColor,
                      roughness: preset.roughness,
                      metalness: preset.metalness,
                      polyCount: preset.polyCount,
                      dimensions: preset.dimensions,
                    };
                    setObjectData(next);
                    onObjectChange?.(next);
                    if (onPromptSelect) onPromptSelect(preset.prompt);
                    setShowPresets(false);
                  }}
                  className="group flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-2 text-left transition-all hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/5 dark:bg-white/[0.03] dark:hover:border-cyan-500/50 dark:hover:bg-cyan-950/20"
                >
                  <div className="min-w-0 space-y-0.5 pr-2">
                    <span className="block truncate text-xs font-bold text-zinc-900 group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-300">
                      {preset.name}
                    </span>
                    <span className="block font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                      {preset.tag} · {preset.dimensions}
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-cyan-500 dark:text-zinc-500 dark:group-hover:text-cyan-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
