"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Film,
  Music,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SoundFXData {
  id: string;
  name: string;
  prompt: string;
  model: string;
  duration: number;
  sampleRate: string;
  format: string;
  url: string;
  waveform: number[];
  specs?: {
    channels: string;
    loudness: string;
    category: string;
  };
}

interface SoundFXCanvasProps {
  soundData: SoundFXData | null;
  isGenerating: boolean;
  onAttachToVideo?: (soundUrl: string) => void;
  onSelectPreset?: (prompt: string, title: string) => void;
}

const PRESETS = [
  { id: "rain", name: "Neo-Tokyo Rain", category: "Ambient", prompt: "Heavy nocturnal rain pouring on metallic catwalks with distant police hover-siren echoes", duration: 5 },
  { id: "boom", name: "Cinematic Sub Impact", category: "Impact", prompt: "Hollywood blockbuster cinematic deep sub-bass braam impact with metallic reverb tail", duration: 5 },
  { id: "drone", name: "Drone Doppler Flyby", category: "Sci-Fi", prompt: "Carbon-fiber quadcopter drone high-speed doppler flyby with electric motor whine", duration: 5 },
  { id: "forest", name: "Alpine Forest Dawn", category: "Nature", prompt: "Crisp mountain forest atmosphere at sunrise with gentle pine needle rustling and songbirds", duration: 9 },
  { id: "valve", name: "Air-Lock Steam Release", category: "Foley", prompt: "Heavy sci-fi spaceship air-lock pneumatic hiss with pressurized steam exhaust", duration: 5 },
];

export function SoundFXCanvas({
  soundData,
  isGenerating,
  onAttachToVideo,
  onSelectPreset,
}: SoundFXCanvasProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(soundData?.duration || 5);
  const [isMuted, setIsMuted] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (soundData) {
      setDuration(soundData.duration || 5);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [soundData]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(true));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (percentage: number) => {
    if (audioRef.current && duration > 0) {
      const nextTime = percentage * duration;
      audioRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
  };

  const downloadAudio = () => {
    if (!soundData) return;
    const a = document.createElement("a");
    a.href = soundData.url;
    a.download = `${soundData.name.toLowerCase().replace(/\s+/g, "-")}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const waveform = soundData?.waveform || Array.from({ length: 48 }, () => 0.4);

  return (
    <div className="relative flex flex-col h-full w-full rounded-2xl overflow-hidden bg-[#090b10] border border-white/10 select-none">
      <audio
        ref={audioRef}
        src={soundData?.url || "https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3"}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        muted={isMuted}
        preload="auto"
      />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/10 z-20">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Waves className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              {soundData?.name || "SOUND FX & FOLEY STUDIO"}
            </span>
            <span className="text-[10px] font-mono text-zinc-400 block">
              {soundData ? `${soundData.sampleRate} · ${soundData.specs?.channels || "Stereo"}` : "48kHz 24-bit Spatial Audio"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPresets((p) => !p)}
            className={cn(
              "flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors",
              showPresets ? "bg-cyan-500 text-black border-cyan-400 font-bold" : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10"
            )}
          >
            <Music className="h-3 w-3" />
            <span>Presets</span>
          </button>
        </div>
      </div>

      {/* Main Stage: Waveform Visualizer & Central Playback */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 z-10 overflow-hidden">
        {/* Ambient Glow Background */}
        <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/20 via-transparent to-purple-950/10 pointer-events-none" />

        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            <p className="text-sm font-mono text-cyan-300">Synthesizing audio soundscape & Foley...</p>
          </div>
        ) : !soundData ? (
          <div className="flex flex-col items-center gap-2 text-center px-6">
            <Waves className="h-8 w-8 text-cyan-400/80" />
            <p className="text-sm font-semibold text-white">Prompt to sound</p>
            <p className="max-w-sm text-xs leading-relaxed text-zinc-400">
              Describe a Foley hit, ambience, or cinematic impact in the prompt bar below, then generate.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-xl flex flex-col items-center space-y-6">
            {/* Waveform Visualizer Bars */}
            <div
              className="w-full h-32 flex items-center justify-center gap-1 sm:gap-1.5 bg-black/40 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-cyan-500/40 transition-colors shadow-inner"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                handleSeek(Math.max(0, Math.min(1, clickX / rect.width)));
              }}
            >
              {waveform.map((val, idx) => {
                const progressRatio = duration > 0 ? currentTime / duration : 0;
                const barRatio = idx / waveform.length;
                const isPassed = barRatio <= progressRatio;
                const heightPercent = Math.max(15, Math.min(100, val * 100));

                return (
                  <div
                    key={idx}
                    className="flex-1 flex items-center justify-center h-full"
                  >
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={cn(
                        "w-full rounded-full transition-all duration-100",
                        isPassed
                          ? isPlaying
                            ? "bg-gradient-to-t from-cyan-500 to-emerald-400 shadow-sm shadow-cyan-500/50 scale-y-105"
                            : "bg-cyan-400"
                          : "bg-white/15"
                      )}
                    />
                  </div>
                );
              })}
            </div>

            {/* Playback Controls Row */}
            <div className="flex items-center justify-between w-full px-2">
              <div className="text-xs font-mono text-zinc-400">
                <span className="text-white font-bold">{currentTime.toFixed(1)}s</span> / {duration.toFixed(1)}s
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10 font-bold"
                  title={isPlaying ? "Pause" : "Play Sound"}
                >
                  {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={downloadAudio}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                  title="Download MP3 Audio"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Action Buttons: Attach to Video */}
            {soundData && (
              <div className="flex items-center gap-2 pt-2">
                {onAttachToVideo && (
                  <button
                    type="button"
                    onClick={() => onAttachToVideo(soundData.url)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20"
                  >
                    <Film className="h-3.5 w-3.5" />
                    <span>Attach Audio to Video Timeline</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Presets Drawer */}
      {showPresets && (
        <div className="absolute top-12 right-0 bottom-0 w-72 bg-zinc-950/95 border-l border-white/10 p-3.5 backdrop-blur-xl z-30 overflow-y-auto space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              Sound FX Library
            </span>
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (onSelectPreset) onSelectPreset(p.prompt, p.name);
                  setShowPresets(false);
                }}
                className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white group-hover:text-cyan-300">
                    {p.name}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-zinc-400 border border-white/10">
                    {p.duration}s
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                  {p.prompt}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
