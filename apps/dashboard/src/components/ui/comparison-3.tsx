"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  planSignupHref,
  PRICING_AUDIENCES,
  type AccountPlanId,
  type PricingAudienceId,
} from "@/lib/account-plans";
import {
  SEARCH_QUERY_LIST_CENTS,
  WEB_SEARCH_ADDON,
  familyClubValue,
  formatPeriodWindow,
  formatPlanPriceUsd,
  formatUsd,
  formatUsdCents,
  getPlan,
  houseChatAllowanceForPlan,
} from "@opendoor/shared";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type CellValue = boolean | string;

type PlanColumn = {
  id: AccountPlanId;
  name: string;
  price: string;
  cadence: string;
  highlighted: boolean;
  badge?: string;
  cta: string;
};

type Feature = {
  label: string;
  values: CellValue[];
};

type FeatureGroup = {
  section: string;
  features: Feature[];
};

function chatAllowance(plan: AccountPlanId) {
  const a = houseChatAllowanceForPlan(plan);
  return `${a.periodMessageLimit} / ${formatPeriodWindow(a.periodWindow)} · ${a.weeklyMessageLimit}/wk`;
}

const planStudent = getPlan("student");
const planPro = getPlan("pro");
const planUltra = getPlan("ultra");
const planFamily = getPlan("family");
const planFamilyMax = getPlan("family_max");
const familyClub = familyClubValue("family");
const familyMaxClub = familyClubValue("family_max");
const planTeam = getPlan("team");
const planEnterprise = getPlan("enterprise");
const searchMetered = `${formatUsdCents(SEARCH_QUERY_LIST_CENTS)} / query or $${WEB_SEARCH_ADDON.amountUsd}/mo`;

const VIEW: Record<
  PricingAudienceId,
  { plans: PlanColumn[]; groups: FeatureGroup[] }
> = {
  single: {
    plans: [
      {
        id: "student",
        name: "Student",
        price: formatPlanPriceUsd(planStudent.amountUsd),
        cadence: "Per month",
        highlighted: false,
        badge: "Best value",
        cta: "Get Student",
      },
      {
        id: "pro",
        name: "Pro",
        price: formatPlanPriceUsd(planPro.amountUsd),
        cadence: "Per month",
        highlighted: true,
        badge: "Most popular",
        cta: "Get Pro",
      },
      {
        id: "ultra",
        name: "Ultra",
        price: formatPlanPriceUsd(planUltra.amountUsd),
        cadence: "Per month",
        highlighted: false,
        cta: "Get Ultra",
      },
    ],
    groups: [
      {
        section: "Core",
        features: [
          {
            label: "Included inference credit",
            values: [
              `${formatUsd(planStudent.includedCreditsCents)} / month`,
              `${formatUsd(planPro.includedCreditsCents)} / month`,
              `${formatUsd(planUltra.includedCreditsCents)} / month`,
            ],
          },
          { label: "Seats", values: ["1", "1", "1"] },
          {
            label: "API rate limits",
            values: [
              `${planStudent.rateLimitMultiplier}×`,
              `${planPro.rateLimitMultiplier}×`,
              `${planUltra.rateLimitMultiplier}×`,
            ],
          },
          {
            label: "API keys",
            values: [
              String(planStudent.maxApiKeys),
              String(planPro.maxApiKeys),
              String(planUltra.maxApiKeys),
            ],
          },
          {
            label: "Dedicated deployments",
            values: [
              String(planStudent.maxActiveDeployments),
              String(planPro.maxActiveDeployments),
              String(planUltra.maxActiveDeployments),
            ],
          },
          { label: "Open-weight + closed inference", values: [true, true, true] },
          { label: "Priority request queue", values: [false, true, true] },
          { label: "Pay-as-you-go tokens & GPUs", values: [true, true, true] },
        ],
      },
      {
        section: "OpenDoor Chat",
        features: [
          {
            label: "AI app early access",
            values: ["Coming soon", "Coming soon", "Priority · coming soon"],
          },
          {
            label: "Included Chat messages",
            values: [chatAllowance("student"), chatAllowance("pro"), chatAllowance("ultra")],
          },
        ],
      },
      {
        section: "Support",
        features: [
          { label: "Request logs & playground", values: [true, true, true] },
          { label: "Agents add-on", values: ["$20 / month", "$20 / month", "$20 / month"] },
          { label: "OpenDoor Search", values: [searchMetered, searchMetered, searchMetered] },
        ],
      },
    ],
  },
  family: {
    plans: [
      {
        id: "family",
        name: "Family",
        price: formatPlanPriceUsd(planFamily.amountUsd),
        cadence: `${planFamily.maxSeats} people · one pool`,
        highlighted: true,
        badge: "Most popular",
        cta: "Get Family",
      },
      {
        id: "family_max",
        name: "Family Max",
        price: formatPlanPriceUsd(planFamilyMax.amountUsd),
        cadence: `${planFamilyMax.maxSeats} people · one pool`,
        highlighted: false,
        cta: "Get Family Max",
      },
    ],
    groups: [
      {
        section: "Bang for the buck",
        features: [
          {
            label: "Effective per person",
            values: [
              `${formatPlanPriceUsd(familyClub.perPersonUsd)} vs ${formatPlanPriceUsd(familyClub.soloPriceUsd / familyClub.seats)} Pro`,
              `${formatPlanPriceUsd(familyMaxClub.perPersonUsd)} vs ${formatPlanPriceUsd(familyMaxClub.soloPriceUsd / familyMaxClub.seats)} Pro`,
            ],
          },
          {
            label: "vs buying Pro for each seat",
            values: [
              `Save ${formatPlanPriceUsd(familyClub.saveVsSoloUsd)} / month`,
              `Save ${formatPlanPriceUsd(familyMaxClub.saveVsSoloUsd)} / month`,
            ],
          },
          {
            label: "Shared credit pool",
            values: [
              `${formatUsd(familyClub.poolCents)} house pool`,
              `${formatUsd(familyMaxClub.poolCents)} house pool`,
            ],
          },
          {
            label: "vs Pro tastes added up",
            values: [
              `+${formatUsd(familyClub.extraPoolCents)} more in the pool`,
              `+${formatUsd(familyMaxClub.extraPoolCents)} more in the pool`,
            ],
          },
          {
            label: "Unused credit rollover",
            values: [
              `${familyClub.rolloverMonths} months in the house pool`,
              `${familyMaxClub.rolloverMonths} months in the house pool`,
            ],
          },
        ],
      },
      {
        section: "Core",
        features: [
          {
            label: "Family seats",
            values: [
              `Up to ${planFamily.maxSeats}`,
              `Up to ${planFamilyMax.maxSeats}`,
            ],
          },
          {
            label: "API rate limits",
            values: [
              `${planFamily.rateLimitMultiplier}×`,
              `${planFamilyMax.rateLimitMultiplier}×`,
            ],
          },
          {
            label: "API keys",
            values: [String(planFamily.maxApiKeys), String(planFamilyMax.maxApiKeys)],
          },
          {
            label: "Dedicated deployments",
            values: [
              String(planFamily.maxActiveDeployments),
              String(planFamilyMax.maxActiveDeployments),
            ],
          },
          { label: "Per-seat spending caps", values: [true, true] },
          { label: "Pay-as-you-go tokens & GPUs", values: [true, true] },
        ],
      },
      {
        section: "OpenDoor Chat",
        features: [
          {
            label: "AI app early access",
            values: ["Coming soon", "Priority · coming soon"],
          },
          {
            label: "Included Chat messages",
            values: [chatAllowance("family"), chatAllowance("family_max")],
          },
          { label: "Child-safe Chat mode", values: [true, true] },
        ],
      },
      {
        section: "Support",
        features: [
          { label: "Request logs & playground", values: [true, true] },
          { label: "Agents add-on", values: ["$20 / month", "Included"] },
          { label: "OpenDoor Search", values: [searchMetered, searchMetered] },
        ],
      },
    ],
  },
  enterprise: {
    plans: [
      {
        id: "team",
        name: "Team",
        price: formatPlanPriceUsd(planTeam.amountUsd),
        cadence: "Per user / month",
        highlighted: true,
        badge: "Most popular",
        cta: "Get Team",
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: "Custom",
        cadence: "Talk to sales",
        highlighted: false,
        cta: "Talk to sales",
      },
    ],
    groups: [
      {
        section: "Core",
        features: [
          {
            label: "Included inference credit",
            values: [
              `${formatUsd(planTeam.includedCreditsCents)} per seat`,
              `${formatUsd(planEnterprise.includedCreditsCents)} per seat`,
            ],
          },
          { label: "Seats", values: ["Per user", "Unlimited"] },
          {
            label: "API rate limits",
            values: [
              `${planTeam.rateLimitMultiplier}×`,
              `${planEnterprise.rateLimitMultiplier}×`,
            ],
          },
          {
            label: "API keys",
            values: [String(planTeam.maxApiKeys), String(planEnterprise.maxApiKeys)],
          },
          {
            label: "Dedicated deployments",
            values: [
              String(planTeam.maxActiveDeployments),
              String(planEnterprise.maxActiveDeployments),
            ],
          },
          { label: "Priority request queue", values: [true, true] },
          { label: "Pay-as-you-go tokens & GPUs", values: [true, true] },
        ],
      },
      {
        section: "OpenDoor Chat",
        features: [
          {
            label: "AI app early access",
            values: ["Coming soon", "Priority · coming soon"],
          },
          {
            label: "Included Chat messages",
            values: [chatAllowance("team"), chatAllowance("enterprise")],
          },
        ],
      },
      {
        section: "Governance",
        features: [
          { label: "SSO (SAML & OIDC)", values: [true, true] },
          { label: "Audit logs & policies", values: [true, true] },
          { label: "Worldwide data residency", values: [true, true] },
          { label: "SCIM provisioning", values: [false, true] },
          { label: "Trust Center & sector packs", values: [false, true] },
          { label: "Agents add-on", values: ["$20 / month", "Included"] },
          { label: "OpenDoor Search", values: [searchMetered, "Included"] },
        ],
      },
      {
        section: "Support",
        features: [
          { label: "Request logs & playground", values: [true, true] },
          { label: "Managed billing", values: [false, true] },
          { label: "Dedicated support", values: [false, true] },
          { label: "Custom dashboard & API domain", values: [false, true] },
        ],
      },
    ],
  },
};

function Cell({
  value,
  highlighted,
}: {
  value: CellValue;
  highlighted: boolean;
}) {
  if (typeof value === "boolean") {
    return value ? (
      <span
        className={cn(
          "mx-auto flex size-5 items-center justify-center",
          highlighted ? "bg-primary" : "bg-foreground/80",
        )}
      >
        <Check
          className={cn(
            "size-3.5",
            highlighted ? "text-primary-foreground" : "text-background",
          )}
          aria-hidden
        />
        <span className="sr-only">Included</span>
      </span>
    ) : (
      <span className="mx-auto flex size-5 items-center justify-center bg-muted">
        <X className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="sr-only">Not included</span>
      </span>
    );
  }

  const comingSoon = /coming soon/i.test(value);

  return (
    <span
      className={cn(
        "inline-flex flex-col items-center gap-1 text-sm font-medium",
        highlighted ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span>{value.replace(/\s*·\s*coming soon/i, "").replace(/^Coming soon$/i, "Early access")}</span>
      {comingSoon ? (
        <Badge variant="outline" className="font-normal">
          Coming soon
        </Badge>
      ) : null}
    </span>
  );
}

export default function ComparisonBlock() {
  const { t } = useI18n();
  const [audience, setAudience] = React.useState<PricingAudienceId>("single");
  const meta = PRICING_AUDIENCES.find((a) => a.id === audience)!;
  const { plans, groups } = VIEW[audience];
  const colSpan = plans.length + 1;
  const audienceCopy: Record<PricingAudienceId, { label: string; headline: string }> = {
    single: { label: t("pricing.singleLabel"), headline: t("pricing.singleHeadline") },
    family: { label: t("pricing.familyLabel"), headline: t("pricing.familyHeadline") },
    enterprise: { label: t("pricing.enterpriseLabel"), headline: t("pricing.enterpriseHeadline") },
  };

  return (
    <section className="mt-12 w-full text-foreground">
      <div className="mb-6 max-w-2xl">
        <Badge variant="outline" className="mb-4 gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {t("pricing.compare")}
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {audienceCopy[audience].headline}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">{meta.blurb}</p>
      </div>

      <div
        role="tablist"
        aria-label="Plan audience"
        className="mb-8 inline-flex rounded-lg border border-border bg-muted/40 p-1"
      >
        {PRICING_AUDIENCES.map((item) => {
          const active = item.id === audience;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setAudience(item.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {audienceCopy[item.id].label}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <div className="max-md:overflow-x-auto border border-border">
          <table className="w-full table-fixed caption-bottom text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
        <TableHead className="sticky top-0 z-20 w-[28%] border-b border-border bg-background align-bottom">
                  <span className="inline-block pb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Features
                  </span>
                </TableHead>
                {plans.map((plan) => (
                  <TableHead
                    key={plan.id}
                    className={cn(
                      "sticky top-0 z-20 border-b border-border text-center align-bottom",
                      plan.highlighted ? "bg-primary/5" : "bg-background",
                    )}
                  >
                    <div className="flex flex-col items-center gap-1 py-3">
                      {plan.badge ? (
                        <Badge variant="default" className="mb-1">
                          {plan.badge}
                        </Badge>
                      ) : (
                        <span className="mb-1 h-5" />
                      )}
                      <span className="text-sm font-semibold text-foreground">{plan.name}</span>
                      <span className="text-lg font-bold text-foreground">{plan.price}</span>
                      <span className="text-xs font-normal text-muted-foreground">{plan.cadence}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {groups.map((group) => (
                <React.Fragment key={group.section}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={colSpan}
                      className="py-2 text-xs font-semibold tracking-wide text-foreground uppercase"
                    >
                      {group.section}
                    </TableCell>
                  </TableRow>
                  {group.features.map((feature) => (
                    <TableRow key={`${group.section}-${feature.label}`}>
                      <TableCell className="py-2.5 font-medium text-foreground">
                        {feature.label}
                      </TableCell>
                      {feature.values.map((value, i) => (
                        <TableCell
                          key={`${feature.label}-${plans[i].id}`}
                          className={cn(
                            "py-2.5 text-center",
                            plans[i].highlighted && "bg-primary/5",
                          )}
                        >
                          <Cell value={value} highlighted={plans[i].highlighted} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}

              <TableRow className="hover:bg-transparent">
                <TableCell className="py-4" />
                {plans.map((plan) => (
                  <TableCell
                    key={`cta-${plan.id}`}
                    className={cn("py-4 text-center", plan.highlighted && "bg-primary/5")}
                  >
                    <Link
                      href={planSignupHref(plan.id)}
                      className={cn(
                        buttonVariants({
                          size: "sm",
                          variant: plan.highlighted ? "default" : "secondary",
                        }),
                        "w-full",
                      )}
                    >
                      {plan.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </table>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Membership is the profit; usage is the warehouse price. Included credit is a small taste —
        never a $50 giveaway. Open-weight and closed models share that stipend. Top up $20+ once and
        we add $5 of open-weight bonus (expires in 30 days). Tokens and GPU-seconds beyond the taste
        stay prepaid.
      </p>
    </section>
  );
}
