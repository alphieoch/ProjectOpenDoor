"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
import { Download } from "lucide-react";

const ASPECT_STYLE: Record<string, string> = {
  "1:1": "1 / 1",
  "16:9": "16 / 9",
  "9:16": "9 / 16",
  "4:3": "4 / 3",
  "3:2": "3 / 2",
  "3:4": "3 / 4",
  "21:9": "21 / 9",
};

interface LiveCanvasProps {
  image: string | null;
  video?: string | null;
  videoRef?: React.Ref<HTMLVideoElement>;
  aspectRatio: string;
  isGenerating: boolean;
  dropHint?: string | null;
  accept?: string;
  onFile?: (file: File) => void;
  onDownload?: () => void;
  showNativeControls?: boolean;
}

export function LiveCanvas({
  image,
  video,
  videoRef,
  aspectRatio,
  isGenerating,
  dropHint,
  accept,
  onFile,
  onDownload,
  showNativeControls = false,
}: LiveCanvasProps) {
  const [dragging, setDragging] = useState(false);

  const takeFile = useCallback(
    (list: FileList | null) => {
      if (!onFile || !list?.length) return;
      const wanted = accept || "";
      const file = [...list].find((f) => {
        if (!wanted) return true;
        if (wanted.startsWith("image/")) return f.type.startsWith("image/");
        if (wanted.startsWith("video/")) return f.type.startsWith("video/");
        return true;
      });
      if (file) onFile(file);
    },
    [accept, onFile]
  );

  useEffect(() => {
    if (!onFile) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (accept?.startsWith("image/") && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFile(file);
            return;
          }
        }
        if (accept?.startsWith("video/") && item.type.startsWith("video/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, onFile]);

  const onDragOver = (e: DragEvent) => {
    if (!onFile) return;
    e.preventDefault();
    setDragging(true);
  };

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center px-6 py-6">
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-2xl transition-all duration-200"
        style={{
          aspectRatio: ASPECT_STYLE[aspectRatio] || "1 / 1",
          width: "min(100%, 920px)",
          background: "rgba(14, 15, 22, 0.8)",
          border: `1px solid ${dragging ? "rgba(99, 102, 241, 0.6)" : "var(--studio-line)"}`,
          boxShadow: dragging
            ? "0 0 30px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
            : "var(--studio-sheen), 0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          takeFile(e.dataTransfer.files);
        }}
      >
        {video ? (
          <video
            ref={videoRef}
            src={video}
            className="h-full w-full object-contain"
            controls={showNativeControls}
            muted
            loop
            playsInline
          />
        ) : image ? (
          <img src={image} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px dashed var(--studio-line-strong)",
              }}
            >
              <div className="h-6 w-6 rounded-lg border border-dashed border-white/20" />
            </div>
            {dropHint && (
              <p className="max-w-[260px] text-center text-[12px] font-normal leading-relaxed text-[var(--studio-muted)]">
                {dropHint}
              </p>
            )}
          </div>
        )}

        {dragging && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] font-medium text-white backdrop-blur-md"
            style={{ background: "rgba(12, 14, 24, 0.75)" }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info/20 text-info border border-info/40 animate-bounce">
              ↓
            </div>
            <span>Drop to use as reference</span>
          </div>
        )}

        {isGenerating && (
          <div
            className="absolute inset-0 backdrop-blur-[2px]"
            style={{ background: "rgba(10, 11, 18, 0.5)" }}
          >
            <div
              className="absolute left-0 right-0 top-0 h-0.5"
              style={{
                background: "linear-gradient(90deg, transparent, #818cf8, #c084fc, transparent)",
                animation: "od-studio-scan 1.4s ease-in-out infinite",
                boxShadow: "0 0 16px rgba(129, 140, 248, 0.8)",
              }}
            />
          </div>
        )}

        {(image || video) && onDownload && (
          <button
            type="button"
            onClick={onDownload}
            title="Download Asset"
            className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-xl text-[var(--studio-muted)] hover:text-white transition-all hover:scale-105"
            style={{
              background: "rgba(18, 20, 29, 0.8)",
              backdropFilter: "blur(12px)",
              border: "1px solid var(--studio-line)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
