"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

export type UsageDailyPoint = {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  successCount?: number;
  errorCount?: number;
  cachedCount?: number;
};

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;
const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  fontSize: "12px",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
} as const;

export function DailyRequestChart({ daily }: { daily: UsageDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={daily} barSize={16}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--accent))" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {daily[0]?.successCount != null ? (
          <>
            <Bar dataKey="successCount" name="Success" stackId="a" fill="var(--green)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="cachedCount" name="Cached" stackId="a" fill="var(--blue)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="errorCount" name="Error" stackId="a" fill="var(--red)" radius={[4, 4, 0, 0]} />
          </>
        ) : (
          <Bar dataKey="requests" name="Requests" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyCostChart({ daily }: { daily: UsageDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={daily}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => [formatCurrency(v), "Cost"]}
          cursor={{ stroke: "hsl(var(--border))" }}
        />
        <Line
          type="monotone"
          dataKey="costUsd"
          name="Cost"
          stroke="var(--green)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DailyTokenChart({ daily }: { daily: UsageDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={daily}>
        <defs>
          <linearGradient id="gradPrompt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--blue)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradCompletion" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={55}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [formatNumber(v), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="promptTokens"
          name="Prompt (input)"
          stackId="1"
          stroke="var(--blue)"
          strokeWidth={2}
          fill="url(#gradPrompt)"
        />
        <Area
          type="monotone"
          dataKey="completionTokens"
          name="Completion (output)"
          stackId="1"
          stroke="var(--green)"
          strokeWidth={2}
          fill="url(#gradCompletion)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
