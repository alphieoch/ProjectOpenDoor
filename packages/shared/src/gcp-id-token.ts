/** Cloud Run IAM: attach an ADC identity token when calling *.run.app. */

const tokenCache = new Map<string, { token: string; exp: number }>();

export function needsCloudRunIdentity(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".run.app");
  } catch {
    return false;
  }
}

export async function cloudRunIdentityToken(audience: string): Promise<string | null> {
  const cached = tokenCache.get(audience);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const meta =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
    `?audience=${encodeURIComponent(audience)}`;
  try {
    const res = await fetch(meta, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const token = (await res.text()).trim();
    if (!token) return null;
    tokenCache.set(audience, { token, exp: Date.now() + 50 * 60 * 1000 });
    return token;
  } catch {
    return null;
  }
}

export async function privateImageAuthHeaders(targetUrl: string): Promise<Record<string, string>> {
  if (!needsCloudRunIdentity(targetUrl)) return {};
  const audience = new URL(targetUrl).origin;
  const token = await cloudRunIdentityToken(audience);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
