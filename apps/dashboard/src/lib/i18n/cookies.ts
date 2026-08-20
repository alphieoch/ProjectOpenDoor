import {
  COUNTRY_COOKIE,
  LOCALE_COOKIE,
  REGION_COOKIE,
  WORLD_COOKIE_MAX_AGE,
  persistWorldPreference,
  type WorldPreference,
} from "@opendoor/shared";

type CookieStoreLike = {
  get(name: string): { value: string } | undefined;
};

type CookieResponse = {
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): unknown;
  };
};

export function worldCookieOptions(maxAge = WORLD_COOKIE_MAX_AGE, secure = false) {
  return {
    httpOnly: false,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function readWorldPreferenceFromCookies(store: CookieStoreLike): WorldPreference {
  return persistWorldPreference({
    locale: store.get(LOCALE_COOKIE)?.value,
    region: store.get(REGION_COOKIE)?.value,
    country: store.get(COUNTRY_COOKIE)?.value,
  });
}

export function applyWorldCookies(
  response: CookieResponse,
  preference: WorldPreference,
  secure = false,
) {
  const opts = worldCookieOptions(WORLD_COOKIE_MAX_AGE, secure);
  response.cookies.set(LOCALE_COOKIE, preference.locale, opts);
  if (preference.region) {
    response.cookies.set(REGION_COOKIE, preference.region, opts);
  }
  if (preference.country) {
    response.cookies.set(COUNTRY_COOKIE, preference.country, opts);
  }
  return response;
}

export function persistWorldClient(preference: WorldPreference) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  const base = `Path=/; Max-Age=${WORLD_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(preference.locale)}; ${base}`;
  if (preference.region) {
    document.cookie = `${REGION_COOKIE}=${encodeURIComponent(preference.region)}; ${base}`;
  }
  if (preference.country) {
    document.cookie = `${COUNTRY_COOKIE}=${encodeURIComponent(preference.country)}; ${base}`;
  }
}

export function readWorldClient(): WorldPreference {
  if (typeof document === "undefined") {
    return persistWorldPreference({});
  }
  const parts = Object.fromEntries(
    document.cookie.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("=") || "")];
    }),
  );
  return persistWorldPreference({
    locale: parts[LOCALE_COOKIE],
    region: parts[REGION_COOKIE],
    country: parts[COUNTRY_COOKIE],
  });
}
