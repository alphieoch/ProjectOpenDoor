/** Safe login `?error=` codes shown in the UI. Never put secrets in these. */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  sso_failed: "SSO authentication failed",
  org_not_found: "Organization not found",
  sso_disabled: "SSO is not enabled for your organization",
  invalid_org: "Invalid organization",
  workos_failed: "Sign-in failed. Try again.",
  workos_sync_failed: "Signed in, but we could not finish account setup.",
  oauth_provider: "Unknown sign-in provider.",
  missing_pkce_cookie: "Sign-in session expired. Click Continue with Google or GitHub again.",
  oauth_state_mismatch: "Sign-in session expired. Click Continue with Google or GitHub again.",
  missing_auth_params: "Sign-in session expired. Click Continue with Google or GitHub again.",
  missing_tokens: "Sign-in could not be completed. Try again.",
  missing_email: "Google did not return an email address for this account.",
  invalid_authorization_url: "Sign-in could not start. Try again.",
  access_denied: "Google sign-in was cancelled.",
  invalid_grant: "Sign-in expired or the code was already used. Click Continue with Google again.",
  email_verification_required: "Check your email to verify your account, then sign in.",
  redirect_uri_mismatch: "This sign-in URL is not registered for OpenDoor. Try again from localhost:3010 or opendoor-gcp.web.app.",
};

export function sanitizeAuthErrorDetail(detail?: string | null) {
  if (!detail) return "";
  return detail.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function loginErrorLocation(origin: string, error: string, detail?: string | null) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  const safe = sanitizeAuthErrorDetail(detail);
  if (safe) url.searchParams.set("error_detail", safe);
  return url.toString();
}

export function authErrorMessage(error: string | null) {
  if (!error) return null;
  return AUTH_ERROR_MESSAGES[error] || "SSO callback failed";
}

export function workosFailureCode(error: unknown): string {
  if (!error || typeof error !== "object") return "workos_failed";
  const e = error as {
    code?: string;
    rawData?: { code?: string; error?: string };
  };
  const code = e.rawData?.code || (typeof e.rawData?.error === "string" ? e.rawData.error : "") || e.code;
  if (code && /^[a-z0-9_]{2,64}$/i.test(code)) return code;
  return "workos_failed";
}

export function workosFailureDetail(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error == null ? "" : String(error);
  }
  const e = error as {
    message?: string;
    rawData?: {
      code?: string;
      message?: string;
      error_description?: string;
      error?: { message?: string; description?: string } | string;
    };
  };
  const nested = typeof e.rawData?.error === "object" ? e.rawData.error : null;
  return (
    nested?.description ||
    nested?.message ||
    e.rawData?.error_description ||
    e.rawData?.message ||
    e.message ||
    ""
  );
}
