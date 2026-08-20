/**
 * OpenDoor JWT session cookies.
 *
 * Firebase Hosting → Cloud Run only forwards `__session`. Localhost and the
 * direct Cloud Run URL still use `session`. Write both; read either.
 * https://firebase.google.com/docs/hosting/manage-cache#using_cookies
 */
export const SESSION_COOKIE = "session";
export const FIREBASE_SESSION_COOKIE = "__session";

export function sessionCookieOptions(
  maxAge = 60 * 60 * 24 * 7,
  secure = process.env.NODE_ENV === "production"
) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

type CookieStoreLike = {
  get(name: string): { value: string } | undefined;
};

type CookieResponse = {
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): unknown;
  };
};

export function readSessionToken(store: CookieStoreLike) {
  return store.get(FIREBASE_SESSION_COOKIE)?.value || store.get(SESSION_COOKIE)?.value || null;
}

export function applySessionCookies(
  response: CookieResponse,
  token: string,
  maxAge = 60 * 60 * 24 * 7,
  secure?: boolean
) {
  const opts = sessionCookieOptions(maxAge, secure);
  response.cookies.set(SESSION_COOKIE, token, opts);
  response.cookies.set(FIREBASE_SESSION_COOKIE, token, opts);
  return response;
}

export function clearSessionCookies(response: CookieResponse, secure?: boolean) {
  const opts = sessionCookieOptions(0, secure);
  response.cookies.set(SESSION_COOKIE, "", opts);
  response.cookies.set(FIREBASE_SESSION_COOKIE, "", opts);
  return response;
}
