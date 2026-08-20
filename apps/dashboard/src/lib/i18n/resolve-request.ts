import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  persistWorldPreference,
  resolveLocale,
  type AppLocale,
  type WorldPreference,
} from "@opendoor/shared";
import { loadMessages, type Messages } from "./catalog";

export async function getRequestWorld(): Promise<{
  locale: AppLocale;
  preference: WorldPreference;
  messages: Messages;
}> {
  const store = await cookies();
  const hdrs = await headers();
  const locale = resolveLocale({
    query: hdrs.get("x-od-locale"),
    cookie: store.get(LOCALE_COOKIE)?.value,
    acceptLanguage: hdrs.get("accept-language"),
  });
  const preference = persistWorldPreference({
    locale,
    region: store.get("od_region")?.value,
    country: store.get("od_country")?.value,
  });
  const messages = await loadMessages(locale);
  return { locale, preference, messages };
}
