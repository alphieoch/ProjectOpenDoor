import Link from "next/link";
import type { CSSProperties } from "react";
import { Briefcase, GraduationCap, Sparkles } from "lucide-react";

const cardStyle: CSSProperties = {
  border: "1px solid var(--md-outline-variant)",
  borderRadius: "var(--md-shape-lg)",
  background: "var(--md-surface-container-lowest)",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export default function GetStartedPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--md-surface)" }}>
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "var(--md-on-surface-variant)",
              marginBottom: 8,
            }}
          >
            Get started
          </p>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, marginBottom: 10 }}>
            Choose your onboarding path
          </h1>
          <p style={{ color: "var(--md-on-surface-variant)", fontSize: 16 }}>
            We tailor setup based on how you plan to use OpenDoor.
          </p>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles style={{ width: 16, height: 16, color: "var(--md-primary)" }} />
              <strong>Start free</strong>
            </div>
            <p style={{ color: "var(--md-on-surface-variant)", margin: 0 }}>
              Best for startups and teams who want to self-serve quickly.
            </p>
            <Link className="md-btn-filled" href="/login?signup=1&segment=standard">
              Continue with email signup
            </Link>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GraduationCap style={{ width: 16, height: 16, color: "var(--md-tertiary)" }} />
              <strong>Education</strong>
            </div>
            <p style={{ color: "var(--md-on-surface-variant)", margin: 0 }}>
              For universities, labs, and students. We will tailor onboarding for learning workflows.
            </p>
            <Link className="md-btn-outlined" href="/login?signup=1&segment=education">
              Continue with education signup
            </Link>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Briefcase style={{ width: 16, height: 16, color: "var(--md-secondary)" }} />
              <strong>Enterprise</strong>
            </div>
            <p style={{ color: "var(--md-on-surface-variant)", margin: 0 }}>
              Existing enterprise users should sign in via SSO. New enterprise deployments start with our team.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="md-btn-outlined" href="/login?mode=sso">
                Join via SSO
              </Link>
              <a className="md-btn-filled" href="mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise%20Onboarding">
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
