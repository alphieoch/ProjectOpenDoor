/**
 * World locales + regions. Cookie/query/Accept-Language resolve — no URL prefix
 * (Cloud Run / existing WorkOS middleware stay on the same paths).
 */

export const APP_LOCALES = [
  "en",
  "fr",
  "ar",
  "pt",
  "sw",
  "ha",
  "yo",
  "am",
  "zu",
  "es",
  "zh",
  "hi",
] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** Arabic is the only first-class RTL locale in this set. */
export const RTL_LOCALES = ["ar"] as const;

export const WORLD_REGIONS = [
  "africa",
  "europe",
  "americas",
  "asia_pacific",
  "middle_east",
] as const;

export type WorldRegion = (typeof WORLD_REGIONS)[number];

export const LOCALE_COOKIE = "od_locale";
export const REGION_COOKIE = "od_region";
export const COUNTRY_COOKIE = "od_country";
export const WORLD_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
  pt: "Português",
  sw: "Kiswahili",
  ha: "Hausa",
  yo: "Yorùbá",
  am: "አማርኛ",
  zu: "isiZulu",
  es: "Español",
  zh: "中文",
  hi: "हिन्दी",
};

/** Africa-first order, then other majors. */
export const LOCALE_PICKER_ORDER: readonly AppLocale[] = [
  "en",
  "fr",
  "ar",
  "pt",
  "sw",
  "ha",
  "yo",
  "am",
  "zu",
  "es",
  "zh",
  "hi",
];

const LOCALE_ALIASES: Record<string, AppLocale> = {
  en: "en",
  eng: "en",
  fr: "fr",
  fra: "fr",
  ar: "ar",
  ara: "ar",
  pt: "pt",
  por: "pt",
  sw: "sw",
  swa: "sw",
  ha: "ha",
  hau: "ha",
  yo: "yo",
  yor: "yo",
  am: "am",
  amh: "am",
  zu: "zu",
  zul: "zu",
  es: "es",
  spa: "es",
  zh: "zh",
  zho: "zh",
  chi: "zh",
  cmn: "zh",
  hi: "hi",
  hin: "hi",
};

export type WorldPreference = {
  locale: AppLocale;
  region: WorldRegion | null;
  country: string | null;
};

export const AFRICA_COUNTRIES = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "EH", "ZM", "ZW",
] as const;

export const REGION_COUNTRIES: Record<WorldRegion, readonly string[]> = {
  africa: AFRICA_COUNTRIES,
  europe: [
    "GB", "IE", "FR", "DE", "ES", "IT", "NL", "PT", "PL", "SE", "NO", "DK", "FI",
    "BE", "AT", "CH", "GR", "RO", "CZ", "HU", "UA", "LT", "LV", "EE", "BG", "HR",
    "SK", "SI", "RS", "IS", "LU",
  ],
  americas: [
    "US", "CA", "MX", "BR", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CR", "PA",
    "DO", "JM", "TT", "BO", "UY", "PY", "HN", "SV", "NI", "CU", "HT",
  ],
  asia_pacific: [
    "IN", "CN", "JP", "KR", "ID", "PH", "VN", "TH", "MY", "SG", "AU", "NZ", "PK",
    "BD", "LK", "NP", "KH", "MM", "TW", "HK", "MO", "LA", "MN", "FJ", "PG",
  ],
  middle_east: [
    "SA", "AE", "QA", "KW", "BH", "OM", "JO", "LB", "IQ", "IR", "IL", "PS", "YE",
    "SY",
  ],
};

export const COUNTRY_NAMES: Record<string, string> = {
  DZ: "Algeria", AO: "Angola", BJ: "Benin", BW: "Botswana", BF: "Burkina Faso",
  BI: "Burundi", CV: "Cabo Verde", CM: "Cameroon", CF: "Central African Republic",
  TD: "Chad", KM: "Comoros", CG: "Congo", CD: "DR Congo", CI: "Côte d'Ivoire",
  DJ: "Djibouti", EG: "Egypt", GQ: "Equatorial Guinea", ER: "Eritrea",
  SZ: "Eswatini", ET: "Ethiopia", GA: "Gabon", GM: "Gambia", GH: "Ghana",
  GN: "Guinea", GW: "Guinea-Bissau", KE: "Kenya", LS: "Lesotho", LR: "Liberia",
  LY: "Libya", MG: "Madagascar", MW: "Malawi", ML: "Mali", MR: "Mauritania",
  MU: "Mauritius", MA: "Morocco", MZ: "Mozambique", NA: "Namibia", NE: "Niger",
  NG: "Nigeria", RW: "Rwanda", ST: "São Tomé and Príncipe", SN: "Senegal",
  SC: "Seychelles", SL: "Sierra Leone", SO: "Somalia", ZA: "South Africa",
  SS: "South Sudan", SD: "Sudan", TZ: "Tanzania", TG: "Togo", TN: "Tunisia",
  UG: "Uganda", EH: "Western Sahara", ZM: "Zambia", ZW: "Zimbabwe",
  GB: "United Kingdom", IE: "Ireland", FR: "France", DE: "Germany", ES: "Spain",
  IT: "Italy", NL: "Netherlands", PT: "Portugal", PL: "Poland", SE: "Sweden",
  NO: "Norway", DK: "Denmark", FI: "Finland", BE: "Belgium", AT: "Austria",
  CH: "Switzerland", GR: "Greece", RO: "Romania", CZ: "Czechia", HU: "Hungary",
  UA: "Ukraine", LT: "Lithuania", LV: "Latvia", EE: "Estonia", BG: "Bulgaria",
  HR: "Croatia", SK: "Slovakia", SI: "Slovenia", RS: "Serbia", IS: "Iceland",
  LU: "Luxembourg",
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina",
  CO: "Colombia", CL: "Chile", PE: "Peru", VE: "Venezuela", EC: "Ecuador",
  GT: "Guatemala", CR: "Costa Rica", PA: "Panama", DO: "Dominican Republic",
  JM: "Jamaica", TT: "Trinidad and Tobago", BO: "Bolivia", UY: "Uruguay",
  PY: "Paraguay", HN: "Honduras", SV: "El Salvador", NI: "Nicaragua", CU: "Cuba",
  HT: "Haiti",
  IN: "India", CN: "China", JP: "Japan", KR: "South Korea", ID: "Indonesia",
  PH: "Philippines", VN: "Vietnam", TH: "Thailand", MY: "Malaysia", SG: "Singapore",
  AU: "Australia", NZ: "New Zealand", PK: "Pakistan", BD: "Bangladesh",
  LK: "Sri Lanka", NP: "Nepal", KH: "Cambodia", MM: "Myanmar", TW: "Taiwan",
  HK: "Hong Kong", MO: "Macao", LA: "Laos", MN: "Mongolia", FJ: "Fiji",
  PG: "Papua New Guinea",
  SA: "Saudi Arabia", AE: "United Arab Emirates", QA: "Qatar", KW: "Kuwait",
  BH: "Bahrain", OM: "Oman", JO: "Jordan", LB: "Lebanon", IQ: "Iraq", IR: "Iran",
  IL: "Israel", PS: "Palestine", YE: "Yemen", SY: "Syria",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

export function isWorldRegion(value: unknown): value is WorldRegion {
  return typeof value === "string" && (WORLD_REGIONS as readonly string[]).includes(value);
}

export function parseLocale(value: unknown): AppLocale | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/_/g, "-").toLowerCase();
  if (!raw) return null;
  const primary = raw.split("-")[0] || raw;
  if (isAppLocale(primary)) return primary;
  return LOCALE_ALIASES[primary] ?? null;
}

export function isRtlLocale(locale: string | null | undefined): boolean {
  const parsed = parseLocale(locale) ?? (locale || "").split("-")[0];
  return parsed === "ar";
}

export function localeDirection(locale: string | null | undefined): "rtl" | "ltr" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

type AcceptTag = { tag: string; q: number };

function parseAcceptTags(header: string): AcceptTag[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.split("=")[1]) : 1;
      return { tag: (tag || "").trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((item) => item.tag)
    .sort((a, b) => b.q - a.q);
}

export function parseAcceptLanguage(header: string | null | undefined): AppLocale | null {
  if (!header || typeof header !== "string") return null;
  for (const item of parseAcceptTags(header)) {
    const match = parseLocale(item.tag);
    if (match) return match;
  }
  return null;
}

export function resolveLocale(input: {
  query?: unknown;
  cookie?: unknown;
  acceptLanguage?: string | null;
  profile?: unknown;
}): AppLocale {
  return (
    parseLocale(input.query) ||
    parseLocale(input.cookie) ||
    parseLocale(input.profile) ||
    parseAcceptLanguage(input.acceptLanguage) ||
    DEFAULT_LOCALE
  );
}

export function parseRegion(value: unknown): WorldRegion | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "apac" || raw === "asia" || raw === "asia_pacific") return "asia_pacific";
  if (raw === "latam" || raw === "america" || raw === "americas") return "americas";
  if (raw === "mena" || raw === "middleeast" || raw === "middle_east") return "middle_east";
  if (isWorldRegion(raw)) return raw;
  return null;
}

export function parseCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (!COUNTRY_NAMES[code]) return null;
  return code;
}

export function regionForCountry(country: string | null | undefined): WorldRegion | null {
  if (!country) return null;
  const code = parseCountryCode(country);
  if (!code) return null;
  for (const region of WORLD_REGIONS) {
    if ((REGION_COUNTRIES[region] as readonly string[]).includes(code)) return region;
  }
  return null;
}

export function persistWorldPreference(input: {
  locale?: unknown;
  region?: unknown;
  country?: unknown;
}): WorldPreference {
  const country = parseCountryCode(input.country);
  const region = parseRegion(input.region) || regionForCountry(country);
  return {
    locale: parseLocale(input.locale) ?? DEFAULT_LOCALE,
    region,
    country,
  };
}

export function worldPreferenceFromMetadata(metadata: unknown): Partial<WorldPreference> {
  if (!metadata || typeof metadata !== "object") return {};
  const world = (metadata as { world?: unknown }).world;
  if (!world || typeof world !== "object") return {};
  const raw = world as { locale?: unknown; region?: unknown; country?: unknown };
  return persistWorldPreference(raw);
}

export function mergeWorldMetadata(
  metadata: unknown,
  preference: WorldPreference,
): Record<string, unknown> {
  const current =
    metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {};
  current.world = {
    locale: preference.locale,
    region: preference.region,
    country: preference.country,
  };
  return current;
}

export type OnboardingAudience = "school" | "family" | "team";

export function onboardingAudienceFromIntent(input: {
  segment?: unknown;
  plan?: unknown;
}): OnboardingAudience {
  const segment = typeof input.segment === "string" ? input.segment.toLowerCase() : "";
  const plan = typeof input.plan === "string" ? input.plan.toLowerCase() : "";
  if (segment === "education" || plan === "student") return "school";
  if (plan === "family" || plan === "family_max") return "family";
  if (plan === "team" || plan === "enterprise" || segment === "enterprise_intent") return "team";
  return "family";
}
