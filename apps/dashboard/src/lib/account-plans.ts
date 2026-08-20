import { formatPlanPriceUsd, formatUsd, getPlan } from "@opendoor/shared";

export type AccountPlanId = "student" | "pro" | "ultra" | "family" | "family_max" | "team" | "enterprise";
export type PricingAudienceId = "single" | "family" | "enterprise";

export type AccountPlan = {
  id: AccountPlanId;
  name: string;
  subtitle?: string;
  tagline: string;
  price: number;
  priceSuffix: string;
  included: string;
  cta: string;
  href: string;
  featured?: boolean;
  badge?: string;
  inherit?: string;
  plus?: string;
  features: string[];
};

const student = getPlan("student");
const pro = getPlan("pro");
const team = getPlan("team");
const enterprise = getPlan("enterprise");

export const ACCOUNT_PLANS: AccountPlan[] = [
  {
    id: "student",
    name: "Student",
    subtitle: "Student",
    tagline: "Warehouse membership for school. Same inference path as Pro — including open-weight — with a small stipend so the seat still profits.",
    price: student.amountUsd,
    priceSuffix: "/month",
    included: `${formatUsd(student.includedCreditsCents)} inference credit each month`,
    cta: "Get Student",
    href: "/login?signup=1&plan=student&segment=education",
    badge: "Best value",
    features: [
      `${formatUsd(student.includedCreditsCents)} included inference credit every month, then pay-as-you-go`,
      "Open-weight and closed models on the same stipend",
      `${student.rateLimitMultiplier}× API rate limits`,
      `${student.maxApiKeys} API keys`,
      `${student.maxActiveDeployments} dedicated deployment`,
    ],
  },
  {
    id: "pro",
    name: "PRO",
    subtitle: "PRO Account",
    tagline: `Membership at ${formatPlanPriceUsd(pro.amountUsd)} vs Perplexity Pro at $20. Tokens stay warehouse-priced after a small monthly taste.`,
    price: pro.amountUsd,
    priceSuffix: "/month",
    included: `${formatUsd(pro.includedCreditsCents)} inference credit each month`,
    cta: "Get Pro",
    href: "/login?signup=1&plan=pro",
    features: [
      `${formatUsd(pro.includedCreditsCents)} included inference credit every month, then pay-as-you-go`,
      `Top up $20+ once and get $5 extra on open-weight models`,
      `${pro.rateLimitMultiplier}× API rate limits`,
      "Priority request queue (`service_tier=priority`)",
      `${pro.maxActiveDeployments} concurrent dedicated deployments (GPU billed per second)`,
      `${pro.maxApiKeys} API keys`,
      "Full request logs and playground history",
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "SSO and shared controls — under Perplexity Enterprise Pro ($40/seat).",
    price: team.amountUsd,
    priceSuffix: "/month per user",
    included: `${formatUsd(team.includedCreditsCents)} inference credit per seat each month`,
    cta: "Get Team (via credit card)",
    href: "/login?signup=1&plan=team",
    featured: true,
    badge: "Most popular",
    plus: "Every member shares the org’s Team limits and monthly credit",
    features: [
      `${formatUsd(team.includedCreditsCents)} included inference credit per seat every month`,
      "SSO support (SAML & OIDC)",
      "Audit logs, policies, and API key approvals",
      "Data residency controls",
      `${team.rateLimitMultiplier}× API rate limits`,
      `${team.maxActiveDeployments} concurrent dedicated deployments (GPU billed per second)`,
      `${team.maxApiKeys} API keys`,
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Residency, SCIM, and a dedicated path — under Perplexity Enterprise and Hugging Face.",
    price: enterprise.amountUsd,
    priceSuffix: "/month per user",
    included: `${formatUsd(enterprise.includedCreditsCents)} inference credit per seat each month`,
    cta: "Talk to sales",
    href: "mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise",
    inherit: "All benefits from the Team plan",
    features: [
      `${formatUsd(enterprise.includedCreditsCents)} included inference credit per seat every month`,
      `${enterprise.rateLimitMultiplier}× API rate limits`,
      `${enterprise.maxActiveDeployments} concurrent dedicated deployments`,
      "SCIM provisioning via WorkOS",
      "Managed billing and annual commitments",
      "Legal, compliance, and dedicated support",
      "Custom dashboard and API domain",
      "Governance: Trust Center, policies, violations, approvals, compliance, and sector packs",
      "Agents add-on included (OpenClaw, Hermes, NemoClaw, OpenBot)",
      "OpenDoor Search included (Vertex AI Grounding; otherwise list price per query)",
    ],
  },
];

export const PRICING_AUDIENCES: {
  id: PricingAudienceId;
  label: string;
  headline: string;
  blurb: string;
}[] = [
  {
    id: "single",
    label: "Single user",
    headline: "Plans for one person",
    blurb:
      "Student $9.99 and Pro $12 are the membership. A small inference taste is included; the rest is warehouse-rate tokens and GPUs — open-weight included.",
  },
  {
    id: "family",
    label: "Family",
    headline: "A shared pool for your household",
    blurb:
      "Cheaper than four Pro seats, and the house gets a bigger shared pool. Family Max is $99 for five seats and a $75 pool (more than 5× Pro tastes), with Agents included. Unused credit rolls four months.",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    headline: "Plans for teams and orgs",
    blurb: "SSO, residency, and a dedicated path. Team is self-serve; Enterprise is talk to sales. Same gateway as Student and Pro.",
  },
];

export function planSignupHref(id: AccountPlanId) {
  if (id === "student") return "/login?signup=1&plan=student&segment=education";
  if (id === "enterprise") {
    return "mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise";
  }
  return `/login?signup=1&plan=${id}`;
}
