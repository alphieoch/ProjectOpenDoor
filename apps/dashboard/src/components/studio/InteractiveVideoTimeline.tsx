"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  Target,
  Sparkles,
  Scissors,
  BookmarkPlus,
  X,
  FastForward,
} from "lucide-react";

export interface TimelineTarget {
  mode: "point" | "range" | "full";
  targetTime?: number; // In seconds
  startTime?: number;  // In seconds
  endTime?: number;    // In seconds
}

interface InteractiveVideoTimelineProps {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  videoUrl?: string | null;
  duration?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  target?: TimelineTarget;
  onTargetChange?: (target: TimelineTarget) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const dec = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${dec}`;
}

export function InteractiveVideoTimeline({
  videoRef,
  videoUrl,
  duration: customDuration,
  currentTime: customTime,
  onSeek,
  target = { mode: "full" },
  onTargetChange,
}: InteractiveVideoTimelineProps) {
  const [internalTime, setInternalTime] = useState(0);
  const [internalDuration, setInternalDuration] = useState(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosPercent, setHoverPosPercent] = useState<number | null>(null);
  const [inPoint, setInPoint] = useState<number | null>(target.startTime ?? null);
  const [outPoint, setOutPoint] = useState<number | null>(target.endTime ?? null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const trackRef = useRef<HTMLDivElement>(null);

  const activeDuration = customDuration || internalDuration || 8;
  const activeTime = customTime !== undefined ? customTime : internalTime;

  // Sync with HTMLVideoElement events if videoRef is supplied
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setInternalTime(video.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
        setInternalDuration(video.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    if (video.duration && !isNaN(video.duration)) {
      setInternalDuration(video.duration);
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [videoRef, isScrubbing, videoUrl]);

  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, activeDuration));
      setInternalTime(clamped);
      if (videoRef?.current) {
        videoRef.current.currentTime = clamped;
      }
      onSeek?.(clamped);
    },
    [activeDuration, onSeek, videoRef]
  );

  const togglePlay = () => {
    const video = videoRef?.current;
    if (!video) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    setIsScrubbing(true);
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * activeDuration;
    seekTo(newTime);
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = ratio * activeDuration;
      seekTo(newTime);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbing, activeDuration, seekTo]);

  const handleTrackMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosPercent(ratio * 100);
    setHoverTime(ratio * activeDuration);
  };

  const handleTrackMouseLeave = () => {
    setHoverTime(null);
    setHoverPosPercent(null);
  };

  // Set Point-In-Time target at active playhead
  const setTargetPointAtPlayhead = () => {
    onTargetChange?.({
      mode: "point",
      targetTime: activeTime,
    });
  };

  // Set In point for range edit
  const markInPoint = () => {
    const newIn = activeTime;
    setInPoint(newIn);
    const effectiveOut = outPoint != null && outPoint > newIn ? outPoint : Math.min(newIn + 2, activeDuration);
    setOutPoint(effectiveOut);
    onTargetChange?.({
      mode: "range",
      startTime: newIn,
      endTime: effectiveOut,
    });
  };

  // Set Out point for range edit
  const markOutPoint = () => {
    const newOut = activeTime;
    setOutPoint(newOut);
    const effectiveIn = inPoint != null && inPoint < newOut ? inPoint : Math.max(0, newOut - 2);
    setInPoint(effectiveIn);
    onTargetChange?.({
      mode: "range",
      startTime: effectiveIn,
      endTime: newOut,
    });
  };

  const resetTargetToFull = () => {
    setInPoint(null);
    setOutPoint(null);
    onTargetChange?.({ mode: "full" });
  };

  const toggleSpeed = () => {
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : playbackSpeed === 2 ? 0.5 : 1;
    setPlaybackSpeed(nextSpeed);
    if (videoRef?.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  const progressPercent = activeDuration > 0 ? (activeTime / activeDuration) * 100 : 0;
  const targetPointPercent =
    target.targetTime != null && activeDuration > 0
      ? (target.targetTime / activeDuration) * 100
      : null;
  const rangeStartPercent =
    target.startTime != null && activeDuration > 0
      ? (target.startTime / activeDuration) * 100
      : null;
  const rangeEndPercent =
    target.endTime != null && activeDuration > 0
      ? (target.endTime / activeDuration) * 100
      : null;

  return (
    <div
      className="flex w-full flex-col gap-2.5 rounded-2xl p-3.5 transition-all duration-200"
      style={{
        background: "rgba(16, 18, 27, 0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 16px 36px -8px rgba(0, 0, 0, 0.6)",
      }}
    >
      {/* Top Bar: Playback Controls, Timecode & Target Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-7.5 w-7.5 items-center justify-center rounded-xl transition-all duration-150 hover:scale-105"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid var(--studio-line)",
              color: "var(--studio-ink)",
            }}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>

          {/* Reset to start */}
          <button
            type="button"
            onClick={() => seekTo(0)}
            className="flex h-7.5 w-7.5 items-center justify-center rounded-xl transition-colors text-[var(--studio-dim)] hover:text-[var(--studio-ink)]"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--studio-line)",
            }}
            title="Restart to 00:00"
          >
            <RotateCcw className="h-3 w-3" />
          </button>

          {/* Speed Toggle */}
          <button
            type="button"
            onClick={toggleSpeed}
            className="flex h-7.5 items-center gap-1 rounded-xl px-2.5 text-[11px] font-mono transition-colors text-[var(--studio-dim)] hover:text-[var(--studio-ink)]"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--studio-line)",
            }}
            title="Playback Speed"
          >
            <FastForward className="h-2.5 w-2.5" />
            <span>{playbackSpeed}x</span>
          </button>

          {/* Timecode display */}
          <div
            className="flex items-center gap-1.5 rounded-xl px-3 py-1 text-[11px] font-mono tracking-wider"
            style={{
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid var(--studio-line)",
              color: "var(--studio-ink)",
            }}
          >
            <Clock className="h-3 w-3 text-[var(--studio-dim)]" />
            <span className="font-semibold text-emerald-400">{formatTime(activeTime)}</span>
            <span className="text-[var(--studio-dim)]">/</span>
            <span className="text-[var(--studio-muted)]">{formatTime(activeDuration)}</span>
          </div>
        </div>

        {/* Target Edit Status Badge & Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {target.mode === "point" && target.targetTime != null && (
            <div
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300 shadow-sm"
            >
              <Target className="h-3 w-3 animate-pulse" />
              <span>Target Point: {formatTime(target.targetTime)}</span>
              <button
                type="button"
                onClick={resetTargetToFull}
                className="ml-1 hover:text-white"
                title="Clear Point"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {target.mode === "range" && target.startTime != null && target.endTime != null && (
            <div
              className="flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-300 shadow-sm"
            >
              <Scissors className="h-3 w-3" />
              <span>
                Range: {formatTime(target.startTime)} - {formatTime(target.endTime)}
              </span>
              <button
                type="button"
                onClick={resetTargetToFull}
                className="ml-1 hover:text-white"
                title="Clear Range"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {target.mode === "full" && (
            <span className="text-[11px] text-[var(--studio-dim)] flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>Full Video Mode</span>
            </span>
          )}

          {/* Action Buttons to Set Markers */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={setTargetPointAtPlayhead}
              className={`flex h-7.5 items-center gap-1 rounded-xl px-2.5 text-[11px] font-medium transition-all ${
                target.mode === "point"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-[var(--studio-dim)] hover:text-[var(--studio-ink)] border border-[var(--studio-line)] hover:bg-white/[0.05]"
              }`}
              title="Set current playhead as target point for AI text edit"
            >
              <Target className="h-3 w-3" />
              <span>Target Point</span>
            </button>

            <button
              type="button"
              onClick={markInPoint}
              className="flex h-7.5 items-center gap-0.5 rounded-xl px-2 text-[11px] text-[var(--studio-dim)] hover:text-[var(--studio-ink)] border border-[var(--studio-line)] hover:bg-white/[0.05]"
              title="Mark In Point"
            >
              <BookmarkPlus className="h-3 w-3" />
              <span>In</span>
            </button>

            <button
              type="button"
              onClick={markOutPoint}
              className="flex h-7.5 items-center gap-0.5 rounded-xl px-2 text-[11px] text-[var(--studio-dim)] hover:text-[var(--studio-ink)] border border-[var(--studio-line)] hover:bg-white/[0.05]"
              title="Mark Out Point"
            >
              <BookmarkPlus className="h-3 w-3 rotate-180" />
              <span>Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Timeline Scrubber Track */}
      <div className="relative pt-1.5 pb-0.5 select-none">
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          onMouseMove={handleTrackMouseMove}
          onMouseLeave={handleTrackMouseLeave}
          className="relative h-10 w-full cursor-pointer rounded-xl overflow-hidden transition-all shadow-inner"
          style={{
            background: "rgba(8, 9, 14, 0.6)",
            border: "1px solid var(--studio-line)",
          }}
        >
          {/* Frame Strip Background Simulation with ticks */}
          <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-20">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="h-full w-px"
                style={{ background: i % 4 === 0 ? "var(--studio-ink)" : "var(--studio-dim)" }}
              />
            ))}
          </div>

          {/* Range Selection Highlight */}
          {rangeStartPercent != null && rangeEndPercent != null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none bg-indigo-500/25 border-x border-indigo-400"
              style={{
                left: `${Math.min(rangeStartPercent, rangeEndPercent)}%`,
                width: `${Math.abs(rangeEndPercent - rangeStartPercent)}%`,
              }}
            />
          )}

          {/* Progress Bar */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-emerald-500/20 pointer-events-none transition-all duration-75"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Target Point Marker Line */}
          {targetPointPercent != null && (
            <div
              className="absolute top-0 bottom-0 z-10 w-0.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] pointer-events-none"
              style={{ left: `${targetPointPercent}%` }}
            >
              <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-amber-400 flex items-center justify-center text-[8px] font-bold text-black">
                ★
              </div>
            </div>
          )}

          {/* Playhead Marker */}
          <div
            className="absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none transition-all duration-75"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-white shadow-md" />
          </div>

          {/* Hover Time Indicator */}
          {hoverPosPercent != null && (
            <div
              className="absolute top-0 bottom-0 z-10 w-px bg-white/40 pointer-events-none"
              style={{ left: `${hoverPosPercent}%` }}
            />
          )}
        </div>

        {/* Hover Timecode Tooltip */}
        {hoverTime != null && hoverPosPercent != null && (
          <div
            className="absolute -top-5 z-30 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[10px] font-mono text-white shadow-lg pointer-events-none"
            style={{ left: `${hoverPosPercent}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Quick Jump Keyframe Points */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--studio-dim)] px-1">
        <span>00:00</span>
        <button
          type="button"
          onClick={() => seekTo(activeDuration * 0.25)}
          className="hover:text-[var(--studio-ink)]"
        >
          {formatTime(activeDuration * 0.25)}
        </button>
        <button
          type="button"
          onClick={() => seekTo(activeDuration * 0.5)}
          className="hover:text-[var(--studio-ink)] font-semibold"
        >
          {formatTime(activeDuration * 0.5)} (Mid)
        </button>
        <button
          type="button"
          onClick={() => seekTo(activeDuration * 0.75)}
          className="hover:text-[var(--studio-ink)]"
        >
          {formatTime(activeDuration * 0.75)}
        </button>
        <span>{formatTime(activeDuration)}</span>
      </div>
    </div>
  );
}
