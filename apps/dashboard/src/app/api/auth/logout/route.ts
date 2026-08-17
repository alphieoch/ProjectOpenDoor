import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  const clear = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
  // OpenDoor JWT session
  response.cookies.set("session", "", clear);
  // WorkOS AuthKit sealed session (default cookie name)
  response.cookies.set(
    process.env.WORKOS_COOKIE_NAME || "wos-session",
    "",
    clear
  );
  return response;
}
