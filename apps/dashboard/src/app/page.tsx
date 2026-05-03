import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { Zap, ArrowRight, Shield, BarChart3, Globe, Key, ChevronRight } from "lucide-react";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main style={{ background: "var(--md-surface)", minHeight: "100vh", fontFamily: "var(--font-roboto), Roboto, sans-serif" }}>

      {/* ── Top App Bar ─────────────────────────────────────────── */}
      <header style={{
        background: "var(--md-surface-container)",
        borderBottom: "1px solid var(--md-outline-variant)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(16px)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 40, height: 40,
              borderRadius: "var(--md-shape-md)",
              background: "var(--md-primary)",
              display: "grid", placeItems: "center",
              flexShrink: 0,
            }}>
              <Zap style={{ width: 20, height: 20, color: "white" }} />
            </div>
            <span style={{ fontSize: 22, fontWeight: 500, color: "var(--md-on-surface)", letterSpacing: 0 }}>
              OpenDoor
            </span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/status" style={{
              padding: "10px 16px",
              borderRadius: "var(--md-shape-full)",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--md-on-surface-variant)",
              textDecoration: "none",
              letterSpacing: "0.1px",
              transition: "background 0.2s",
            }}
              className="hover:bg-surface-container-high"
            >
              Status
            </Link>
            <Link href="/login" style={{
              padding: "10px 24px",
              borderRadius: "var(--md-shape-full)",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--md-primary)",
              textDecoration: "none",
              letterSpacing: "0.1px",
              transition: "background 0.2s",
            }}>
              Sign in
            </Link>
            <Link href="/signup" className="md-btn-filled" style={{ textDecoration: "none" }}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 24px 80px", textAlign: "center" }}>
        {/* Eyebrow chip */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 16px",
            borderRadius: "var(--md-shape-full)",
            background: "var(--md-primary-container)",
            color: "var(--md-on-primary-container)",
            fontSize: 13, fontWeight: 500, letterSpacing: "0.1px",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--md-primary)", display: "inline-block" }} />
            Multi-region LLM Gateway — Now in GA
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(40px, 7vw, 72px)",
          lineHeight: 1.05,
          fontWeight: 400,
          letterSpacing: "-0.5px",
          color: "var(--md-on-surface)",
          maxWidth: 800,
          margin: "0 auto 24px",
        }}>
          One API.{" "}
          <span style={{
            background: "linear-gradient(135deg, var(--md-primary) 0%, #00897B 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}>
            Every model.
          </span>
        </h1>

        <p style={{
          fontSize: 18,
          lineHeight: "28px",
          color: "var(--md-on-surface-variant)",
          maxWidth: 560,
          margin: "0 auto 48px",
          letterSpacing: "0.25px",
        }}>
          Route, cache, and monitor your AI traffic across providers — with built-in
          rate limiting, audit logs, and enterprise controls.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="md-btn-filled" style={{ fontSize: 16, height: 48, padding: "0 32px", textDecoration: "none" }}>
            Start for free <ArrowRight style={{ width: 18, height: 18 }} />
          </Link>
          <Link href="/login" className="md-btn-outlined" style={{ fontSize: 16, height: 48, padding: "0 32px", textDecoration: "none" }}>
            Sign in
          </Link>
        </div>

        {/* Social proof */}
        <div style={{ marginTop: 48, display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { value: "10M+", label: "API requests/day" },
            { value: "99.99%", label: "Uptime SLA" },
            { value: "< 50ms", label: "P99 latency" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 500, color: "var(--md-primary)", letterSpacing: "-0.25px" }}>{value}</div>
              <div style={{ fontSize: 13, color: "var(--md-on-surface-variant)", marginTop: 2, letterSpacing: "0.25px" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature Cards ───────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto 80px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 400, color: "var(--md-on-surface)", letterSpacing: 0, marginBottom: 12 }}>
            Everything you need to ship AI
          </h2>
          <p style={{ fontSize: 16, color: "var(--md-on-surface-variant)", letterSpacing: "0.5px" }}>
            One unified gateway for all your language model infrastructure.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {features.map((feature) => (
            <div key={feature.title} className="md-card-outlined" style={{ padding: 28, cursor: "default" }}>
              <div style={{
                width: 48, height: 48,
                borderRadius: "var(--md-shape-md)",
                background: feature.containerColor,
                display: "grid", placeItems: "center",
                marginBottom: 20,
              }}>
                <feature.icon style={{ width: 24, height: 24, color: feature.iconColor }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--md-on-surface)", marginBottom: 8, letterSpacing: "0.15px" }}>
                {feature.title}
              </h3>
              <p style={{ fontSize: 14, color: "var(--md-on-surface-variant)", lineHeight: "20px", letterSpacing: "0.25px", margin: 0 }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Provider logos ──────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto 80px", padding: "0 24px" }}>
        <div className="md-card-filled" style={{ padding: "40px 48px", textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--md-on-surface-variant)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 32 }}>
            Works with every major provider
          </p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
            {providers.map((p) => (
              <div key={p} style={{
                display: "inline-flex", alignItems: "center",
                padding: "10px 20px",
                borderRadius: "var(--md-shape-sm)",
                border: "1px solid var(--md-outline-variant)",
                background: "var(--md-surface-container-lowest)",
                fontSize: 14, fontWeight: 500,
                color: "var(--md-on-surface-variant)",
                letterSpacing: "0.1px",
              }}>
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto 80px", padding: "0 24px" }}>
        <div style={{
          background: "var(--md-primary)",
          borderRadius: "var(--md-shape-xl)",
          padding: "56px 48px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Background decoration */}
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 240, height: 240,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -40, left: -40,
            width: 180, height: 180,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            pointerEvents: "none",
          }} />

          <h2 style={{ fontSize: 36, fontWeight: 400, color: "white", marginBottom: 16, letterSpacing: 0, position: "relative" }}>
            Ready to unify your AI stack?
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.8)", marginBottom: 36, letterSpacing: "0.5px", position: "relative" }}>
            Get started in minutes. No credit card required.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
            <Link href="/signup" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "0 32px", height: 48,
              borderRadius: "var(--md-shape-full)",
              background: "white",
              color: "var(--md-primary)",
              fontSize: 16, fontWeight: 500, letterSpacing: "0.1px",
              textDecoration: "none",
              boxShadow: "var(--md-elevation-2)",
              transition: "box-shadow 0.2s",
            }}>
              Create free account <ArrowRight style={{ width: 18, height: 18 }} />
            </Link>
            <Link href="/login" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "0 32px", height: 48,
              borderRadius: "var(--md-shape-full)",
              background: "rgba(255,255,255,0.12)",
              color: "white",
              fontSize: 16, fontWeight: 500, letterSpacing: "0.1px",
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.3)",
            }}>
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid var(--md-outline-variant)",
        background: "var(--md-surface-container-low)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              borderRadius: "var(--md-shape-sm)",
              background: "var(--md-primary-container)",
              display: "grid", placeItems: "center",
            }}>
              <Zap style={{ width: 16, height: 16, color: "var(--md-primary)" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--md-on-surface)" }}>OpenDoor</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { label: "Status", href: "/status" },
              { label: "Docs", href: "#" },
              { label: "Sign in", href: "/login" },
            ].map(({ label, href }) => (
              <Link key={label} href={href} style={{
                padding: "8px 16px",
                borderRadius: "var(--md-shape-full)",
                fontSize: 14,
                color: "var(--md-on-surface-variant)",
                textDecoration: "none",
                letterSpacing: "0.1px",
              }}>
                {label}
              </Link>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--md-on-surface-variant)", letterSpacing: "0.4px" }}>
            © 2026 OpenDoor
          </span>
        </div>
      </footer>
    </main>
  );
}

const features = [
  {
    title: "Intelligent routing",
    description: "Automatically route requests to the fastest or cheapest model based on your policies. Fallbacks built in.",
    icon: Globe,
    containerColor: "var(--md-primary-container)",
    iconColor: "var(--md-primary)",
  },
  {
    title: "API key management",
    description: "Issue scoped API keys with rate limits, model permissions, and spend caps per team or project.",
    icon: Key,
    containerColor: "var(--md-secondary-container)",
    iconColor: "var(--md-secondary)",
  },
  {
    title: "Real-time analytics",
    description: "Monitor token usage, latency, and cost across every model and provider from a single dashboard.",
    icon: BarChart3,
    containerColor: "var(--md-tertiary-container)",
    iconColor: "var(--md-tertiary)",
  },
  {
    title: "Compliance & audit",
    description: "Immutable audit logs, prompt filtering, data residency controls, and SOC 2 ready infrastructure.",
    icon: Shield,
    containerColor: "var(--md-primary-container)",
    iconColor: "var(--md-primary)",
  },
  {
    title: "Caching & optimization",
    description: "Semantic and exact-match caching cuts costs by up to 80% on repeated or similar prompts.",
    icon: Zap,
    containerColor: "var(--md-secondary-container)",
    iconColor: "var(--md-secondary)",
  },
  {
    title: "Enterprise SSO",
    description: "WorkOS-powered SAML/OIDC SSO, SCIM provisioning, and organization-level access controls.",
    icon: ChevronRight,
    containerColor: "var(--md-tertiary-container)",
    iconColor: "var(--md-tertiary)",
  },
];

const providers = ["OpenAI", "Anthropic", "Google", "Mistral", "Cohere", "Llama"];
