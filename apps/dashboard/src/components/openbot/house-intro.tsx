"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";

const STORAGE_KEY = "od_house_intro_dismissed";

export function HouseIntro() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <section className="mb-8 w-full max-w-2xl rounded-2xl border border-border bg-card px-5 py-4 text-card-foreground">
      <h2 className="text-lg font-semibold">{t("openbot.houseTitle")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("openbot.houseBody")}</p>
      <button type="button" onClick={dismiss} className="btn-primary mt-4 min-h-[40px]">
        {t("openbot.houseGotIt")}
      </button>
    </section>
  );
}
