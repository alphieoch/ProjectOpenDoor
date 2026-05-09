<script setup lang="ts">
const input = ref('')
const loading = ref(false)

const greeting = computed(() => {
  const hour = new Date().getHours()
  let timeGreeting = 'Good evening'
  if (hour < 12) timeGreeting = 'Good morning'
  else if (hour < 18) timeGreeting = 'Good afternoon'
  return timeGreeting
})

async function onSubmit() {
  if (!input.value.trim()) return
  loading.value = true
  // For now, navigate to a default assistant or show a message
  // In production, this could search for assistants or show a list
  navigateTo('/ai/preview-demo')
}

const quickChats = [
  { label: 'What can you help me with?', icon: 'i-lucide-help-circle' },
  { label: 'Tell me about yourself', icon: 'i-lucide-message-circle' },
  { label: 'Give me an example', icon: 'i-lucide-lightbulb' },
  { label: 'Help me get started', icon: 'i-lucide-zap' },
]
</script>

<template>
  <UDashboardPanel
    id="home"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar />
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8">
        <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
          {{ greeting }}
        </h1>

        <UChatPrompt
          v-model="input"
          :status="loading ? 'streaming' : 'ready'"
          class="[view-transition-name:chat-prompt]"
          variant="subtle"
          :ui="{ base: 'px-1.5' }"
          @submit="onSubmit"
        >
          <template #footer>
            <div class="flex items-center gap-1" />
            <UChatPromptSubmit color="neutral" size="sm" />
          </template>
        </UChatPrompt>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="quickChat in quickChats"
            :key="quickChat.label"
            :icon="quickChat.icon"
            :label="quickChat.label"
            size="sm"
            color="neutral"
            variant="outline"
            class="rounded-full"
            @click="navigateTo('/ai/preview-demo')"
          />
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
