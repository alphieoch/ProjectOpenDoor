<script setup lang="ts">
import ChatAiCrest from "./AiCrest.vue"

withDefaults(defineProps<{
  mood?: "idle" | "ready" | "thinking" | "searching" | "error"
  size?: number
}>(), {
  mood: "thinking",
  size: 16,
})
</script>

<template>
  <ChatAiCrest :mood="mood" :size="size" />
</template>
