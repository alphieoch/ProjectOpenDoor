<script setup lang="ts">
const AI_CREST_NAME = "Ai-crest"

type Mood = "idle" | "ready" | "thinking" | "searching" | "error"
type PatternName = "plus-full" | "sparkle" | "x-shape" | "spiral-cw"

const props = withDefaults(defineProps<{
  mood?: Mood
  size?: number
}>(), {
  mood: "idle",
  size: 32,
})

const PLUS: Array<Array<0 | 1>> = [
  [0, 1, 0],
  [1, 1, 1],
  [1, 1, 1],
  [0, 1, 0],
]

const PATTERNS: Record<PatternName, Array<Array<0 | 1>>> = {
  "plus-full": PLUS,
  sparkle: PLUS,
  "x-shape": [
    [1, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [1, 0, 1],
  ],
  "spiral-cw": [
    [1, 1, 1],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
}

const presentation = computed(() => {
  switch (props.mood) {
    case "ready":
      return { pattern: "plus-full" as const, color: "", glow: 0, duration: 2.4, delay: 1, staticMode: true, label: `${AI_CREST_NAME}: Ready` }
    case "thinking":
      return { pattern: "plus-full" as const, color: "#4ade80", glow: 1, duration: 2, delay: 0.9, staticMode: false, label: `${AI_CREST_NAME}: Generating` }
    case "searching":
      return { pattern: "plus-full" as const, color: "#60a5fa", glow: 1, duration: 1.8, delay: 0.85, staticMode: false, label: `${AI_CREST_NAME}: Searching` }
    case "error":
      return { pattern: "x-shape" as const, color: "#ff6b6b", glow: 0.55, duration: 1.4, delay: 0.85, staticMode: false, label: `${AI_CREST_NAME}: Error` }
    default:
      return { pattern: "plus-full" as const, color: "", glow: 0, duration: 2.4, delay: 1, staticMode: false, label: `${AI_CREST_NAME}: Idle` }
  }
})

const prefersReduced = ref(false)
let stopMotionListener: (() => void) | undefined
onMounted(() => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  prefersReduced.value = mq.matches
  const onChange = () => { prefersReduced.value = mq.matches }
  mq.addEventListener("change", onChange)
  stopMotionListener = () => mq.removeEventListener("change", onChange)
})
onUnmounted(() => stopMotionListener?.())

const shouldAnimate = computed(() => !presentation.value.staticMode && !prefersReduced.value)
const cellSize = computed(() => props.size / (3 + 2 * 0.4))
const gap = computed(() => cellSize.value * 0.4)
const pad = computed(() => (cellSize.value * (Math.SQRT2 - 1)) / 2)
const grid = computed(() => PATTERNS[presentation.value.pattern])

function delay(row: number, col: number) {
  return (((Math.abs(row) + Math.abs(col)) * 0.15) % 1.2) * presentation.value.delay
}
</script>

<template>
  <output
    data-grid-loader
    :data-reduced="shouldAnimate ? undefined : 'true'"
    role="status"
    :aria-label="presentation.label"
    class="inline-grid shrink-0 place-items-center text-black dark:text-white"
    :style="{
      gridTemplateColumns: `repeat(3, ${cellSize}px)`,
      gridTemplateRows: `repeat(4, ${cellSize}px)`,
      gap: `${gap}px`,
      padding: `${pad}px`,
      width: `${3 * cellSize + 2 * gap + 2 * pad}px`,
      height: `${4 * cellSize + 3 * gap + 2 * pad}px`,
    }"
  >
    <template v-for="(row, r) in grid" :key="r">
      <span
        v-for="(active, c) in row"
        :key="`${r}-${c}`"
        aria-hidden="true"
        class="block"
        :style="{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          borderRadius: 0,
          backgroundColor: active ? (presentation.color || 'currentColor') : 'rgba(255, 255, 255, 0.08)',
          transform: 'rotateZ(45deg)',
          boxShadow: active && presentation.glow > 0
            ? `0 0 ${cellSize * 0.5 * presentation.glow}px ${presentation.color || 'currentColor'}`
            : undefined,
          animation: shouldAnimate && active
            ? `chess-move ${presentation.duration}s ease-in-out ${delay(r, c)}s infinite`
            : undefined,
          opacity: shouldAnimate && active ? undefined : 1,
        }"
      />
    </template>
  </output>
</template>
