export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010").replace(/\/$/, "");
}

export function gatewayBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

export function docsBaseUrl() {
  const app = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return app ? `${app}/docs` : "/docs";
}

export function docsHref(path = "/") {
  if (path.startsWith("/docs/") || path === "/docs") return path;
  const p = !path || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/docs${p}`;
}
