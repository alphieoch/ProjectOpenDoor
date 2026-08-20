import { NextResponse } from "next/server";
import { verifySiteAdmin, createToken } from "@/lib/auth";
import { applySessionCookies } from "@/lib/session-cookie";

export async function POST() {
  const auth = await verifySiteAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { session } = auth;

  const token = await createToken({
    sub: session.userId,
    userId: session.userId,
    email: session.email,
    orgId: session.orgId,
    role: session.role,
    isSiteAdmin: true,
  });

  const response = NextResponse.json({ success: true });
  applySessionCookies(response, token);

  return response;
}
