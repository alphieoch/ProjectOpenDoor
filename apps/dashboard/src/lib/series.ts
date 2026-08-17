export function fillDailySeries(
  rows: Array<{ day: string | Date; value: number }>,
  days = 30
): number[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = typeof row.day === "string" ? row.day.slice(0, 10) : row.day.toISOString().slice(0, 10);
    map.set(key, Number(row.value) || 0);
  }
  const out: number[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(map.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return out;
}

export function deltaLabel(current: number, previous: number, invert = false): { text: string; up: boolean } {
  if (previous <= 0 && current <= 0) return { text: "—", up: true };
  if (previous <= 0) return { text: "New", up: true };
  const pct = ((current - previous) / previous) * 100;
  const up = invert ? pct <= 0 : pct >= 0;
  const abs = Math.abs(pct);
  return { text: `${pct >= 0 ? "+" : "−"}${abs.toFixed(1)}%`, up };
}
