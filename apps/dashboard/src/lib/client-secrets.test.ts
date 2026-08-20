import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dashboardSrc = join(import.meta.dir, "..");
const repoRoot = join(import.meta.dir, "../../../..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("Stripe secret stays off the client", () => {
  test("no client module mentions STRIPE_SECRET or imports the Stripe SDK helper", () => {
    const clientHits: string[] = [];
    for (const file of walk(dashboardSrc)) {
      const src = readFileSync(file, "utf8");
      const isClientFile =
        /^["']use client["'];/m.test(src) || /instrumentation-client\.ts$/.test(file);
      if (!isClientFile) continue;
      if (src.includes("STRIPE_SECRET")) clientHits.push(`${file}: STRIPE_SECRET`);
      if (/from\s+["']@\/lib\/stripe["']/.test(src)) clientHits.push(`${file}: @/lib/stripe`);
      if (/from\s+["']stripe["']/.test(src)) clientHits.push(`${file}: stripe package`);
    }
    expect(clientHits).toEqual([]);
  });

  test("server Stripe helper is the only STRIPE_SECRET_KEY reader", () => {
    const stripe = readFileSync(join(dashboardSrc, "lib/stripe.ts"), "utf8");
    expect(stripe).not.toMatch(/^["']use client["']/m);
    expect(stripe).toContain("process.env.STRIPE_SECRET_KEY");
    expect(stripe).not.toContain("NEXT_PUBLIC_STRIPE_SECRET");
  });

  test(".env.example does not publish the secret as NEXT_PUBLIC_", () => {
    const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
    expect(example).not.toMatch(/^NEXT_PUBLIC_STRIPE_SECRET/m);
    expect(example).toMatch(/^STRIPE_SECRET_KEY=/m);
    expect(example).toMatch(/^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=/m);
  });
});
