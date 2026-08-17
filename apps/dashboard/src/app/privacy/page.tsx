import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Privacy Policy — OpenDoor",
  description: "How OpenDoor handles account, usage, and prompt data.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="August 16, 2026">
      <p>
        This policy describes how OpenDoor collects and uses data when you use the
        dashboard, API, playground, or public assistant pages.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">What we collect</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Account data: name, email, organization, role, and authentication records (including SSO identifiers when you use SSO).</li>
        <li>Billing data: plan, Stripe customer and subscription IDs, credit ledger, and invoices. Card numbers are handled by Stripe, not stored by us.</li>
        <li>Usage telemetry: model id, token counts, latency, cost, status codes, API key prefix, and timestamps for each gateway request.</li>
        <li>Optional content: prompts and completions may be stored when you use the playground, assistants, workflows, or when your org enables request logs for audit.</li>
        <li>Product analytics: page views and feature events via PostHog, using a project key configured for this product.</li>
        <li>
          Device inventory (optional, consent only): whether this machine has Metal or a GPU, usable memory,
          Ollama status, and local model tags. We do not read this until you allow it. Lawful basis is consent
          (GDPR Art. 6(1)(a)). You can withdraw in Models or Devices. We do not sell this data.
        </li>
      </ul>
      <h2 className="text-xl font-semibold text-slate-950">How we use it</h2>
      <p>
        We use this data to authenticate you, route and bill requests, enforce
        policies and spend limits, show usage in the dashboard, and keep the
        platform reliable. We do not sell personal data. Prompts forwarded to a
        model provider are processed under that provider’s terms.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Retention</h2>
      <p>
        Account and billing records are kept while the organization is active and
        as required for tax and fraud prevention. Request logs follow your org
        retention settings. You can revoke API keys and delete assistants from the
        dashboard; ask us to close an organization at{" "}
        <a href="mailto:hello@opendoor.ai">hello@opendoor.ai</a>. You can withdraw
        device-inventory consent at any time from Models or Devices; we then stop
        reading this machine.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Sharing</h2>
      <p>
        We share data with infrastructure processors (database, object storage,
        email, payments, analytics) and with the model providers you call. We
        disclose data if required by law.
      </p>
    </LegalDoc>
  );
}
