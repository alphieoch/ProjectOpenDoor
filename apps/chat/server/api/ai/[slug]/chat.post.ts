import { z } from 'zod'

const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000'

export default defineEventHandler(async (event) => {
  const { slug } = await getValidatedRouterParams(event, z.object({
    slug: z.string()
  }).parse)

  const body = await readBody(event)
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

    // Stream the response back
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
