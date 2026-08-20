import { eq } from "drizzle-orm";
import { organizations, users } from "@opendoor/database";
import {
  mergeWorldMetadata,
  persistWorldPreference,
  worldPreferenceFromMetadata,
  type WorldPreference,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";

export function worldPreferenceFromRequest(
  req: {
    cookies: { get(name: string): { value: string } | undefined };
    nextUrl?: { searchParams: { get(name: string): string | null } };
    headers?: { get(name: string): string | null };
  },
  body?: { locale?: unknown; region?: unknown; country?: unknown; lang?: unknown },
): WorldPreference {
  return persistWorldPreference({
    locale:
      body?.locale ??
      body?.lang ??
      req.nextUrl?.searchParams.get("lang") ??
      req.nextUrl?.searchParams.get("locale") ??
      req.cookies.get("od_locale")?.value,
    region: body?.region ?? req.cookies.get("od_region")?.value,
    country: body?.country ?? req.cookies.get("od_country")?.value,
  });
}

export async function persistWorldToWorkspace(opts: {
  userId?: string | null;
  orgId?: string | null;
  preference: WorldPreference;
}): Promise<WorldPreference> {
  const preference = persistWorldPreference(opts.preference);
  const db = getDb();

  if (opts.userId) {
    try {
      await db
        .update(users)
        .set({ locale: preference.locale, updatedAt: new Date() })
        .where(eq(users.id, opts.userId));
    } catch (err) {
      console.error("[world] user locale", err);
    }
  }

  if (opts.orgId) {
    let metadata: unknown = {};
    try {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, opts.orgId),
        columns: { metadata: true },
      });
      metadata = org?.metadata;
    } catch (err) {
      console.error("[world] org metadata", err);
    }
    const nextMetadata = mergeWorldMetadata(metadata, preference);
    try {
      await db
        .update(organizations)
        .set({
          region: preference.region,
          country: preference.country,
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, opts.orgId));
    } catch (err) {
      console.error("[world] org region columns", err);
      try {
        await db
          .update(organizations)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(eq(organizations.id, opts.orgId));
      } catch (metaErr) {
        console.error("[world] org metadata fallback", metaErr);
      }
    }
  }

  return preference;
}

export function worldFromOrg(org?: {
  region?: string | null;
  country?: string | null;
  metadata?: unknown;
} | null): WorldPreference {
  const fromMeta = worldPreferenceFromMetadata(org?.metadata);
  return persistWorldPreference({
    locale: fromMeta.locale,
    region: org?.region ?? fromMeta.region,
    country: org?.country ?? fromMeta.country,
  });
}
