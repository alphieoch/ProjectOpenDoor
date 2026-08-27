"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, GraduationCap, Sparkles } from "lucide-react";
import { RegionalOnboarding } from "@/components/i18n/regional-onboarding";
import { useI18n } from "@/components/i18n/i18n-provider";

export function GetStartedView() {
  const { t } = useI18n();

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {t("getStarted.eyebrow")}
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-foreground sm:text-6xl">
          {t("getStarted.title")}
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{t("getStarted.body")}</p>
      </div>

      <RegionalOnboarding className="mx-auto mt-10 max-w-5xl" />

      <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
        <div className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg">
          <div className="mb-6 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t("getStarted.startFree")}
          </h2>
          <p className="mt-3 flex-1 leading-7 text-muted-foreground">{t("getStarted.startFreeBody")}</p>
          <Link
            href="/login?signup=1&segment=standard"
            className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            {t("getStarted.continueEmail")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg">
          <div className="mb-6 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t("getStarted.education")}
          </h2>
          <p className="mt-3 flex-1 leading-7 text-muted-foreground">{t("getStarted.educationBody")}</p>
          <Link
            href="/login?signup=1&segment=education"
            className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
          >
            {t("getStarted.continueEducation")}
          </Link>
        </div>

        <div className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg">
          <div className="mb-6 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Briefcase className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t("getStarted.enterprise")}
          </h2>
          <p className="mt-3 flex-1 leading-7 text-muted-foreground">{t("getStarted.enterpriseBody")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/login?mode=sso"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              {t("getStarted.joinSso")}
            </Link>
            <a
              href="mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise%20Onboarding"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {t("getStarted.talkSales")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
