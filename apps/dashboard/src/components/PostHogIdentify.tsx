"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

type Props = {
  userId: string;
  email: string;
  orgId: string;
  role: string;
  isSiteAdmin: boolean;
  impersonatingOrgId?: string | null;
};

export function PostHogIdentify({
  userId,
  email,
  orgId,
  role,
  isSiteAdmin,
  impersonatingOrgId,
}: Props) {
  useEffect(() => {
    const hasKey =
      process.env.NEXT_PUBLIC_POSTHOG_KEY ||
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (!hasKey) return;

    posthog.identify(userId, {
      email,
      org_id: orgId,
      role,
      is_site_admin: isSiteAdmin,
      ...(impersonatingOrgId
        ? { impersonating_org_id: impersonatingOrgId }
        : {}),
    });
  }, [userId, email, orgId, role, isSiteAdmin, impersonatingOrgId]);

  return null;
}
