import { NextResponse, type NextRequest } from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { workosRedirectUri } from "@/lib/public-urls";

// WorkOS reads `process.env[name]` dynamically, which Next's Edge compiler
// does not inline. Reference the keys here so the middleware bundle gets them.
void process.env.WORKOS_API_KEY;
void process.env.WORKOS_CLIENT_ID;
void process.env.WORKOS_COOKIE_PASSWORD;
void process.env.WORKOS_COOKIE_NAME;
void process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;

const workos = authkitMiddleware({
  redirectUri: workosRedirectUri(),
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

export default async function middleware(request: NextRequest) {
  try {
    return await workos(request);
  } catch (err) {
    console.error("WorkOS middleware failed; continuing without session refresh.", err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|ingest|api/public|api/status).*)",
  ],
};
