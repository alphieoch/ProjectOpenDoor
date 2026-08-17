"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Shield, UserPlus, DoorOpen } from "lucide-react";
import posthog from "posthog-js";

function posthogRequestHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const sid = posthog.get_session_id();
    const did = posthog.get_distinct_id();
    if (typeof sid === "string" && sid) h["x-posthog-session-id"] = sid;
    if (typeof did === "string" && did) h["x-posthog-distinct-id"] = did;
  } catch {
    /* PostHog not initialized */
  }
  return h;
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const ssoError = searchParams.get("error");
  const ssoSlug = searchParams.get("sso");
  const signupParam = searchParams.get("signup");
  const [mode, setMode] = useState<"password" | "sso" | "signup">(
    signupParam ? "signup" : "password"
  );

  useEffect(() => {
    if (ssoSlug) {
      setOrgSlug(ssoSlug);
      setMode("sso");
      window.location.href = `/api/auth/sso?org=${encodeURIComponent(ssoSlug)}`;
    }
  }, [ssoSlug]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...posthogRequestHeaders(),
      },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      try {
        if (data.user?.id) {
          posthog.identify(data.user.id, {
            email: data.user.email,
            ...(data.user.orgId ? { org_id: data.user.orgId } : {}),
          });
        }
        posthog.capture("user_logged_in_client", { auth_method: "password" });
      } catch {
        /* analytics optional */
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Login failed");
    }
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...posthogRequestHeaders(),
      },
      body: JSON.stringify({ email, password, name, orgName }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      try {
        if (data.user?.id) {
          posthog.identify(data.user.id, {
            email: data.user.email,
            name: data.user.name,
            ...(data.user.orgId ? { org_id: data.user.orgId } : {}),
          });
        }
        posthog.capture("user_signed_up_client", { auth_method: "password" });
      } catch {
        /* analytics optional */
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Sign up failed");
    }
    setLoading(false);
  }

  function handleSSO(e: React.FormEvent) {
    e.preventDefault();
    if (!orgSlug.trim()) return;
    setSsoLoading(true);
    window.location.href = `/api/auth/sso?org=${encodeURIComponent(orgSlug.trim())}`;
  }

  const ssoErrorMessage =
    ssoError === "sso_failed" ? "SSO authentication failed" :
    ssoError === "org_not_found" ? "Organization not found" :
    ssoError === "sso_disabled" ? "SSO is not enabled for your organization" :
    ssoError === "invalid_org" ? "Invalid organization" :
    ssoError ? "SSO callback failed" : null;

  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel */}
      <div className="hidden flex-col justify-between bg-zinc-950 p-12 lg:flex lg:w-[420px] xl:w-[480px]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/15">
            <DoorOpen className="h-5 w-5 text-indigo-400" />
          </div>
          <span className="text-base font-semibold text-white">OpenDoor</span>
        </div>

        <div className="space-y-6">
          <h2 className="text-3xl font-semibold leading-tight text-white">
            The LLM gateway<br />built for teams
          </h2>
          <ul className="space-y-3 text-sm text-zinc-400">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400">→</span>
              Route to GPT-4o, Claude, Gemini and open models through one API
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400">→</span>
              Per-key model access controls, rate limits, and spend budgets
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400">→</span>
              Enterprise SSO, audit logs, and governance policies built-in
            </li>
          </ul>
        </div>

        <p className="text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} OpenDoor. All rights reserved.
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <DoorOpen className="h-5 w-5 text-indigo-600" />
            <span className="text-base font-semibold text-zinc-900">OpenDoor</span>
          </div>

          <h1 className="text-xl font-semibold text-zinc-900">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {mode === "signup"
              ? "Get started with the LLM gateway"
              : "Sign in to your LLM Gateway"}
          </p>

          {(error || ssoErrorMessage) && (
            <div className="mt-4 alert-error">
              {error || ssoErrorMessage}
            </div>
          )}

          {/* Tab switcher */}
          <div className="mt-6 flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
            <button
              onClick={() => setMode("password")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "password" || mode === "signup"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {mode === "signup" ? "Sign up" : "Email"}
            </button>
            <button
              onClick={() => setMode("sso")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "sso"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Enterprise SSO
            </button>
          </div>

          {/* Email/password form */}
          {mode === "password" && (
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                <LogIn className="h-4 w-4" />
                {loading ? "Signing in…" : "Sign In"}
              </button>
              <p className="text-center text-sm text-zinc-500">
                No account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Sign up free
                </button>
              </p>
            </form>
          )}

          {/* Sign up form */}
          {mode === "signup" && (
            <form onSubmit={handleSignup} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Organization <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Corp"
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                  minLength={8}
                />
                <p className="mt-1 text-xs text-zinc-400">At least 8 characters</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                <UserPlus className="h-4 w-4" />
                {loading ? "Creating account…" : "Create Account"}
              </button>
              <p className="text-center text-sm text-zinc-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("password")}
                  className="font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* SSO form */}
          {mode === "sso" && (
            <form onSubmit={handleSSO} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Organization Slug
                </label>
                <input
                  type="text"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="acme-corp"
                  className="input"
                  required
                />
                <p className="mt-1.5 text-xs text-zinc-400">
                  Enter your organization slug to sign in via Okta, Azure AD, Google Workspace, etc.
                </p>
              </div>
              <button
                type="submit"
                disabled={ssoLoading}
                className="btn-primary w-full"
              >
                <Shield className="h-4 w-4" />
                {ssoLoading ? "Redirecting…" : "Continue with SSO"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
