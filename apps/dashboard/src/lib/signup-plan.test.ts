import { describe, expect, test } from "bun:test";
import {
  ENTERPRISE_SALES_HREF,
  SIGNUP_PLAN_COOKIE,
  SIGNUP_SEGMENT_COOKIE,
  SIGNUP_URLS,
  applySignupIntentCookies,
  attachSignupIntentToOAuthState,
  isWorkspaceUnpaid,
  postAuthPath,
  postAuthPathForWorkspace,
  readSignupIntentFromCookies,
  resolveCheckoutRequest,
  resolveSignupIntent,
  resolveSignupIntentFromRequest,
  signupIntentFromOAuthState,
  signupHrefForPlan,
} from "./signup-plan";

describe("signup plan query and OAuth state", () => {
  test("parses self-serve plans and honors education for Student", () => {
    expect(resolveSignupIntent({ plan: "family" })).toEqual({
      plan: "family",
      segment: "standard",
    });
    expect(resolveSignupIntent({ plan: "student" })).toEqual({
      plan: "student",
      segment: "education",
    });
    expect(resolveSignupIntent({ segment: "education" })).toEqual({
      plan: "student",
      segment: "education",
    });
    expect(resolveSignupIntent({ plan: "ultra", segment: "education" })).toEqual({
      plan: "ultra",
      segment: "standard",
    });
    expect(resolveSignupIntent({ plan: "enterprise" })).toEqual({
      plan: "enterprise",
      segment: "enterprise_intent",
    });
    expect(resolveSignupIntent({ plan: "not-a-plan" }).plan).toBeNull();
  });

  test("plan query survives OAuth state", () => {
    const started = attachSignupIntentToOAuthState(
      {
        nonce: "n1",
        codeVerifier: "pkce-verifier",
        returnPathname: "/dashboard",
      },
      resolveSignupIntent({ plan: "family", segment: "standard" })
    );

    expect(started.codeVerifier).toBe("pkce-verifier");
    expect(started.returnPathname).toBe("/dashboard");
    expect(started.plan).toBe("family");

    const recovered = signupIntentFromOAuthState(started);
    expect(recovered.plan).toBe("family");
    expect(recovered.segment).toBe("standard");

    const studentState = attachSignupIntentToOAuthState(
      { nonce: "n2", codeVerifier: "v2" },
      resolveSignupIntent({ plan: "student" })
    );
    expect(signupIntentFromOAuthState(studentState)).toEqual({
      plan: "student",
      segment: "education",
    });
  });

  test("signup URLs keep plan (and education) in the login query", () => {
    expect(signupHrefForPlan("family")).toBe("/login?signup=1&plan=family");
    expect(signupHrefForPlan("family_max")).toBe("/login?signup=1&plan=family_max");
    expect(signupHrefForPlan("team")).toBe("/login?signup=1&plan=team");
    expect(signupHrefForPlan("student")).toBe(
      "/login?signup=1&plan=student&segment=education"
    );
    expect(SIGNUP_URLS.enterprise).toBe(ENTERPRISE_SALES_HREF);
  });
});

describe("post-auth destination and Stripe", () => {
  test("unpaid self-serve plans go to billing checkout, not onboarding-only", () => {
    expect(
      postAuthPath({ plan: "family", isNew: true, unpaid: true })
    ).toBe("/dashboard/billing?checkout=family");
    expect(
      postAuthPath({ plan: "team", isNew: false, unpaid: true })
    ).toBe("/dashboard/billing?checkout=team");
    expect(
      postAuthPath({ plan: "ultra", isNew: true, unpaid: true })
    ).toBe("/dashboard/billing?checkout=ultra");
  });

  test("paid workspaces skip checkout even if a plan was remembered", () => {
    expect(
      postAuthPath({ plan: "pro", isNew: false, unpaid: false })
    ).toBe("/dashboard");
    expect(
      isWorkspaceUnpaid({
        plan: "pro",
        stripeSubscriptionId: "sub_1",
        subscriptionStatus: "active",
      })
    ).toBe(false);
    expect(
      isWorkspaceUnpaid({ plan: "free", stripeSubscriptionId: null, subscriptionStatus: "inactive" })
    ).toBe(true);
  });

  test("enterprise does not hit Stripe", () => {
    expect(postAuthPath({ plan: "enterprise", isNew: true, unpaid: true })).toBe(
      "/onboarding?plan=enterprise"
    );
    expect(postAuthPath({ plan: "enterprise", isNew: false, unpaid: true })).toBe(
      "/onboarding?plan=enterprise"
    );
    expect(postAuthPath({ plan: "enterprise", isNew: false, unpaid: false })).toBe(
      "/dashboard"
    );

    const decision = resolveCheckoutRequest({ planId: "enterprise" });
    expect(decision.ok).toBe(false);
    expect(decision.stripe).toBe(false);
    if (!decision.ok) {
      expect(decision.status).toBe(400);
      expect(decision.sales).toBe(ENTERPRISE_SALES_HREF);
      expect(decision.error).toMatch(/sales/i);
    }

    expect(resolveCheckoutRequest({ plan: "enterprise" }).stripe).toBe(false);
    expect(resolveCheckoutRequest({ planId: "family" })).toEqual({
      ok: true,
      plan: "family",
      stripe: true,
    });
  });

  test("request and cookie keep the selected plan through email login", () => {
    const cookies = new Map<string, { value: string }>();
    applySignupIntentCookies(
      {
        cookies: {
          set(name, value) {
            cookies.set(name, { value });
          },
        },
      },
      { plan: "team", segment: "standard" }
    );
    expect(cookies.get(SIGNUP_PLAN_COOKIE)?.value).toBe("team");
    expect(cookies.get(SIGNUP_SEGMENT_COOKIE)?.value).toBe("standard");
    expect(
      readSignupIntentFromCookies({
        get: (name) => cookies.get(name),
      }).plan
    ).toBe("team");

    expect(
      resolveSignupIntentFromRequest(
        {
          cookies: { get: (name) => cookies.get(name) },
          nextUrl: { searchParams: { get: () => null } },
        },
        { plan: "family" }
      ).plan
    ).toBe("family");

    expect(
      postAuthPathForWorkspace({
        plan: "family",
        isNew: false,
        org: { plan: "free", stripeSubscriptionId: null, subscriptionStatus: "inactive" },
      })
    ).toBe("/dashboard/billing?checkout=family");
    expect(
      postAuthPathForWorkspace({
        plan: "enterprise",
        isNew: true,
        org: { plan: "free" },
      })
    ).toBe("/onboarding?plan=enterprise");
  });
});
