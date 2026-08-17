/** One live pack per industry — the names bootstrap and the enterprise seed share. */
export const CANONICAL_PACK_NAMES: Record<string, string[]> = {
  legal: ["Legal Services AI Pack"],
  finance: ["Financial Services AI Pack"],
  property: ["Property & Real Estate AI Pack", "Property & Real Estate Pack"],
  healthcare: ["Healthcare & Life Sciences AI Pack", "Healthcare & Life Sciences Pack"],
  government: ["Government & Public Sector AI Pack", "Government & Public Sector Pack"],
  general: ["Internal Tools Pack", "Internal Tools & Productivity"],
  insurance: ["Insurance Pack", "General Insurance & Lloyd's of London"],
  education: ["Education Pack", "Higher Education & Universities"],
  energy: ["Energy & Utilities Pack", "Energy Retail & Smart Metering"],
  retail: ["Retail & Consumer Pack", "E-Commerce & Online Retail"],
  media: ["Media & Comms Pack", "Broadcasting & OFCOM Compliance"],
  transport: ["Transport & Logistics Pack", "Logistics & Last-Mile Delivery"],
};

export const SECTOR_ORDER = [
  "legal",
  "finance",
  "insurance",
  "property",
  "healthcare",
  "government",
  "education",
  "energy",
  "retail",
  "media",
  "transport",
  "general",
] as const;

export function pickCanonicalPacks<T extends { sector: string; name: string }>(items: T[]): T[] {
  const bySector = new Map<string, T[]>();
  for (const item of items) {
    const list = bySector.get(item.sector) ?? [];
    list.push(item);
    bySector.set(item.sector, list);
  }

  const picked: T[] = [];
  const sectors = [
    ...SECTOR_ORDER.filter((s) => bySector.has(s)),
    ...[...bySector.keys()].filter((s) => !SECTOR_ORDER.includes(s as (typeof SECTOR_ORDER)[number])),
  ];

  for (const sector of sectors) {
    const list = bySector.get(sector) ?? [];
    const preferred = CANONICAL_PACK_NAMES[sector] ?? [];
    const match = preferred.map((name) => list.find((item) => item.name === name)).find(Boolean);
    picked.push(match ?? list[0]);
  }

  return picked.filter(Boolean);
}

export function appliedPackIds(policies: Array<{ metadata: unknown }>): string[] {
  const ids = new Set<string>();
  for (const policy of policies) {
    const meta = policy.metadata as { appliedFromPack?: string } | null;
    if (meta?.appliedFromPack) ids.add(meta.appliedFromPack);
  }
  return [...ids];
}
