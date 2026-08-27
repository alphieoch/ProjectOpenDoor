<script setup lang="ts">
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

const route = useRoute()
const toast = useToast()
const slug = route.params.slug as string

const { data: assistant } = await useFetch(`/api/assistants/${slug}`, {
  key: `assistant-${slug}`,
  cache: 'force-cache'
})

const isOwner = computed(() => assistant.value?.isOwner ?? false)
const hasAccess = computed(() => assistant.value?.hasAccess ?? false)
const needsPassword = computed(() => assistant.value?.passwordProtected === true && !isOwner.value)
const needsPayment = computed(() =>
  assistant.value?.monetization !== 'free' &&
  !isOwner.value &&
  !hasAccess.value
)

const usageMode = computed(() => assistant.value?.usageMode ?? 'included')

// Session limit
const messagesRemaining = computed(() => assistant.value?.messagesRemaining ?? null)
const messagesUsed = computed(() => assistant.value?.messagesUsed ?? 0)
const messagesLimit = computed(() => assistant.value?.maxMessages ?? null)
const hasMessageLimit = computed(() => messagesLimit.value !== null && messagesLimit.value > 0)
const cooldownMinutesRemaining = computed(() => assistant.value?.cooldownMinutesRemaining ?? null)

// Period limit
const periodWindow = computed(() => assistant.value?.periodWindow ?? null)
const periodMessageLimit = computed(() => assistant.value?.periodMessageLimit ?? null)
const periodMessagesUsed = computed(() => assistant.value?.periodMessagesUsed ?? 0)
const periodMessagesRemaining = computed(() => assistant.value?.periodMessagesRemaining ?? null)
const periodMinutesRemaining = computed(() => assistant.value?.periodMinutesRemaining ?? null)
const hasPeriodLimit = computed(() => periodMessageLimit.value !== null && periodMessageLimit.value > 0)

// Weekly limit
const weeklyMessageLimit = computed(() => assistant.value?.weeklyMessageLimit ?? null)
const weeklyMessagesUsed = computed(() => assistant.value?.weeklyMessagesUsed ?? 0)
const weeklyMessagesRemaining = computed(() => assistant.value?.weeklyMessagesRemaining ?? null)
const weeklyMinutesRemaining = computed(() => assistant.value?.weeklyMinutesRemaining ?? null)
const hasWeeklyLimit = computed(() => weeklyMessageLimit.value !== null && weeklyMessageLimit.value > 0)

// Token limits
const maxTokensPerSession = computed(() => assistant.value?.maxTokensPerSession ?? null)
const maxTokensPerMessage = computed(() => assistant.value?.maxTokensPerMessage ?? null)
const tokensUsed = computed(() => assistant.value?.tokensUsed ?? 0)
const tokensRemaining = computed(() => assistant.value?.tokensRemaining ?? null)
const hasTokenLimit = computed(() => maxTokensPerSession.value !== null && maxTokensPerSession.value > 0)
const costCapCents = computed(() => assistant.value?.costCapCents ?? null)
const costUsed = computed(() => assistant.value?.costUsed ?? 0)
const costRemaining = computed(() => assistant.value?.costRemaining ?? null)
const hasCostCap = computed(() => costCapCents.value !== null && costCapCents.value > 0)

// Feature toggles
const enabledFeatures = computed(() => {
  const feats = []
  if (assistant.value?.deepThinkingEnabled) feats.push({ label: 'Deep thinking', icon: 'i-lucide-brain' })
  if (assistant.value?.webSearchEnabled) feats.push({ label: 'Web search', icon: 'i-lucide-globe' })
  if (assistant.value?.researchAgentEnabled) feats.push({ label: 'Research agent', icon: 'i-lucide-microscope' })
  if (assistant.value?.codeExecutionEnabled) feats.push({ label: 'Code', icon: 'i-lucide-code' })
  if (assistant.value?.imageGenerationEnabled) feats.push({ label: 'Images', icon: 'i-lucide-image' })
  return feats
})

const isLimitReached = computed(() => {
  if (usageMode.value !== 'included') return false
  // Session limit reached and no cooldown
  const sessionBlocked = hasMessageLimit.value && messagesRemaining.value !== null && messagesRemaining.value <= 0 && cooldownMinutesRemaining.value === null
  // Period limit reached
  const periodBlocked = hasPeriodLimit.value && periodMessagesRemaining.value !== null && periodMessagesRemaining.value <= 0
  // Weekly limit reached
  const weeklyBlocked = hasWeeklyLimit.value && weeklyMessagesRemaining.value !== null && weeklyMessagesRemaining.value <= 0
  // Token limit reached
  const tokenBlocked = hasTokenLimit.value && tokensRemaining.value !== null && tokensRemaining.value <= 0
  // Cost cap reached
  const costBlocked = hasCostCap.value && costRemaining.value !== null && costRemaining.value <= 0
  return sessionBlocked || periodBlocked || weeklyBlocked || tokenBlocked || costBlocked
})

// Countdown timers
const countdowns = ref<Record<string, number | null>>({
  cooldown: null,
  period: null,
  weekly: null,
})
let countdownInterval: ReturnType<typeof setInterval> | null = null

function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval)

  const targets: Record<string, number | null> = {
    cooldown: cooldownMinutesRemaining.value,
    period: periodMinutesRemaining.value,
    weekly: weeklyMinutesRemaining.value,
  }

  // Initialize countdowns
  for (const [key, val] of Object.entries(targets)) {
    countdowns.value[key] = val !== null && val > 0 ? val : null
  }

  if (Object.values(countdowns.value).some(v => v !== null)) {
    countdownInterval = setInterval(() => {
      let anyActive = false
      for (const key of Object.keys(countdowns.value)) {
        const current = countdowns.value[key]
        if (current !== null && current > 0) {
          countdowns.value[key] = current - 1
          anyActive = true
        } else {
          countdowns.value[key] = null
        }
      }
      if (!anyActive) {
        if (countdownInterval) clearInterval(countdownInterval)
        refreshNuxtData(`assistant-${slug}`)
      }
    }, 60000)
  }
}

onMounted(startCountdowns)
watch([cooldownMinutesRemaining, periodMinutesRemaining, weeklyMinutesRemaining], startCountdowns)
onBeforeUnmount(() => {
  if (countdownInterval) clearInterval(countdownInterval)
})

const password = ref('')
const passwordVerified = ref(false)
const passwordChecking = ref(false)
const passwordError = ref('')

async function verifyPassword() {
  if (!password.value.trim()) return
  passwordChecking.value = true
  passwordError.value = ''
  try {
    await $fetch(`/api/assistants/${slug}/verify-password`, {
      method: 'POST',
      body: { password: password.value }
    })
    passwordVerified.value = true
  } catch (error: any) {
    passwordError.value = error.statusCode === 401 ? 'Incorrect password' : 'Verification failed'
  } finally {
    passwordChecking.value = false
  }
}

const purchasing = ref(false)
const currentUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.href
  }
  return `http://localhost:3002/ai/${slug}`
})

async function startPurchase() {
  purchasing.value = true
  try {
    const res = await $fetch(`/api/assistants/${slug}/checkout`, {
      method: 'POST',
      body: { returnUrl: currentUrl.value }
    })
    if ((res as any)?.url) {
      window.location.href = (res as any).url
    }
  } catch (error: any) {
    const message = error.statusCode === 401
      ? 'Please sign in to purchase access'
      : (error.statusMessage || 'Purchase failed')
    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 5000
    })
  } finally {
    purchasing.value = false
  }
}

const input = ref('')

const chat = new Chat({
  id: slug,
  messages: assistant.value?.welcomeMessage
    ? [{ id: 'welcome', role: 'assistant', content: assistant.value.welcomeMessage }]
    : [],
  transport: new DefaultChatTransport({
    api: `/api/ai/${slug}/chat`
  }),
  onError(error) {
    let message = error.message
    let statusCode: number | null = null
    if (typeof message === 'string' && message[0] === '{') {
      try {
        const parsed = JSON.parse(message)
        message = parsed.message || parsed.error || message
        statusCode = parsed.statusCode || null
      } catch {
        // keep original message on malformed JSON
      }
    }

    // Handle message limit reached (429)
    if (statusCode === 429 || message.toLowerCase().includes('limit reached')) {
      // Refresh assistant data to get updated message count / cooldown info
      refreshNuxtData(`assistant-${slug}`)
    }

    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
})

async function handleSubmit(e: Event) {
  e.preventDefault()
  if (input.value.trim()) {
    chat.sendMessage({ text: input.value })
    input.value = ''
  }
}

async function regenerateMessage(message: UIMessage) {
  chat.regenerate({ messageId: message.id })
}

const editingMessageId = ref<string | null>(null)

const voteMap = ref<Record<string, boolean | null>>({})

function getVote(messageId: string): boolean | null {
  return voteMap.value[messageId] ?? null
}

function vote(messageId: string, isUpvoted: boolean) {
  const current = getVote(messageId)
  voteMap.value[messageId] = current === isUpvoted ? null : isUpvoted
}
</script>

<template>
  <UDashboardPanel
    v-if="assistant?.id"
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <Navbar>
        <template #title>
          <span class="flex items-center gap-2 min-w-0">
            <ChatAiCrest mood="ready" :size="22" />
            <span class="text-sm font-medium text-highlighted truncate min-w-0 max-w-3xs">
              {{ assistant.name }}
            </span>
          </span>
        </template>

        <span v-if="assistant.description" class="text-xs text-muted truncate max-w-xs hidden sm:inline">
          {{ assistant.description }}
        </span>

        <div v-if="enabledFeatures.length" class="hidden sm:flex items-center gap-1.5">
          <span
            v-for="feat in enabledFeatures"
            :key="feat.label"
            class="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400"
          >
            <UIcon :name="feat.icon" class="w-3 h-3" />
            {{ feat.label }}
          </span>
        </div>
      </Navbar>
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
        <!-- Payment gate -->
        <div v-if="needsPayment" class="flex-1 flex flex-col items-center justify-center gap-4">
          <div class="flex flex-col items-center gap-3">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" :style="{ background: assistant.primaryColor || '#1A73E8' }">
              <UIcon name="i-lucide-credit-card" class="w-6 h-6 text-white" />
            </div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ assistant.monetization === 'subscription' ? 'Subscription required' : 'Purchase required' }}
            </h2>
            <p class="text-sm text-muted text-center max-w-xs">
              This assistant requires {{ assistant.monetization === 'subscription' ? 'a monthly subscription' : 'a one-time purchase' }} to access.
            </p>
            <p class="text-xl font-bold" style="color: 'var(--brand)'">
              £{{ (assistant.priceCents / 100).toFixed(2) }}
              <span v-if="assistant.monetization === 'subscription'" class="text-sm font-normal text-muted">/month</span>
            </p>
            <p class="text-xs text-muted text-center">
              Includes platform & processing fees
            </p>
          </div>
          <div class="w-full max-w-xs space-y-2">
            <UButton
              :loading="purchasing"
              color="primary"
              block
              @click="startPurchase"
            >
              {{ assistant.monetization === 'subscription' ? 'Subscribe' : 'Purchase access' }}
            </UButton>
            <p class="text-xs text-muted text-center">
              Already purchased?
              <a :href="`http://localhost:3000/login?redirect=${encodeURIComponent(currentUrl)}`" class="underline" style="color: 'var(--brand)'">Sign in</a>
            </p>
          </div>
        </div>

        <!-- Password gate -->
        <div v-else-if="needsPassword && !passwordVerified" class="flex-1 flex flex-col items-center justify-center gap-4">
          <div class="flex flex-col items-center gap-3">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" :style="{ background: assistant.primaryColor || '#1A73E8' }">
              <UIcon name="i-lucide-lock" class="w-6 h-6 text-white" />
            </div>
            <h2 class="text-lg font-semibold text-highlighted">Password required</h2>
            <p class="text-sm text-muted text-center max-w-xs">
              This assistant is password protected. Enter the password to start chatting.
            </p>
          </div>
          <div class="w-full max-w-xs space-y-2">
            <UInput
              v-model="password"
              type="password"
              placeholder="Enter password"
              :ui="{ base: 'w-full' }"
              @keyup.enter="verifyPassword"
            />
            <p v-if="passwordError" class="text-xs text-error text-center">{{ passwordError }}</p>
            <UButton
              :loading="passwordChecking"
              :disabled="!password.trim()"
              color="primary"
              block
              @click="verifyPassword"
            >
              Unlock chat
            </UButton>
          </div>
        </div>

        <template v-else>
          <!-- Message limits indicator (Claude-style) -->
          <div v-if="(hasMessageLimit || hasPeriodLimit || hasWeeklyLimit) && !isOwner" class="px-4 pt-2 space-y-2">
            <!-- Session limit -->
            <div v-if="hasMessageLimit">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Session</span>
                <span :class="[
                  'font-medium',
                  messagesRemaining !== null && messagesRemaining <= 0 ? 'text-error' : messagesRemaining !== null && messagesRemaining <= 3 ? 'text-warning' : 'text-muted'
                ]">
                  {{ messagesUsed }}{{ messagesLimit !== null ? ` / ${messagesLimit}` : '' }}
                  <span v-if="messagesRemaining !== null && messagesRemaining > 0">({{ messagesRemaining }} left)</span>
                </span>
              </div>
              <div v-if="messagesLimit !== null" class="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="[
                    messagesRemaining !== null && messagesRemaining <= 0 ? 'bg-red-500' : messagesRemaining !== null && messagesRemaining <= 3 ? 'bg-amber-500' : 'bg-primary-500'
                  ]"
                  :style="{ width: `${Math.min(100, (messagesUsed / messagesLimit) * 100)}%` }"
                />
              </div>
            </div>

            <!-- Period limit -->
            <div v-if="hasPeriodLimit">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted capitalize">{{ periodWindow?.replace('min', ' min')?.replace('hour', ' hour')?.replace('12hour', '12 hour')?.replace('daily', '24 hour') }}</span>
                <span :class="[
                  'font-medium',
                  periodMessagesRemaining !== null && periodMessagesRemaining <= 0 ? 'text-error' : periodMessagesRemaining !== null && periodMessagesRemaining <= 3 ? 'text-warning' : 'text-muted'
                ]">
                  {{ periodMessagesUsed }}{{ periodMessageLimit !== null ? ` / ${periodMessageLimit}` : '' }}
                  <span v-if="periodMessagesRemaining !== null && periodMessagesRemaining > 0">({{ periodMessagesRemaining }} left)</span>
                  <span v-else-if="periodMinutesRemaining !== null && periodMinutesRemaining > 0">
                    resets in {{ countdowns.period ?? periodMinutesRemaining }}m
                  </span>
                </span>
              </div>
              <div v-if="periodMessageLimit !== null" class="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="[
                    periodMessagesRemaining !== null && periodMessagesRemaining <= 0 ? 'bg-red-500' : periodMessagesRemaining !== null && periodMessagesRemaining <= 3 ? 'bg-amber-500' : 'bg-primary-500'
                  ]"
                  :style="{ width: `${Math.min(100, (periodMessagesUsed / periodMessageLimit) * 100)}%` }"
                />
              </div>
            </div>

            <!-- Weekly limit -->
            <div v-if="hasWeeklyLimit">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Weekly</span>
                <span :class="[
                  'font-medium',
                  weeklyMessagesRemaining !== null && weeklyMessagesRemaining <= 0 ? 'text-error' : weeklyMessagesRemaining !== null && weeklyMessagesRemaining <= 3 ? 'text-warning' : 'text-muted'
                ]">
                  {{ weeklyMessagesUsed }}{{ weeklyMessageLimit !== null ? ` / ${weeklyMessageLimit}` : '' }}
                  <span v-if="weeklyMessagesRemaining !== null && weeklyMessagesRemaining > 0">({{ weeklyMessagesRemaining }} left)</span>
                  <span v-else-if="weeklyMinutesRemaining !== null && weeklyMinutesRemaining > 0">
                    resets in {{ countdowns.weekly ?? weeklyMinutesRemaining }}m
                  </span>
                </span>
              </div>
              <div v-if="weeklyMessageLimit !== null" class="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="[
                    weeklyMessagesRemaining !== null && weeklyMessagesRemaining <= 0 ? 'bg-red-500' : weeklyMessagesRemaining !== null && weeklyMessagesRemaining <= 3 ? 'bg-amber-500' : 'bg-primary-500'
                  ]"
                  :style="{ width: `${Math.min(100, (weeklyMessagesUsed / weeklyMessageLimit) * 100)}%` }"
                />
              </div>
            </div>

            <!-- Token limit -->
            <div v-if="hasTokenLimit">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Tokens</span>
                <span :class="[
                  'font-medium',
                  tokensRemaining !== null && tokensRemaining <= 0 ? 'text-error' : tokensRemaining !== null && tokensRemaining <= 1000 ? 'text-warning' : 'text-muted'
                ]">
                  {{ tokensUsed.toLocaleString() }}{{ maxTokensPerSession !== null ? ` / ${maxTokensPerSession.toLocaleString()}` : '' }}
                  <span v-if="tokensRemaining !== null && tokensRemaining > 0">({{ tokensRemaining.toLocaleString() }} left)</span>
                </span>
              </div>
              <div v-if="maxTokensPerSession !== null" class="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="[
                    tokensRemaining !== null && tokensRemaining <= 0 ? 'bg-red-500' : tokensRemaining !== null && tokensRemaining <= 1000 ? 'bg-amber-500' : 'bg-primary-500'
                  ]"
                  :style="{ width: `${Math.min(100, (tokensUsed / maxTokensPerSession) * 100)}%` }"
                />
              </div>
            </div>

            <!-- Cost cap -->
            <div v-if="hasCostCap">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Cost</span>
                <span :class="[
                  'font-medium',
                  costRemaining !== null && costRemaining <= 0 ? 'text-error' : costRemaining !== null && costRemaining <= costCapCents * 0.2 ? 'text-warning' : 'text-muted'
                ]">
                  £{{ (costUsed / 100).toFixed(2) }}{{ costCapCents !== null ? ` / £${(costCapCents / 100).toFixed(2)}` : '' }}
                  <span v-if="costRemaining !== null && costRemaining > 0">(£{{ (costRemaining / 100).toFixed(2) }} left)</span>
                </span>
              </div>
              <div v-if="costCapCents !== null" class="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="[
                    costRemaining !== null && costRemaining <= 0 ? 'bg-red-500' : costRemaining !== null && costRemaining <= costCapCents * 0.2 ? 'bg-amber-500' : 'bg-primary-500'
                  ]"
                  :style="{ width: `${Math.min(100, (costUsed / costCapCents) * 100)}%` }"
                />
              </div>
            </div>

            <!-- Limit reached message -->
            <p v-if="isLimitReached" class="text-xs text-error">
              <UIcon name="i-lucide-alert-circle" class="w-3 h-3 inline mr-0.5" />
              You have reached a limit.
              <span v-if="cooldownMinutesRemaining !== null && cooldownMinutesRemaining > 0">
                Session cooldown: {{ countdowns.cooldown ?? cooldownMinutesRemaining }}m remaining.
              </span>
              <span v-else-if="periodMinutesRemaining !== null && periodMinutesRemaining > 0">
                Period resets in {{ countdowns.period ?? periodMinutesRemaining }}m.
              </span>
              <span v-else-if="weeklyMinutesRemaining !== null && weeklyMinutesRemaining > 0">
                Weekly resets in {{ countdowns.weekly ?? weeklyMinutesRemaining }}m.
              </span>
            </p>
          </div>

          <div
            v-if="!chat.messages.some((m) => m.role === 'user')"
            class="flex justify-center pt-(--ui-header-height) pb-2"
          >
            <ChatAiCrest mood="idle" :size="45" />
          </div>

          <UChatMessages
            should-auto-scroll
            :messages="chat.messages"
            :status="chat.status"
            class="pt-(--ui-header-height) pb-4 sm:pb-6"
          >
            <template #indicator>
              <div class="flex items-center gap-1.5">
                <ChatIndicator />
                <UChatShimmer text="Thinking..." class="text-sm" />
              </div>
            </template>

            <template #content="{ message }">
              <ChatMessageContent
                :message="message"
                :editing="editingMessageId === message.id"
                @save="(msg, text) => { chat.editMessage({ messageId: msg.id, text }); editingMessageId = null }"
                @cancel-edit="editingMessageId = null"
              />
            </template>

            <template #actions="{ message }">
              <ChatMessageActions
                :message="message"
                :streaming="chat.status === 'streaming' && message.id === chat.messages[chat.messages.length - 1]?.id"
                :editing="editingMessageId === message.id"
                :vote="getVote(message.id)"
                @vote="(_message, isUpvoted) => vote(message.id, isUpvoted)"
                @regenerate="regenerateMessage"
                @edit="editingMessageId = message.id"
              />
            </template>
          </UChatMessages>

          <UChatPrompt
            v-model="input"
            :error="chat.error"
            :disabled="isLimitReached"
            variant="subtle"
            class="relative sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
            :ui="{ base: 'px-1.5' }"
            @submit="handleSubmit"
          >
            <template #footer>
              <div class="flex items-center gap-1">
                <ChatAiCrest
                  v-if="chat.messages.some((m) => m.role === 'user')"
                  class="pointer-events-none"
                  :mood="chat.error ? 'error' : (chat.status === 'submitted' || chat.status === 'streaming') ? 'thinking' : 'ready'"
                  :size="20"
                />
              </div>

              <UChatPromptSubmit
                :status="chat.status"
                :disabled="isLimitReached"
                color="neutral"
                size="sm"
                @stop="chat.stop()"
                @reload="chat.regenerate()"
              />
            </template>
          </UChatPrompt>
        </template>
      </UContainer>
    </template>
  </UDashboardPanel>

  <UContainer v-else class="flex-1 flex flex-col gap-4 sm:gap-6">
    <UError :error="{ statusMessage: 'Assistant not found', statusCode: 404 }" class="min-h-full" />
  </UContainer>
</template>
