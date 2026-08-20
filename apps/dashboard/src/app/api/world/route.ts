import { NextRequest, NextResponse } from "next/server";
import { persistWorldPreference } from "@opendoor/shared";
import { getSession } from "@/lib/auth";
import { applyWorldCookies } from "@/lib/i18n/cookies";
import { persistWorldToWorkspace, worldPreferenceFromRequest } from "@/lib/i18n/persist";
import { cookieSecureFromRequest } from "@/lib/session-cookie";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const preference = worldPreferenceFromRequest(req);
  return NextResponse.json({
    ...preference,
    authenticated: Boolean(session),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const preference = persistWorldPreference({
    ...worldPreferenceFromRequest(req, body),
    locale: body.locale ?? body.lang,
    region: body.region,
    country: body.country,
  });
  const session = await getSession();
  if (session?.userId || session?.orgId) {
    await persistWorldToWorkspace({
      userId: session.userId,
      orgId: session.orgId,
      preference,
    });
  }
  const response = NextResponse.json({ ok: true, ...preference });
  applyWorldCookies(response, preference, cookieSecureFromRequest(req));
  return response;
}
