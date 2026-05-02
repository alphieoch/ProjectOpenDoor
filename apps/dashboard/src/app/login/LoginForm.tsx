"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Shield } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "sso">("password");
  const router = useRouter();
  const searchParams = useSearchParams();
  const ssoError = searchParams.get("error");
  const ssoSlug = searchParams.get("sso");

  // Auto-redirect to SSO if ?sso=slug is present
  useEffect(() => {
    if (ssoSlug) {
      setOrgSlug(ssoSlug);
      setMode("sso");
      window.location.href = `/api/auth/sso?org=${encodeURIComponent(ssoSlug)}`;
    }
  }, [ssoSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Login failed");
    }
    setLoading(false);
  }

  function handleSSO(e: React.FormEvent) {
    e.preventDefault();
    if (!orgSlug.trim()) return;
    setSsoLoading(true);
    window.location.href = `/api/auth/sso?org=${encodeURIComponent(orgSlug.trim())}`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">OpenDoor</h1>
        <p className="mb-6 text-gray-600">Sign in to your LLM Gateway</p>

        {(error || ssoError) && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {error ||
              (ssoError === "sso_failed"
                ? "SSO authentication failed"
                : ssoError === "org_not_found"
                ? "Organization not found"
                : ssoError === "sso_disabled"
                ? "SSO is not enabled for your organization"
                : ssoError === "invalid_org"
                ? "Invalid organization"
                : "SSO callback failed")}
          </div>
        )}

        <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setMode("password")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === "password"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Email & Password
          </button>
          <button
            onClick={() => setMode("sso")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === "sso"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Enterprise SSO
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSSO} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Organization Slug
              </label>
              <input
                type="text"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="e.g. ocheing-co"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter your organization slug to sign in via your company&apos;s
                identity provider (Okta, Azure AD, Google Workspace, etc.)
              </p>
            </div>
            <button
              type="submit"
              disabled={ssoLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              {ssoLoading ? "Redirecting..." : "Sign in with SSO"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
