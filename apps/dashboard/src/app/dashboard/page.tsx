export const dynamic = "force-dynamic";

import { getDb } from "@/lib/db";
import { requests, apiKeys } from "@opendoor/database";
import { eq, sql, gte, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Activity,
  CreditCard,
  Key,
  TrendingUp,
} from "lucide-react";
import PricingCalculator from "@/components/pricing-calculator";
import RateLimitPanel from "@/components/rate-limit-bar";

export default async function DashboardPage() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const db = getDb();
  const stats = await db
    .select({
      totalRequests: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`SUM(${requests.totalTokens})`,
      totalCost: sql<number>`SUM(${requests.costUsd})`,
      avgLatency: sql<number>`AVG(${requests.latencyMs})`,
    })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, orgId),
        gte(requests.createdAt, since30)
      )
    );

  const keyCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, orgId));

  const stat = stats[0];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-gray-600">
        Overview of your LLM usage in the last 30 days
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={formatNumber(stat?.totalRequests || 0)}
          icon={Activity}
        />
        <StatCard
          title="Total Tokens"
          value={formatNumber(stat?.totalTokens || 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Total Cost"
          value={formatCurrency(stat?.totalCost || 0)}
          icon={CreditCard}
        />
        <StatCard
          title="API Keys"
          value={formatNumber(keyCount[0]?.count || 0)}
          icon={Key}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PricingCalculator />
        <RateLimitPanel />
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Quick Start
        </h2>
        <div className="mt-4 space-y-3 text-sm text-gray-600">
          <p>
            1. Create an API key from the{" "}
            <a href="/dashboard/api-keys" className="text-primary-600 hover:underline">
              API Keys
            </a>{" "}
            page.
          </p>
          <p>
            2. Use the key to make requests to the gateway:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
            {`curl https://api.opendoor.ai/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-md bg-primary-50 p-3">
          <Icon className="h-5 w-5 text-primary-600" />
        </div>
      </div>
    </div>
  );
}
