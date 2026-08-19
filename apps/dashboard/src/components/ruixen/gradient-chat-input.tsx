"use client";

import * as React from "react";
import { Send, Paperclip, Globe, Brain } from "lucide-react";
import { type OrbState } from "thinking-orbs";
import { AiCrest } from "@/components/ui/ai-crest";
import { orbStateToMood } from "@/lib/ai-crest";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BorderBeam } from "@/components/ui/border-beam";
import { Liquid } from "@/components/ui/liquid-gooey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ------------------------------------------------------------------ */
/*  types                                                             */
/* ------------------------------------------------------------------ */
export interface ChatMessage {
  id: number;
  text: string;
  sender: "user" | "bot";
}

export interface GradientChatInputProps {
  /** Placeholder shown inside the text field. */
  placeholder?: string;
  /** Auto-reply pushed back after a user message. Pass `null` to disable. */
  autoReply?: string | null;
  /** Delay (ms) before the auto-reply lands. */
  autoReplyDelay?: number;
  /** Max number of bubbles kept on screen. */
  maxVisible?: number;
  /** Play synthesized send / receive sounds. */
  sound?: boolean;
  /** The spectrum used for the reveal glow (top → bottom). */
  gradientColors?: string[];
  /** Fired whenever the user submits a message. */
  onSend?: (message: string) => void;
  /** Plus-button handler (attachments). */
  onAttach?: () => void;
  /** Hide the plus button. */
  hideAttach?: boolean;
  /** Disable typing and send. */
  disabled?: boolean;
  /** Allow send with an empty field (e.g. image-only). */
  canSend?: boolean;
  /** Show the decorative bubble stack. */
  showBubbles?: boolean;
  /** Drive the spectrum glow from the parent conversation. */
  conversationActive?: boolean;
  /** Slot between the field and the send button (mode picker, etc.). */
  trailing?: React.ReactNode;
  /** Local spectrum behind this card. House chat paints a pane-level glow instead. */
  showGlow?: boolean;
  /** Parent-driven orb (loading / mode). Falls back to the local picker. */
  orbState?: OrbState;
  /** Traveling border beam — on while sending, or when the chat says rainbow. */
  beamActive?: boolean;
  /** Rainbow beam when the conversation contains the word rainbow. */
  beamColorful?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  defaults                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_GRADIENT = [
  "#FC2BA3",
  "#FC6D35",
  "#F9C83D",
  "#C2D6E1",
  "#144EC5",
];

export const ORB_MODES: Array<{ state: OrbState; label: string; desc: string }> = [
  { state: "breathing", label: "Thinking", desc: "Face-on ring slowly morphing" },
  { state: "working", label: "Working", desc: "Particles on tilted orbits" },
  { state: "searching", label: "Searching", desc: "Scan meridian on dotted globe" },
  { state: "solving", label: "Solving", desc: "Bands scramble in quarter turns" },
  { state: "listening", label: "Listening", desc: "Waveform rolls through latitude rings" },
  { state: "connecting", label: "Connecting", desc: "Constellation wires itself" },
  { state: "weaving", label: "Weaving", desc: "Three strands plait around sphere" },
  { state: "composing", label: "Composing", desc: "Undulating multi-band sash" },
  { state: "shaping", label: "Shaping", desc: "Morphs circle → triangle → square" },
];

/* ------------------------------------------------------------------ */
/*  component                                                         */
/* ------------------------------------------------------------------ */
export default function GradientChatInput({
  placeholder = "Send Message",
  autoReply = "Got it — looking into that now ✨",
  autoReplyDelay = 650,
  maxVisible = 4,
  sound = true,
  gradientColors = DEFAULT_GRADIENT,
  onSend,
  onAttach,
  hideAttach = false,
  disabled = false,
  canSend = false,
  showBubbles = true,
  conversationActive,
  trailing,
  showGlow = true,
  orbState,
  beamActive = false,
  beamColorful = false,
  className,
}: GradientChatInputProps) {
  const [value, setValue] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [orbOpen, setOrbOpen] = React.useState(false);
  const [fanOpen, setFanOpen] = React.useState(false);
  const [selectedOrbState, setSelectedOrbState] = React.useState<OrbState>("breathing");
  const [orbSpeed, setOrbSpeed] = React.useState(1);
  const orbHoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = React.useRef(0);
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = React.useRef<AudioContext | null>(null);

  /* lazy AudioContext — only created on the first user gesture */
  const getAudioContext = React.useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    return audioRef.current;
  }, []);

  /* two-note blip synthesized inline — no audio assets to ship */
  const playChime = React.useCallback(
    (notes: { freq: number; at: number }[], volume: number) => {
      if (!sound) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume();

      notes.forEach(({ freq, at }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + at;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    },
    [sound, getAudioContext]
  );

  const playSend = React.useCallback(
    () =>
      playChime(
        [
          { freq: 523.25, at: 0 },
          { freq: 783.99, at: 0.06 },
        ],
        0.05
      ),
    [playChime]
  );

  const playReceive = React.useCallback(
    () =>
      playChime(
        [
          { freq: 392.0, at: 0 },
          { freq: 587.33, at: 0.08 },
        ],
        0.05
      ),
    [playChime]
  );

  /* cleanup pending timers + audio context on unmount */
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      void audioRef.current?.close();
    };
  }, []);

  const pushMessage = (text: string, sender: ChatMessage["sender"]) =>
    setMessages((prev) => [...prev, { id: idRef.current++, text, sender }]);

  const handleSend = () => {
    if (disabled) return;
    const text = value.trim();
    if (!text && !canSend) return;

    onSend?.(text);
    if (text && showBubbles) pushMessage(text, "user");
    playSend();
    setValue("");

    if (autoReply) {
      const t = setTimeout(() => {
        pushMessage(autoReply, "bot");
        playReceive();
        timersRef.current = timersRef.current.filter((timer) => timer !== t);
      }, autoReplyDelay);
      timersRef.current.push(t);
    }
  };

  const hasText = value.trim().length > 0;
  const hasMessages = (conversationActive ?? false) || messages.length > 0;
  const visible = messages.slice(-maxVisible);
  const liveOrb: OrbState = orbState ?? (hasText ? "working" : selectedOrbState);

  return (
    <div className={cn("relative z-[2] mx-auto w-full max-w-lg", className)}>
      <BorderBeam
        active={beamActive}
        colorVariant={beamColorful ? "colorful" : "ocean"}
        theme="auto"
        size="md"
        strength={beamColorful ? 1 : 0.8}
        className="w-full"
      >
      <div className="relative rounded-3xl border border-border bg-background p-1 shadow-[0_10px_20px_-6px_rgba(0,0,0,0.1)]">
        <div className="relative z-[2] flex items-center justify-between gap-2 rounded-3xl bg-background p-1.5">
          <div className="flex flex-1 items-center gap-3 pr-1">
            {!hideAttach && (
              <div
                className="relative"
                onMouseEnter={() => {
                  if (orbHoverTimer.current) clearTimeout(orbHoverTimer.current);
                  if (!orbOpen) setFanOpen(true);
                }}
                onMouseLeave={() => {
                  orbHoverTimer.current = setTimeout(() => setFanOpen(false), 400);
                }}
              >
                <Liquid
                  blur={11}
                  contrast={18}
                  fill="var(--paper-3)"
                  filterPadding={72}
                  className="relative size-10 shrink-0"
                >
                  <Liquid.Item
                    x={0}
                    y={0}
                    style={{ position: "absolute", left: 0, bottom: 0 }}
                  >
                    <button
                      type="button"
                      aria-label="AI crest and attachments"
                      aria-expanded={orbOpen}
                      disabled={disabled}
                      onClick={() => {
                        setFanOpen(false);
                        setOrbOpen((o) => !o);
                      }}
                      className="flex size-10 items-center justify-center rounded-xl bg-transparent transition-transform active:scale-95 disabled:opacity-40"
                    >
                      <AiCrest mood={orbStateToMood(liveOrb)} size={20} />
                    </button>
                  </Liquid.Item>
                  <Liquid.Item
                    x={0}
                    y={fanOpen ? -58 : 0}
                    transition="bouncy"
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      pointerEvents: fanOpen ? "auto" : "none",
                      opacity: fanOpen ? 1 : 0,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Attach photos and documents"
                      disabled={disabled}
                      onClick={() => {
                        setFanOpen(false);
                        setOrbOpen(false);
                        onAttach?.();
                      }}
                      className="flex size-10 items-center justify-center rounded-xl bg-transparent"
                      style={{ color: "var(--ink)" }}
                    >
                      <Paperclip className="size-4" />
                    </button>
                  </Liquid.Item>
                  <Liquid.Item
                    x={fanOpen ? 46 : 0}
                    y={fanOpen ? -40 : 0}
                    transition="bouncy"
                    delay={40}
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      pointerEvents: fanOpen ? "auto" : "none",
                      opacity: fanOpen ? 1 : 0,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Web search mode"
                      disabled={disabled}
                      onClick={() => {
                        setSelectedOrbState("searching");
                        setValue((v) => (v ? `${v} @web` : "@web "));
                        setFanOpen(false);
                        setOrbOpen(false);
                      }}
                      className="flex size-10 items-center justify-center rounded-xl bg-transparent text-emerald-500"
                    >
                      <Globe className="size-4" />
                    </button>
                  </Liquid.Item>
                  <Liquid.Item
                    x={fanOpen ? -46 : 0}
                    y={fanOpen ? -40 : 0}
                    transition="bouncy"
                    delay={80}
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      pointerEvents: fanOpen ? "auto" : "none",
                      opacity: fanOpen ? 1 : 0,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Deep reasoning"
                      disabled={disabled}
                      onClick={() => {
                        setSelectedOrbState("solving");
                        setFanOpen(false);
                        setOrbOpen(false);
                      }}
                      className="flex size-10 items-center justify-center rounded-xl bg-transparent text-purple-500"
                    >
                      <Brain className="size-4" />
                    </button>
                  </Liquid.Item>
                </Liquid>

                {/* Orb Hover Space Panel */}
                <AnimatePresence>
                  {orbOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute bottom-full left-0 z-30 mb-3 w-80 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl"
                      style={{
                        borderColor: "var(--line)",
                        background: "var(--paper-2)",
                        color: "var(--ink)",
                      }}
                    >
                      {/* Hero preview */}
                      <div
                        className="flex flex-col items-center justify-center p-4 border-b text-center relative overflow-hidden"
                        style={{
                          borderColor: "var(--line)",
                          background: "radial-gradient(circle at 50% 30%, var(--brand-soft) 0%, transparent 70%)",
                        }}
                      >
                        <div className="size-16 flex items-center justify-center mb-2">
                          <AiCrest mood={orbStateToMood(selectedOrbState)} size={64} />
                        </div>
                        <span
                          className="text-sm font-semibold tracking-tight"
                          style={{ color: "var(--ink)" }}
                        >
                          {ORB_MODES.find((m) => m.state === selectedOrbState)?.label || "Thinking"}
                        </span>
                        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                          {ORB_MODES.find((m) => m.state === selectedOrbState)?.desc || "Crest pulse"}
                        </p>

                        {/* Speed multiplier pill buttons */}
                        <div className="flex items-center gap-1 mt-2.5 rounded-full p-0.5 border" style={{ borderColor: "var(--line)", background: "var(--paper-3)" }}>
                          {[0.5, 1, 2].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setOrbSpeed(s)}
                              className="px-2 py-0.5 rounded-full text-[10.5px] font-mono transition-colors"
                              style={{
                                background: orbSpeed === s ? "var(--ink)" : "transparent",
                                color: orbSpeed === s ? "var(--paper)" : "var(--ink-3)",
                              }}
                            >
                              {s}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* State selector grid */}
                      <div className="p-2.5 border-b" style={{ borderColor: "var(--line)" }}>
                        <p className="text-[10.5px] font-mono uppercase tracking-wider px-1.5 mb-1.5" style={{ color: "var(--ink-4)" }}>
                          Crest moods
                        </p>
                        <div className="grid grid-cols-3 gap-1">
                          {ORB_MODES.map((mode) => {
                            const isSelected = selectedOrbState === mode.state;
                            return (
                              <button
                                key={mode.state}
                                type="button"
                                onClick={() => setSelectedOrbState(mode.state)}
                                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition-all"
                                style={{
                                  background: isSelected ? "var(--brand-soft)" : "transparent",
                                  color: isSelected ? "var(--brand)" : "var(--ink-2)",
                                  fontWeight: isSelected ? 600 : 400,
                                }}
                              >
                                <span className="size-4 shrink-0 flex items-center justify-center">
                                  <AiCrest mood={orbStateToMood(mode.state)} size={16} />
                                </span>
                                <span className="truncate text-[11.5px]">{mode.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholder}
              aria-label="Message"
              disabled={disabled}
              className="h-auto flex-1 border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent md:text-sm"
            />
          </div>
          {trailing}
          <Button
            type="button"
            onClick={handleSend}
            onMouseDown={(e) => e.preventDefault()}
            variant={hasText || canSend ? "default" : "secondary"}
            size="icon"
            aria-label="Send message"
            disabled={disabled || (!hasText && !canSend)}
            className="size-10 shrink-0 rounded-xl transition-colors active:scale-95"
          >
            <Send className="size-5" strokeWidth={2.25} />
          </Button>
        </div>

        {/* bubble stack — floats above the card */}
        {showBubbles && (
          <div className="pointer-events-none absolute bottom-[70px] right-0 z-[1] flex w-full flex-col items-end gap-2">
            <AnimatePresence initial={false}>
              {visible.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 24, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className={cn(
                    "max-w-[260px] break-words px-3.5 py-2.5 text-sm shadow-[0_10px_20px_-6px_rgba(0,0,0,0.15)]",
                    m.sender === "user"
                      ? "self-end rounded-[14px_14px_6px_14px] border border-border bg-background text-foreground"
                      : "self-start rounded-[14px_14px_14px_6px] bg-primary text-primary-foreground"
                  )}
                >
                  {m.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      </BorderBeam>

      {showGlow ? <SpectrumGlow active={hasMessages} colors={gradientColors} /> : null}
    </div>
  );
}

/** Blurred spectrum that glides up from the bottom edge-to-edge once a conversation starts. */
export function SpectrumGlow({
  active,
  colors = DEFAULT_GRADIENT,
  className,
}: {
  active: boolean;
  colors?: string[];
  className?: string;
}) {
  return (
    <motion.div
      aria-hidden
      initial={false}
      animate={active ? { opacity: 0.95, y: 0 } : { opacity: 0, y: "15%" }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "pointer-events-none absolute inset-x-0 -bottom-16 z-0 h-[105vh] w-full overflow-hidden",
        className,
      )}
      style={{
        maskImage: "linear-gradient(to top, black 0%, black 60%, rgba(0,0,0,0.3) 85%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to top, black 0%, black 60%, rgba(0,0,0,0.3) 85%, transparent 100%)",
      }}
    >
      {/* Edge-to-edge full-bleed ambient spectrum glow reaching the absolute bottom */}
      <div className="absolute inset-x-0 bottom-0 h-full w-full flex items-end">
        <div className="flex h-full w-full items-end -space-x-16">
          {colors.map((color, i) => (
            <div
              key={i}
              className="h-full flex-1 blur-[110px] transform-gpu scale-125 origin-bottom"
              style={{
                background: `radial-gradient(ellipse at bottom, ${color} 0%, ${color}99 50%, transparent 90%)`,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
