import { and, eq } from "drizzle-orm";
import { db, deployments } from "@opendoor/database";
import { getPremiumRental } from "./premium.js";

function addUrl(urls: string[], seen: Set<string>, raw?: string | null) {
  const url = (raw || "").replace(/\/$/, "");
  if (!url || seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}

export async function collectPrivateImageUrls(
  organizationId: string,
  model: string
): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();

  try {
    const rows = await db.query.deployments.findMany({
      where: and(
        eq(deployments.organizationId, organizationId),
        eq(deployments.sourceType, "image"),
        eq(deployments.status, "running")
      ),
    });
    for (const row of rows) addUrl(urls, seen, row.fqdn);
  } catch {
    /* local GPU still works without this lookup */
  }

  if (model.startsWith("premium:") && model !== "premium:private") {
    const rentalId = model.slice("premium:".length).split("/")[0];
    if (rentalId) {
      try {
        const rental = await getPremiumRental(organizationId, rentalId);
        addUrl(urls, seen, rental?.deployment?.fqdn);
      } catch {
        /* ignore */
      }
    }
  }

  if (model.startsWith("custom:")) {
    const deploymentId = model.slice("custom:".length).split("/")[0];
    if (deploymentId) {
      try {
        const row = await db.query.deployments.findFirst({
          where: and(
            eq(deployments.id, deploymentId),
            eq(deployments.organizationId, organizationId)
          ),
        });
        addUrl(urls, seen, row?.fqdn);
      } catch {
        /* ignore */
      }
    }
  }

  return urls;
}
