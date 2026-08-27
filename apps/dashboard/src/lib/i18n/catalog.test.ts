import { describe, expect, test } from "bun:test";
import { APP_LOCALES, isRtlLocale, localeDirection, persistWorldPreference } from "@opendoor/shared";
import { flattenMessageKeys, loadMessages, translate } from "./catalog";
import en from "../../../messages/en.json";

describe("message catalogs", () => {
  test("Swahili and Arabic catalogs cover every English key", async () => {
    const enKeys = flattenMessageKeys(en);
    const sw = await loadMessages("sw");
    const ar = await loadMessages("ar");
    expect(flattenMessageKeys(sw).sort()).toEqual(enKeys.sort());
    expect(flattenMessageKeys(ar).sort()).toEqual(enKeys.sort());
    expect(isRtlLocale("ar")).toBe(true);
    expect(localeDirection("ar")).toBe("rtl");
  });

  test("unknown locale falls back to English copy", async () => {
    const messages = await loadMessages("xx");
    expect(translate(messages, "auth.welcomeBack")).toBe(en.auth.welcomeBack);
    expect(translate(messages, "missing.key")).toBe("missing.key");
  });

  test("every shipped locale loads", async () => {
    for (const locale of APP_LOCALES) {
      const messages = await loadMessages(locale);
      expect(translate(messages, "pricing.audienceStudent").length).toBeGreaterThan(0);
      expect(translate(messages, "openbot.houseTitle").length).toBeGreaterThan(0);
    }
  });
});

describe("Africa persist helper", () => {
  test("Africa region is stored on the preference payload", () => {
    const stored = persistWorldPreference({
      locale: "yo",
      region: "africa",
      country: "NG",
    });
    expect(stored.region).toBe("africa");
    expect(stored.locale).toBe("yo");
    expect(stored.country).toBe("NG");
  });
});
