import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Terms of Service — OpenDoor",
  description: "Terms for using the OpenDoor LLM gateway, dashboard, and APIs.",
};

export default function TermsPage() {
  return (
    <LegalDoc title="Terms of Service" updated="August 16, 2026">
      <p>
        These terms govern access to OpenDoor, including the dashboard, API gateway,
        playground, deployments, and related services operated by Ochieng &amp; Co
        (“OpenDoor”, “we”). By creating an account or calling the API you agree to them.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Accounts and keys</h2>
      <p>
        You are responsible for every request made with credentials issued to your
        organization. Keep API keys secret, rotate them if they leak, and revoke keys
        you no longer need. We may suspend keys that abuse the service or violate
        provider policies.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">The service</h2>
      <p>
        OpenDoor routes model requests to third-party providers and, when you request
        it, to dedicated or local runtimes you configure. Model availability, latency,
        and output quality depend on those backends. We do not guarantee any particular
        model will remain listed or that a provider will accept every request.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Acceptable use</h2>
      <p>
        Do not use OpenDoor to break the law, to attack systems you do not own, to
        generate CSAM or other prohibited content, or to evade a provider’s usage
        policy. You must have rights to any prompts, files, or tools you send through
        the gateway.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Billing</h2>
      <p>
        Usage is billed from recorded token and request meters, plus any subscription
        or GPU fees you choose. Published prices are in USD unless marked otherwise.
        Unpaid invoices or exhausted credits may pause routing until the balance is
        restored.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Limitation of liability</h2>
      <p>
        The service is provided as-is. To the extent permitted by law we are not
        liable for indirect, incidental, or consequential damages, or for model
        outputs. Our aggregate liability for a claim is limited to the fees you paid
        us in the 12 months before the claim.
      </p>
      <h2 className="text-xl font-semibold text-slate-950">Contact</h2>
      <p>
        Questions: <a href="mailto:hello@opendoor.ai">hello@opendoor.ai</a>.
      </p>
    </LegalDoc>
  );
}
