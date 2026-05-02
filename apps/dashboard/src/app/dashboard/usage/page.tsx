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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage</h1>
          <p className="mt-1 text-gray-600">
            Track your LLM consumption and costs
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Total Requests</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatNumber(totals.requests)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Total Tokens</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatNumber(totals.tokens)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Total Cost</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatCurrency(totals.cost)}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Daily Requests
        </h2>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-gray-500">No usage data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Daily Cost
        </h2>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-gray-500">No usage data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="costUsd" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
