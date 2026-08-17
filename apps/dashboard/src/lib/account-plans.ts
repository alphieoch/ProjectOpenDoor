import { PLANS, formatUsd } from "@opendoor/shared";

export type AccountPlanId = "pro" | "team" | "enterprise";

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

const pro = PLANS.pro;
const team = PLANS.team;
const enterprise = PLANS.enterprise;

export const ACCOUNT_PLANS: AccountPlan[] = [
  {
    id: "pro",
    name: "PRO",
    subtitle: "PRO Account",
    tagline: "No free tier. $12 vs Perplexity Pro at $20. Tokens and GPUs stay pay-as-you-go.",
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
      "Agents add-on included (OpenClaw, Hermes, NemoClaw)",
    ],
  },
];
