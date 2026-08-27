import { normalizeOnboardingSegment, type OnboardingSegment } from "@/lib/onboarding";
import type { AccountPlanId } from "@/lib/account-plans";

export const SIGNUP_PLAN_COOKIE = "od_signup_plan";
export const SIGNUP_SEGMENT_COOKIE = "od_signup_segment";
export const SIGNUP_INTENT_MAX_AGE = 60 * 30;

export const ENTERPRISE_SALES_HREF =
  "mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise";

export const SELF_SERVE_SIGNUP_PLANS = [
  "student",
  "pro",
  "ultra",
  "family",
  "family_max",
  "team",
] as const;

export const SIGNUP_PLANS = [...SELF_SERVE_SIGNUP_PLANS, "enterprise"] as const;

export type SelfServeSignupPlan = (typeof SELF_SERVE_SIGNUP_PLANS)[number];
export type SignupPlanId = (typeof SIGNUP_PLANS)[number];

export type SignupIntent = {
  plan: SignupPlanId | null;
  segment: OnboardingSegment;
};

export type OAuthSignupState = {
  nonce?: string;
  codeVerifier?: string;
  returnPathname?: string;
  plan?: string;
  segment?: string;
};

export type SignupPlanChip = {
  id: AccountPlanId;
  label: string;
  sales?: boolean;
};

export const SIGNUP_PLAN_CHIPS: SignupPlanChip[] = [
  { id: "student", label: "Student" },
  { id: "pro", label: "Pro" },
  { id: "family", label: "Family" },
  { id: "family_max", label: "Family Max" },
  { id: "team", label: "Team" },
  { id: "enterprise", label: "Enterprise", sales: true },
];

export const SIGNUP_URLS = {
  student: "/login?signup=1&plan=student&segment=education",
  pro: "/login?signup=1&plan=pro",
  ultra: "/login?signup=1&plan=ultra",
  family: "/login?signup=1&plan=family",
  family_max: "/login?signup=1&plan=family_max",
  team: "/login?signup=1&plan=team",
  enterprise: ENTERPRISE_SALES_HREF,
  enterpriseAccount: "/login?signup=1&plan=enterprise&segment=enterprise_intent",
} as const;

export function isSignupPlan(value: unknown): value is SignupPlanId {
  return typeof value === "string" && (SIGNUP_PLANS as readonly string[]).includes(value);
}

export function isSelfServeSignupPlan(value: unknown): value is SelfServeSignupPlan {
  return (
    typeof value === "string" &&
    (SELF_SERVE_SIGNUP_PLANS as readonly string[]).includes(value)
  );
}

export function parseSignupPlan(value: unknown): SignupPlanId | null {
  return isSignupPlan(value) ? value : null;
}

/**
 * Education landings without a plan become Student.
 * Student always keeps segment=education. Enterprise stays sales, not Stripe.
 */
export function resolveSignupIntent(input: {
  plan?: unknown;
  segment?: unknown;
}): SignupIntent {
  const plan = parseSignupPlan(input.plan);
  const segment = normalizeOnboardingSegment(input.segment);

  if (!plan && segment === "education") {
    return { plan: "student", segment: "education" };
  }
  if (plan === "student") {
    return { plan: "student", segment: "education" };
  }
  if (plan === "enterprise") {
    return { plan: "enterprise", segment: "enterprise_intent" };
  }
  return { plan, segment: plan ? "standard" : segment };
}

export function signupHrefForPlan(id: SignupPlanId) {
  return SIGNUP_URLS[id];
}

export function attachSignupIntentToOAuthState<T extends OAuthSignupState>(
  state: T,
  intent: SignupIntent
): T {
  return {
    ...state,
    ...(intent.plan ? { plan: intent.plan, segment: intent.segment } : {}),
  };
}

export function signupIntentFromOAuthState(state: unknown): SignupIntent {
  if (!state || typeof state !== "object") {
    return { plan: null, segment: "standard" };
  }
  const raw = state as OAuthSignupState;
  return resolveSignupIntent({ plan: raw.plan, segment: raw.segment });
}

export function isWorkspaceUnpaid(org?: {
  plan?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
} | null) {
  if (!org) return true;
  const plan = (org.plan || "free").toLowerCase();
  if (plan === "enterprise") return false;
  const status = (org.subscriptionStatus || "").toLowerCase();
  if (org.stripeSubscriptionId && (status === "active" || status === "trialing")) {
    return false;
  }
  return true;
}

export function postAuthPath(opts: {
  plan: SignupPlanId | null;
  isNew: boolean;
  unpaid: boolean;
}) {
  if (opts.plan === "enterprise") {
    if (!opts.unpaid && !opts.isNew) return "/dashboard";
    return "/onboarding?plan=enterprise";
  }
  if (opts.plan && isSelfServeSignupPlan(opts.plan) && opts.unpaid) {
    return `/dashboard/billing?checkout=${opts.plan}`;
  }
  if (opts.isNew) return "/dashboard/onboarding";
  return "/dashboard";
}

export type CheckoutPlanDecision =
  | { ok: true; plan: SelfServeSignupPlan; stripe: true }
  | {
      ok: false;
      status: 400;
      error: string;
      sales?: string;
      stripe: false;
    };

/** Enterprise is sales-only. Never start Stripe for it. */
export function resolveCheckoutRequest(input: {
  planId?: unknown;
  plan?: unknown;
}): CheckoutPlanDecision {
  const raw = input.planId ?? input.plan;
  if (raw === "enterprise") {
    return {
      ok: false,
      status: 400,
      error: "Enterprise is billed through sales",
      sales: ENTERPRISE_SALES_HREF,
      stripe: false,
    };
  }
  if (isSelfServeSignupPlan(raw)) {
    return { ok: true, plan: raw, stripe: true };
  }
  return {
    ok: false,
    status: 400,
    error: "This plan is not configured for checkout",
    stripe: false,
  };
}

type CookieStoreLike = {
  get(name: string): { value: string } | undefined;
};

type CookieResponse = {
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): unknown;
  };
};

function signupCookieOptions(maxAge = SIGNUP_INTENT_MAX_AGE, secure = false) {
  return {
    httpOnly: false,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function readSignupIntentFromCookies(store: CookieStoreLike): SignupIntent {
  return resolveSignupIntent({
    plan: store.get(SIGNUP_PLAN_COOKIE)?.value,
    segment: store.get(SIGNUP_SEGMENT_COOKIE)?.value,
  });
}

export function resolveSignupIntentFromRequest(
  req: { cookies: CookieStoreLike; nextUrl?: { searchParams: { get(name: string): string | null } } },
  body?: { plan?: unknown; segment?: unknown }
): SignupIntent {
  const cookie = readSignupIntentFromCookies(req.cookies);
  return resolveSignupIntent({
    plan: body?.plan ?? req.nextUrl?.searchParams.get("plan") ?? cookie.plan,
    segment: body?.segment ?? req.nextUrl?.searchParams.get("segment") ?? cookie.segment,
  });
}

export function postAuthPathForWorkspace(opts: {
  plan: SignupPlanId | null;
  isNew: boolean;
  org?: {
    plan?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
  } | null;
  orgLookupFailed?: boolean;
}) {
  let unpaid = opts.isNew;
  if (!opts.isNew) {
    unpaid = opts.orgLookupFailed ? false : isWorkspaceUnpaid(opts.org);
  }
  return postAuthPath({ plan: opts.plan, isNew: opts.isNew, unpaid });
}

export function applySignupIntentCookies(
  response: CookieResponse,
  intent: SignupIntent,
  secure = false
) {
  const opts = signupCookieOptions(SIGNUP_INTENT_MAX_AGE, secure);
  if (intent.plan) {
    response.cookies.set(SIGNUP_PLAN_COOKIE, intent.plan, opts);
    response.cookies.set(SIGNUP_SEGMENT_COOKIE, intent.segment, opts);
  } else {
    clearSignupIntentCookies(response, secure);
  }
  return response;
}

export function clearSignupIntentCookies(response: CookieResponse, secure = false) {
  const opts = signupCookieOptions(0, secure);
  response.cookies.set(SIGNUP_PLAN_COOKIE, "", opts);
  response.cookies.set(SIGNUP_SEGMENT_COOKIE, "", opts);
  return response;
}

export function persistSignupIntentClient(intent: SignupIntent) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  const base = `Path=/; Max-Age=${SIGNUP_INTENT_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
  if (!intent.plan) {
    document.cookie = `${SIGNUP_PLAN_COOKIE}=; ${base}; Max-Age=0`;
    document.cookie = `${SIGNUP_SEGMENT_COOKIE}=; ${base}; Max-Age=0`;
    return;
  }
  document.cookie = `${SIGNUP_PLAN_COOKIE}=${encodeURIComponent(intent.plan)}; ${base}`;
  document.cookie = `${SIGNUP_SEGMENT_COOKIE}=${encodeURIComponent(intent.segment)}; ${base}`;
}

export function readSignupIntentClient(): SignupIntent {
  if (typeof document === "undefined") return { plan: null, segment: "standard" };
  const parts = Object.fromEntries(
    document.cookie.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("=") || "")];
    })
  );
  return resolveSignupIntent({
    plan: parts[SIGNUP_PLAN_COOKIE],
    segment: parts[SIGNUP_SEGMENT_COOKIE],
  });
}
