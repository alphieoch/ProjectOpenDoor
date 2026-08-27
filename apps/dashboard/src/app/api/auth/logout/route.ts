import { NextResponse } from "next/server";
import { clearSessionCookies, sessionCookieOptions } from "@/lib/session-cookie";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  response.cookies.set(
    process.env.WORKOS_COOKIE_NAME || "wos-session",
    "",
    sessionCookieOptions(0)
  );
  return response;
}
