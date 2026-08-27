export interface Env {
  ORIGIN_URL?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ORIGIN_URL || "https://alphonce-edge-proxy.cloudflare-edge.workers.dev";
    const originUrl = new URL(origin);

    const targetUrl = new URL(url.pathname + url.search, originUrl.origin);

    // 1. Static Asset Edge Caching (_next/static, images, fonts, icons)
    const isCacheable =
      request.method === "GET" &&
      (url.pathname.startsWith("/_next/static/") ||
        url.pathname.startsWith("/static/") ||
        url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$/i));

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);

    if (isCacheable) {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseWithHeader = new Response(cachedResponse.body, cachedResponse);
        responseWithHeader.headers.set("CF-Cache-Status", "HIT");
        return responseWithHeader;
      }
    }

    // 2. Clone headers and forward to Origin
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set("X-Forwarded-Host", url.host);
    forwardHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    forwardHeaders.set("X-Real-IP", request.headers.get("cf-connecting-ip") || "");
    forwardHeaders.set("X-Client-Country", request.headers.get("cf-ipcountry") || "XX");
    forwardHeaders.set("Host", originUrl.host);

    const originRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow",
    });

    try {
      const originResponse = await fetch(originRequest);

      const responseHeaders = new Headers(originResponse.headers);
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      responseHeaders.set("X-Frame-Options", "SAMEORIGIN");
      responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
      responseHeaders.set("X-Edge-Router", "OpenDoor-Cloudflare-Worker");

      if (isCacheable && originResponse.status === 200) {
        responseHeaders.set("Cache-Control", "public, max-age=2592000, s-maxage=2592000, immutable");
        const responseToCache = new Response(originResponse.clone().body, {
          status: originResponse.status,
          headers: responseHeaders,
        });
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
        responseHeaders.set("CF-Cache-Status", "MISS");
      }

      return new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: "Bad Gateway",
          message: "Could not connect to backend origin from Cloudflare Edge.",
          details: err?.message || String(err),
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
