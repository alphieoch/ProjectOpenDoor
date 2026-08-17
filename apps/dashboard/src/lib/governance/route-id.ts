export async function routeId(
  params: { id: string } | Promise<{ id: string }>,
): Promise<string> {
  const resolved = await Promise.resolve(params);
  return resolved.id;
}
