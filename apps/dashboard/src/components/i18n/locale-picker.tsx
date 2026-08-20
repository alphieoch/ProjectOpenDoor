"use client";

import {
  LOCALE_NATIVE_NAMES,
  LOCALE_PICKER_ORDER,
  type AppLocale,
} from "@opendoor/shared";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n-provider";

export function LocalePicker({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { locale, t, setWorld } = useI18n();

  return (
    <label className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {!compact ? (
        <span className="sr-only sm:not-sr-only sm:text-xs sm:text-muted-foreground">
          {t("common.language")}
        </span>
      ) : (
        <span className="sr-only">{t("common.language")}</span>
      )}
      <select
        aria-label={t("common.language")}
        value={locale}
        onChange={(event) => {
          void setWorld({ locale: event.target.value as AppLocale });
        }}
        className={cn(
          "max-w-[11rem] rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground",
          "min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {LOCALE_PICKER_ORDER.map((id) => (
          <option key={id} value={id}>
            {LOCALE_NATIVE_NAMES[id]}
          </option>
        ))}
      </select>
    </label>
  );
}
