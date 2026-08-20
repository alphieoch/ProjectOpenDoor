import { describe, expect, test } from "bun:test";
import {
  appBaseUrl,
  httpAuthorizationUrl,
  resolveAppOrigin,
  workosRedirectUri,
} from "./public-urls";

describe("WorkOS redirect URIs", () => {
  test("defaults to the app callback on localhost", () => {
    const previousApp = process.env.NEXT_PUBLIC_APP_URL;
    const previousRedirect = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3010";

    expect(appBaseUrl()).toBe("http://localhost:3010");
    expect(workosRedirectUri()).toBe("http://localhost:3010/callback");

    process.env.NEXT_PUBLIC_APP_URL = previousApp;
    if (previousRedirect === undefined) delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    else process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = previousRedirect;
  });

  test("uses the registered production callback when set", () => {
    const previous = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "https://opendoor-gcp.web.app/callback";
    expect(workosRedirectUri()).toBe("https://opendoor-gcp.web.app/callback");
    if (previous === undefined) delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    else process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = previous;
  });

  test("prefers the request host so local Google OAuth is not sent to prod", () => {
    const previous = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "https://opendoor-gcp.web.app/callback";
    const req = {
      headers: new Headers({ host: "localhost:3010" }),
    };
    expect(resolveAppOrigin(req)).toBe("http://localhost:3010");
    expect(workosRedirectUri(req)).toBe("http://localhost:3010/callback");
    if (previous === undefined) delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    else process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = previous;
  });

  test("prefers Firebase Hosting when forwarded from Cloud Run", () => {
    const req = {
      headers: new Headers({
        host: "opendoor-dashboard-u5ojp4qjiq-uc.a.run.app",
        "x-forwarded-host": "opendoor-gcp.web.app",
        "x-forwarded-proto": "https",
      }),
    };
    expect(resolveAppOrigin(req)).toBe("https://opendoor-gcp.web.app");
    expect(workosRedirectUri(req)).toBe("https://opendoor-gcp.web.app/callback");
  });

  test("ignores unknown hosts instead of open-redirecting", () => {
    const previousApp = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3010";
    const req = {
      headers: new Headers({ host: "evil.example" }),
    };
    expect(resolveAppOrigin(req)).toBe("http://localhost:3010");
    process.env.NEXT_PUBLIC_APP_URL = previousApp;
  });

  test("rejects AuthKit authorization objects so redirects stay on http(s)", () => {
    expect(httpAuthorizationUrl({ url: "https://api.workos.com/user_management/authorize", sealedState: "x" }))
      .toBe("https://api.workos.com/user_management/authorize");
    expect(httpAuthorizationUrl("[object Object]")).toBeNull();
    expect(httpAuthorizationUrl({ url: "/[object Object]" })).toBeNull();
    expect(httpAuthorizationUrl("https://auth.workos.com/user_management/authorize")).toBe(
      "https://auth.workos.com/user_management/authorize"
    );
  });
});
