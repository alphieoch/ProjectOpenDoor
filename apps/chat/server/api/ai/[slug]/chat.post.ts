import { createOpenAI } from '@ai-sdk/openai'
import { convertToModelMessages, streamText } from 'ai'
import { z } from 'zod'

const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000'

function toPlainMessages(messages: unknown): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  if (!Array.isArray(messages)) return []
  return messages.flatMap((raw) => {
    const message = raw as { role?: string; content?: unknown; parts?: Array<{ type?: string; text?: string }> }
    const role = message.role === 'assistant' || message.role === 'system' ? message.role : 'user'
    let content = ''
    if (typeof message.content === 'string') content = message.content
    else if (Array.isArray(message.parts)) {
      content = message.parts.filter((part) => part.type === 'text' && part.text).map((part) => part.text as string).join('\n')
    }
    return content.trim() ? [{ role, content }] : []
  })
}

export default defineEventHandler(async (event) => {
  const { slug } = await getValidatedRouterParams(event, z.object({
    slug: z.string()
  }).parse)

  const body = await readBody(event)
  const config = useRuntimeConfig(event)
  const apiKey = String(config.opendoorApiKey || process.env.OPENDOOR_API_KEY || '')
  const baseUrl = String(config.opendoorBaseUrl || process.env.OPENDOOR_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')

  if (apiKey) {
    const model = typeof body?.model === 'string' && body.model.trim()
      ? body.model.trim()
      : 'gemma-4-26b-a4b-it'
    const openai = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey
    })
    let messages
    try {
      messages = convertToModelMessages(body?.messages ?? [])
    } catch {
      messages = toPlainMessages(body?.messages)
    }
    const result = streamText({
      model: openai(model),
      messages
    })
    return result.toUIMessageStreamResponse()
  }

  const cookie = getRequestHeader(event, 'cookie') || ''

  try {
    const res = await fetch(`${NEXTJS_API_URL}/api/ai/${slug}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text()
      throw createError({
        statusCode: res.status,
        statusMessage: text || 'Chat request failed'
      })
    }

    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
      }
    })
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Chat proxy failed'
    })
  }
})
