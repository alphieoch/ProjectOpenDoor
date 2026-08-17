"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const axisTick = { fontSize: 11, fill: "var(--ink-4)" } as const;
const tooltipStyle = {
  borderRadius: "8px", border: "1px solid var(--line)",
  fontSize: "12px", background: "var(--paper-2)", color: "var(--ink)",
} as const;

export function ViolationsTrend({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--paper-3)" }} />
        <Bar dataKey="count" name="Violations" fill="var(--red)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
