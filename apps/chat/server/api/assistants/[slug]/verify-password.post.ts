export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const body = await readBody(event)
  try {
    return await $fetch(`http://localhost:3000/api/public/assistants/${slug}/verify-password`, {
      method: 'POST',
      body
    })
  } catch (error: any) {
    throw createError({ statusCode: error.statusCode || 500, statusMessage: error.statusMessage || 'Verification failed' })
  }
})
