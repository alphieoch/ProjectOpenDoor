import { Hono } from "hono";
import {
  generatePrivateImage,
  isPrivateImageDown,
  PREMIUM_IMAGE_MODELS,
} from "@opendoor/shared";
import {
  createPremiumRental,
  getPremiumRental,
  listPremiumRentals,
  stopPremiumRental,
} from "../lib/premium.js";

const premiumRouter = new Hono();

premiumRouter.get("/rentals", async (c) => {
  const organization = c.get("organization");
  const rentals = await listPremiumRentals(organization.id);
  return c.json({ object: "list", data: rentals, catalog: PREMIUM_IMAGE_MODELS });
});

premiumRouter.post("/rentals", async (c) => {
  const organization = c.get("organization");
  const body = await c.req.json().catch(() => ({}));
  const result = await createPremiumRental(organization.id, body);
  if ("error" in result) {
    return c.json({ error: { message: result.error, type: "invalid_request" } }, result.status);
  }
  return c.json(result.rental, 201);
});

premiumRouter.get("/rentals/:id", async (c) => {
  const organization = c.get("organization");
  const rental = await getPremiumRental(organization.id, c.req.param("id"));
  if (!rental) {
    return c.json({ error: { message: "Rental not found", type: "not_found" } }, 404);
  }
  return c.json(rental);
});

premiumRouter.delete("/rentals/:id", async (c) => {
  const organization = c.get("organization");
  const rental = await stopPremiumRental(organization.id, c.req.param("id"));
  if (!rental) {
    return c.json({ error: { message: "Rental not found", type: "not_found" } }, 404);
  }
  return c.json(rental);
});

premiumRouter.post("/images", async (c) => {
  const organization = c.get("organization");
  const body = await c.req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return c.json({ error: { message: "prompt is required", type: "invalid_request" } }, 400);
  }

  const model = typeof body.model === "string" ? body.model : "";
  const extraUrls: string[] = [];
  if (model.startsWith("premium:")) {
    const rentalId = model.slice("premium:".length).split("/")[0];
    const rental = await getPremiumRental(organization.id, rentalId);
    if (!rental) {
      return c.json({ error: { message: "Rental not found", type: "not_found" } }, 404);
    }
    if (rental.deployment?.fqdn) extraUrls.push(rental.deployment.fqdn);
  } else if (model.startsWith("custom:")) {
    const { db, deployments } = await import("@opendoor/database");
    const { and, eq } = await import("drizzle-orm");
    const deploymentId = model.slice("custom:".length).split("/")[0];
    const deployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.id, deploymentId),
        eq(deployments.organizationId, organization.id)
      ),
    });
    if (deployment?.fqdn) extraUrls.push(deployment.fqdn);
  }

  try {
    const { image, endpoint } = await generatePrivateImage({
      prompt,
      size: typeof body.size === "string" ? body.size : undefined,
      extraUrls,
    });
    return c.json({
      created: Math.floor(Date.now() / 1000),
      model: model || "premium",
      endpoint,
      data: [{ b64_json: image.b64 }],
    });
  } catch (err) {
    if (isPrivateImageDown(err)) {
      return c.json({ error: { message: err.message, type: "private_gpu_down" } }, 503);
    }
    const message = err instanceof Error ? err.message : "Image generation failed";
    return c.json({ error: { message, type: "upstream_error" } }, 502);
  }
});

export default premiumRouter;
