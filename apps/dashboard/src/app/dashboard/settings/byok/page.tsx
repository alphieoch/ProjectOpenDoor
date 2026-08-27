"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ByokPanel } from "@/components/dashboard/byok-panel";

export default function ByokSettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Provider keys"
        description="Bring your own provider API keys (BYOK). Secrets are encrypted and never shown again — only a prefix."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/api-keys" className="btn btn-sm">
              API keys
            </Link>
            <Link href="/dashboard/settings" className="btn btn-sm">
              Back to settings
            </Link>
          </div>
        }
      />
      <p className="mb-6 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        Same table the gateway uses. See{" "}
        <Link href="/docs/how-it-works/byok" className="underline">
          Bring your own keys
        </Link>{" "}
        and{" "}
        <Link href="/docs/how-it-works/api-keys" className="underline">
          API keys
        </Link>
        .
      </p>
      <ByokPanel heading="Add or rotate a provider key" />
    </div>
  );
}
