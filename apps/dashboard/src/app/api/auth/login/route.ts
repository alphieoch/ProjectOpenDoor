import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { verifyPassword, createToken } from "@/lib/auth";
import { posthogServerCapture } from "@/lib/posthog-server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const token = await createToken({
    sub: user.id,
    userId: user.id,
    email: user.email,
    orgId: user.organizationId,
    role: user.role,
    isSiteAdmin: user.isSiteAdmin ?? false,
  });

  posthogServerCapture(req, user.id, "user_signed_in", {
    email: user.email,
    auth_method: "password",
  });

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email },
  });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
