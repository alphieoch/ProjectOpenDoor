import type { Metadata } from "next";
import { MarketingCtaBanner } from "@/components/marketing-page-shell";
import { StatusBoard } from "./status-board";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status — OpenDoor",
  description: "Live health of the OpenDoor gateway, database, Redis, and configured providers.",
};

export default function StatusPage() {
  const cachet = process.env.CACHET_URL;
  const external = cachet && /^https?:\/\//.test(cachet) ? cachet : null;

  return (
    <article id="status-page">
      <StatusBoard externalStatusUrl={external} />
      <MarketingCtaBanner
        title="See the controls behind the probes"
        description="Auth, residency, and policy sit in front of every provider — not just a green banner."
        href="/security"
        label="Security"
      />
    </article>
  );
}
