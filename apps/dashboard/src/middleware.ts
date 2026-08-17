import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  redirectUri:
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010"}/callback`,
  middlewareAuth: {
    enabled: false,
    unauthenticatedPaths: [
      "/",
      "/login",
      "/sign-in",
      "/sign-up",
      "/callback",
      "/platform",
      "/pricing",
      "/how-it-works",
      "/security",
      "/status",
      "/terms",
      "/privacy",
      "/docs",
      "/docs/:path*",
      "/get-started",
      "/signup",
    ],
  },
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|ingest|api/public|api/status).*)",
  ],
};
