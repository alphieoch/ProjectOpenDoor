import { describe, expect, test } from "bun:test";
import {
  isRtlLocale,
  localeDirection,
  mergeWorldMetadata,
  parseAcceptLanguage,
  parseLocale,
  persistWorldPreference,
  resolveLocale,
} from "./i18n";

describe("locale resolve", () => {
  test("query sw wins and stays first-class", () => {
    expect(parseLocale("sw")).toBe("sw");
    expect(parseLocale("sw-TZ")).toBe("sw");
    expect(
      resolveLocale({
        query: "sw",
        cookie: "en",
        acceptLanguage: "fr-FR,fr;q=0.9",
        profile: "ar",
      }),
    ).toBe("sw");
  });

  test("ar is RTL; other majors are LTR", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("ar-EG")).toBe(true);
    expect(localeDirection("ar")).toBe("rtl");
    expect(isRtlLocale("sw")).toBe(false);
    expect(localeDirection("sw")).toBe("ltr");
    expect(localeDirection("en")).toBe("ltr");
  });

  test("unknown tags and empty input fall back to en", () => {
    expect(resolveLocale({})).toBe("en");
    expect(resolveLocale({ query: "xx", cookie: "not-a-locale" })).toBe("en");
    expect(parseLocale("xx-YY")).toBe(null);
    expect(parseAcceptLanguage("xx-YY,zz;q=0.8")).toBe(null);
  });

  test("Accept-Language maps Swahili and Arabic", () => {
    expect(parseAcceptLanguage("sw-KE,sw;q=0.9,en;q=0.5")).toBe("sw");
    expect(parseAcceptLanguage("ar-EG,ar;q=0.9,en;q=0.4")).toBe("ar");
    expect(localeDirection(parseAcceptLanguage("ar-MA,ar;q=0.8") || "en")).toBe("rtl");
  });
});

describe("region persist", () => {
  test("Africa is stored as africa with optional country", () => {
    const stored = persistWorldPreference({
      locale: "sw",
      region: "africa",
      country: "ke",
    });
    expect(stored.region).toBe("africa");
    expect(stored.locale).toBe("sw");
    expect(stored.country).toBe("KE");
  });

  test("Nigeria infers Africa when region is omitted", () => {
    const stored = persistWorldPreference({ locale: "ha", country: "NG" });
    expect(stored.region).toBe("africa");
    expect(stored.locale).toBe("ha");
  });

  test("Africa is written into org metadata.world", () => {
    const stored = persistWorldPreference({ locale: "sw", region: "africa", country: "TZ" });
    const metadata = mergeWorldMetadata({ onboarding_checklist: {} }, stored);
    expect((metadata.world as { region: string }).region).toBe("africa");
    expect((metadata.world as { locale: string }).locale).toBe("sw");
  });
});
