export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const body = await readBody(event)
  try {
    return await $fetch(`http://localhost:3000/api/public/assistants/${slug}/checkout`, {
      method: 'POST',
      body,
      headers: {
        cookie: getRequestHeader(event, 'cookie') || ''
      }
    })
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode || 500,
      statusMessage: err.statusMessage || 'Checkout failed'
    })
  }
})
