"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  localeDirection,
  persistWorldPreference,
  type AppLocale,
  type WorldPreference,
  type WorldRegion,
} from "@opendoor/shared";
import { persistWorldClient } from "@/lib/i18n/cookies";
import { translate, type Messages } from "@/lib/i18n/catalog";

type I18nContextValue = {
  locale: AppLocale;
  preference: WorldPreference;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setWorld: (next: Partial<WorldPreference>) => Promise<void>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection(locale);
}

export function I18nProvider({
  locale,
  messages,
  preference,
  children,
}: {
  locale: AppLocale;
  messages: Messages;
  preference: WorldPreference;
  children: ReactNode;
}) {
  const router = useRouter();
  const [currentLocale, setCurrentLocale] = useState(locale);
  const [currentMessages, setCurrentMessages] = useState(messages);
  const [currentPref, setCurrentPref] = useState(preference);

  const setWorld = useCallback(
    async (next: Partial<WorldPreference>) => {
      const merged = persistWorldPreference({
        locale: next.locale ?? currentPref.locale,
        region: next.region === undefined ? currentPref.region : next.region,
        country: next.country === undefined ? currentPref.country : next.country,
      });
      persistWorldClient(merged);
      applyDocumentLocale(merged.locale);
      setCurrentPref(merged);
      if (merged.locale !== currentLocale) {
        const { loadMessages } = await import("@/lib/i18n/catalog");
        setCurrentMessages(await loadMessages(merged.locale));
        setCurrentLocale(merged.locale);
      }
      await fetch("/api/world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(merged),
      }).catch(() => undefined);
      router.refresh();
    },
    [currentLocale, currentPref, router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: currentLocale,
      preference: currentPref,
      t: (key, vars) => translate(currentMessages, key, vars),
      setWorld,
    }),
    [currentLocale, currentMessages, currentPref, setWorld],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: "en" as AppLocale,
      preference: persistWorldPreference({}),
      t: (key: string) => key,
      setWorld: async () => undefined,
    };
  }
  return ctx;
}

export function useWorldRegion(): WorldRegion | null {
  return useI18n().preference.region;
}
