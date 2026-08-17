import type { Metadata } from "next";
import { MarketingCtaBanner, MarketingHero } from "@/components/marketing-page-shell";
import { RankingsTable } from "./rankings-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rankings — OpenDoor",
  description:
    "Public model prices and configured/up status from OpenDoor pricing and status APIs.",
};

export default function RankingsPage() {
  return (
    <article id="rankings-page">
      <MarketingHero
        eyebrow="Rankings"
        title="Published prices and provider status."
        description="A public table of catalog models: list price from /api/public/pricing and configured/up from /api/status. No invented latency."
      />
      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-8">
        <RankingsTable />
      </section>
      <MarketingCtaBanner
        title="See the full rate card"
        description="Plans, embeddings, and on-demand GPUs live on the pricing page."
        href="/pricing"
        label="Pricing"
      />
    </article>
  );
}
