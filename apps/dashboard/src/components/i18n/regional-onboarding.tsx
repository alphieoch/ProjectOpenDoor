"use client";

import { useMemo, useState } from "react";
import {
  COUNTRY_NAMES,
  REGION_COUNTRIES,
  WORLD_REGIONS,
  onboardingAudienceFromIntent,
  type OnboardingAudience,
  type WorldRegion,
} from "@opendoor/shared";
import { cn } from "@/lib/utils";
import { LocalePicker } from "./locale-picker";
import { useI18n } from "./i18n-provider";

const REGION_KEYS = WORLD_REGIONS;

export function RegionalOnboarding({
  segment,
  plan,
  compact = false,
  className,
}: {
  segment?: string | null;
  plan?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const { t, preference, setWorld } = useI18n();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const audience = onboardingAudienceFromIntent({ segment, plan });
  const region = preference.region;
  const countries = useMemo(
    () => (region ? REGION_COUNTRIES[region] : []),
    [region],
  );

  async function chooseRegion(next: WorldRegion) {
    setSaved(false);
    await setWorld({
      region: next,
      country: preference.country && REGION_COUNTRIES[next].includes(preference.country)
        ? preference.country
        : null,
    });
  }

  async function save() {
    setSaving(true);
    await setWorld(preference);
    setSaving(false);
    setSaved(true);
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("onboarding.eyebrow")}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {t("onboarding.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("onboarding.body")}
          </p>
        </div>
        <LocalePicker />
      </div>

      <p className="mt-5 text-sm font-medium">{t("onboarding.pickRegion")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("onboarding.pickRegionHint")}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {REGION_KEYS.map((id) => {
          const active = region === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => void chooseRegion(id)}
              className={cn(
                "min-h-[48px] rounded-xl border px-3 py-3 text-start text-sm font-medium transition",
                id === "africa" && !active
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background",
                active && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {t(`regions.${id}`)}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1.5 block font-medium">{t("common.countryOptional")}</span>
        <select
          className="input w-full max-w-md min-h-[44px]"
          value={preference.country || ""}
          disabled={!region}
          onChange={(event) => {
            void setWorld({ country: event.target.value || null });
          }}
        >
          <option value="">{t("common.countryNone")}</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {COUNTRY_NAMES[code] || code}
            </option>
          ))}
        </select>
      </label>

      {!compact ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <ProductCard title={t("onboarding.productChatTitle")} body={t("onboarding.productChatBody")} />
          <ProductCard title={t("onboarding.productHouseTitle")} body={t("onboarding.productHouseBody")} />
          <ProductCard title={t("onboarding.productPoolTitle")} body={t("onboarding.productPoolBody")} />
        </div>
      ) : null}

      {region ? (
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          {audienceCopy(t, region, audience)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !region}
        className="btn-primary mt-5 min-h-[44px]"
      >
        {saved ? t("onboarding.saved") : t("onboarding.saveWorld")}
      </button>
    </section>
  );
}

function audienceCopy(
  t: (key: string) => string,
  region: WorldRegion,
  audience: OnboardingAudience,
) {
  return t(`onboarding.${region}.${audience}`);
}

function ProductCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
