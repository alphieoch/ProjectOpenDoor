import { describe, expect, test } from "bun:test";
import {
  FIREBASE_SESSION_COOKIE,
  SESSION_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  cookieSecureFromRequest,
  readSessionToken,
  sessionCookieOptions,
} from "./session-cookie";

describe("session cookies", () => {
  test("prefers the Firebase Hosting cookie Firebase actually forwards", () => {
    expect(
      readSessionToken({
        get: (name) => {
          if (name === FIREBASE_SESSION_COOKIE) return { value: "firebase-token" };
          if (name === SESSION_COOKIE) return { value: "legacy-token" };
          return undefined;
        },
      })
    ).toBe("firebase-token");
  });

  test("falls back to the local session cookie", () => {
    expect(
      readSessionToken({
        get: (name) => (name === SESSION_COOKIE ? { value: "local-token" } : undefined),
      })
    ).toBe("local-token");
  });

  test("writes both cookie names so Hosting and localhost work", () => {
    const set: Array<{ name: string; value: string; secure?: boolean }> = [];
    applySessionCookies(
      {
        cookies: {
          set(name, value, options) {
            set.push({ name, value, secure: Boolean((options as { secure?: boolean })?.secure) });
          },
        },
      },
      "jwt",
      60,
      false
    );
    expect(set.map((c) => c.name).sort()).toEqual([FIREBASE_SESSION_COOKIE, SESSION_COOKIE].sort());
    expect(set.every((c) => c.value === "jwt")).toBe(true);
    expect(set.every((c) => c.secure === false)).toBe(true);
  });

  test("clears both cookies", () => {
    const names: string[] = [];
    clearSessionCookies({
      cookies: {
        set(name) {
          names.push(name);
        },
      },
    });
    expect(names.sort()).toEqual([FIREBASE_SESSION_COOKIE, SESSION_COOKIE].sort());
  });

  test("marks Secure only when asked (http localhost must stay non-secure)", () => {
    expect(sessionCookieOptions(1, false).secure).toBe(false);
    expect(sessionCookieOptions(1, true).secure).toBe(true);
  });

  test("cookieSecureFromRequest is true on HTTPS and false on localhost HTTP", () => {
    expect(
      cookieSecureFromRequest({
        headers: { get: (name) => (name === "x-forwarded-proto" ? "https" : "opendoor-gcp.web.app") },
      })
    ).toBe(true);
    expect(
      cookieSecureFromRequest({
        headers: {
          get: (name) => {
            if (name === "x-forwarded-proto") return "http";
            if (name === "host") return "localhost:3010";
            return null;
          },
        },
      })
    ).toBe(false);
  });
});
