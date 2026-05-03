"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface DailyUsage {
  date: string;
  requests: number;
  totalTokens: number;
  costUsd: number;
}

export default function UsagePage() {
  const [data, setData] = useState<DailyUsage[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      setLoading(true);
      const res = await fetch(`/api/usage?days=${days}`);
      if (res.ok) {
        const result = await res.json();
        setData(
          result.daily.map((d: any) => ({
            date: new Date(d.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            requests: Number(d.requests),
            totalTokens: Number(d.totalTokens),
            costUsd: Number(d.costUsd),
          }))
        );
      }
      setLoading(false);
    }
    fetchUsage();
  }, [days]);

  const totals = data.reduce(
    (acc, d) => ({
      requests: acc.requests + d.requests,
      tokens: acc.tokens + d.totalTokens,
      cost: acc.cost + d.costUsd,
    }),
    { requests: 0, tokens: 0, cost: 0 }
  );

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="page-title">Usage</h1>
          <p className="page-desc">Track your LLM consumption and costs</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input w-auto"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-zinc-500">Total Requests</p>
          <p className="mt-1.5 text-2xl font-semibold text-zinc-900">{formatNumber(totals.requests)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-zinc-500">Total Tokens</p>
          <p className="mt-1.5 text-2xl font-semibold text-zinc-900">{formatNumber(totals.tokens)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-zinc-500">Total Cost</p>
          <p className="mt-1.5 text-2xl font-semibold text-zinc-900">{formatCurrency(totals.cost)}</p>
        </div>
      </div>

      <div className="mt-6 card p-6">
        <h2 className="section-title mb-4">Daily Requests</h2>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-zinc-400">Loading…</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-zinc-400">No usage data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 12, fill: "#71717a" }} />
              <Tooltip
                contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7", fontSize: "12px" }}
              />
              <Bar dataKey="requests" fill="#18181b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-6 card p-6">
        <h2 className="section-title mb-4">Daily Cost</h2>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-zinc-400">Loading…</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-zinc-400">No usage data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 12, fill: "#71717a" }} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7", fontSize: "12px" }}
              />
              <Bar dataKey="costUsd" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
