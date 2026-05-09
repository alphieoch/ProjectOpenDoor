import { z } from 'zod'

const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000'

export default defineEventHandler(async (event) => {
  const { slug } = await getValidatedRouterParams(event, z.object({
    slug: z.string()
  }).parse)

  const cookie = getRequestHeader(event, 'cookie') || ''

  try {
    const res = await $fetch(`${NEXTJS_API_URL}/api/public/assistants/${slug}`, {
      headers: {
        cookie
      }
    })
    return res
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode || 500,
      statusMessage: err.statusMessage || 'Failed to fetch assistant'
    })
  }
})
