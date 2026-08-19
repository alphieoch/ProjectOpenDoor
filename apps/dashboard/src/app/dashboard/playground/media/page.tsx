"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Loader2, Video } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { formatGatewayError } from "@/lib/models/modality";

const PLAYGROUND_KEY = "od_playground_api_key";

type Mode = "image" | "video";

type CatalogRow = { id: string; display_name?: string; provider?: string };

type ImageResult = { url?: string; b64_json?: string };

type VideoJob = {
  id: string;
  status: string;
  model?: string;
  url?: string;
  error?: string;
  mime_type?: string;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function imageSrc(row: ImageResult): string | null {
  if (row.url) return row.url;
  if (row.b64_json) return `data:image/png;base64,${row.b64_json}`;
  return null;
}

export default function MediaPlaygroundPage() {
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [imageModels, setImageModels] = useState<CatalogRow[]>([]);
  const [videoModels, setVideoModels] = useState<CatalogRow[]>([]);
  const [model, setModel] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [duration, setDuration] = useState(4);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const models = mode === "image" ? imageModels : videoModels;

  const ensureKey = useCallback(async () => {
    const existing = localStorage.getItem(PLAYGROUND_KEY) || "";
    if (existing) {
      setApiKey(existing);
      return existing;
    }
    const created = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: "Playground" }),
    });
    const data = (await created.json().catch(() => ({}))) as { key?: string };
    if (data.key) {
      localStorage.setItem(PLAYGROUND_KEY, data.key);
      setApiKey(data.key);
      return data.key;
    }
    return "";
  }, []);

  useEffect(() => {
    void (async () => {
      const key = await ensureKey();
      if (!key) return;
      const res = await fetch("/api/playground/media-models", {
        credentials: "include",
        headers: { "x-playground-key": key },
      });
      const data = (await res.json().catch(() => ({}))) as {
        images?: CatalogRow[];
        videos?: CatalogRow[];
        error?: string;
      };
      const nextImages = Array.isArray(data.images) ? data.images : [];
      const nextVideos = Array.isArray(data.videos) ? data.videos : [];
      setImageModels(nextImages);
      setVideoModels(nextVideos);
      setModel((current) => current || nextImages[0]?.id || nextVideos[0]?.id || "");
      if (!res.ok && data.error) setError(data.error);
    })();
  }, [ensureKey]);

  useEffect(() => {
    const first = (mode === "image" ? imageModels : videoModels)[0]?.id;
    if (first) setModel(first);
    setAspect(mode === "image" ? "1:1" : "16:9");
  }, [mode, imageModels, videoModels]);

  useEffect(() => {
    if (!videoJob || !apiKey) return;
    if (videoJob.status === "completed" || videoJob.status === "failed") return;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/playground/videos/${encodeURIComponent(videoJob.id)}`, {
        credentials: "include",
        headers: { "x-playground-key": apiKey },
      });
      const data = (await res.json().catch(() => ({}))) as VideoJob & { error?: string };
      if (!res.ok) {
        setError(formatGatewayError(data, data.error || "Video status failed"));
        return;
      }
      setVideoJob(data);
      if (data.status === "failed") {
        setError(data.error || "Video generation failed");
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [videoJob, apiKey]);

  useEffect(() => {
    if (!videoJob || videoJob.status !== "completed" || !apiKey) return;
    let objectUrl = "";
    void (async () => {
      const res = await fetch(`/api/playground/videos/${encodeURIComponent(videoJob.id)}/content`, {
        credentials: "include",
        headers: { "x-playground-key": apiKey },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(formatGatewayError(data, "Could not download the video"));
        return;
      }
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      setVideoSrc(objectUrl);
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoJob, apiKey]);

  async function onPickImage(file: File | undefined) {
    if (!file) {
      setRefImage(null);
      return;
    }
    setRefImage(await fileToDataUrl(file));
  }

  async function generate() {
    if (!prompt.trim()) return;
    const key = apiKey || (await ensureKey());
    if (!key) {
      setError("Playground API key is not ready yet.");
      return;
    }
    setLoading(true);
    setError(null);
    setImages([]);
    setVideoJob(null);
    setVideoSrc(null);
    try {
      if (mode === "image") {
        const res = await fetch("/api/playground/images", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-playground-key": key },
          body: JSON.stringify({
            model,
            prompt: prompt.trim(),
            n: 1,
            aspect_ratio: aspect,
            response_format: "b64_json",
            ...(refImage ? { image: refImage } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(formatGatewayError(data, data.error || `Image generation failed (${res.status})`));
          return;
        }
        setImages(Array.isArray(data.data) ? data.data : []);
        if (!Array.isArray(data.data) || data.data.length === 0) {
          setError("The gateway returned no image. Nothing was invented.");
        }
      } else {
        const res = await fetch("/api/playground/videos", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-playground-key": key },
          body: JSON.stringify({
            model,
            prompt: prompt.trim(),
            n: 1,
            duration,
            aspect_ratio: aspect,
            ...(refImage ? { image: refImage } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(formatGatewayError(data, data.error || `Video generation failed (${res.status})`));
          return;
        }
        setVideoJob(data as VideoJob);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Media playground"
        description="Generate images and videos through the live gateway. Vertex Gemini image and Veo 3.1 when ADC is set — no canned media."
        actions={
          <Link href="/dashboard/playground" className="btn btn-sm">
            Chat playground
          </Link>
        }
      />

      {error && (
        <div className="mb-6 alert-error">
          <p className="font-medium">{error}</p>
          {(error.toLowerCase().includes("not configured") || error.includes("503")) && (
            <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Video needs Vertex Veo (GOOGLE_CLOUD_PROJECT + ADC). Images use Gemini image models on
              the same ADC; Imagen publisher ids still 404 until Model Garden Enable.
            </p>
          )}
        </div>
      )}

      <div className="card p-6 mb-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={mode === "image" ? "btn-primary" : "btn"}
            onClick={() => setMode("image")}
          >
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Image
            </span>
          </button>
          <button
            type="button"
            className={mode === "video" ? "btn-primary" : "btn"}
            onClick={() => setMode("video")}
          >
            <span className="inline-flex items-center gap-2">
              <Video className="h-4 w-4" /> Video
            </span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Model
            </label>
            <select
              className="input w-full max-w-lg"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.length === 0 ? (
                <option value="">No live media models</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.id}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Prompt
            </label>
            <textarea
              className="input w-full min-h-[120px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === "image"
                  ? "A red door on a white wall, product photo"
                  : "A red cube sitting still on a white table"
              }
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Aspect ratio
              </label>
              <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {(mode === "image"
                  ? ["1:1", "16:9", "9:16", "4:3", "3:4"]
                  : ["16:9", "9:16"]
                ).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            {mode === "video" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Duration (seconds)
                </label>
                <select
                  className="input"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  <option value={4}>4</option>
                  <option value={6}>6</option>
                  <option value={8}>8</option>
                </select>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Optional reference image
              </label>
              <input
                type="file"
                accept="image/*"
                className="input"
                onChange={(e) => void onPickImage(e.target.files?.[0])}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={loading || !prompt.trim() || !model}
            onClick={() => void generate()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {images.length > 0 && (
        <div className="card p-6 mb-8">
          <h2 className="section-title mb-4">Images</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {images.map((img, i) => {
              const src = imageSrc(img);
              if (!src) return null;
              return (
                <a key={i} href={src} download={`opendoor-image-${i + 1}.png`}>
                  <img src={src} alt={`Generated ${i + 1}`} className="w-full rounded-lg" />
                </a>
              );
            })}
          </div>
        </div>
      )}

      {videoJob && (
        <div className="card p-6">
          <h2 className="section-title mb-2">Video</h2>
          <p className="page-desc mb-4">
            {videoJob.id} · {videoJob.status}
            {videoJob.model ? ` · ${videoJob.model}` : ""}
          </p>
          {videoJob.status === "processing" && (
            <p className="inline-flex items-center gap-2 page-desc">
              <Loader2 className="h-4 w-4 animate-spin" /> Waiting on Veo…
            </p>
          )}
          {videoSrc && (
            <div>
              <video src={videoSrc} controls className="w-full max-w-3xl rounded-lg" />
              <a href={videoSrc} download={`${videoJob.id}.mp4`} className="btn btn-sm mt-3 inline-block">
                Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
