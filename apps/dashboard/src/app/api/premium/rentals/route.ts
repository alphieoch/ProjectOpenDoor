import { NextRequest, NextResponse } from "next/server";
import { PREMIUM_IMAGE_MODELS, discoverPrivateImageEndpoint } from "@opendoor/shared";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { listedOpenDoorSkus } from "@/lib/premium/display";
import { createRental, listPremiumPage, listPremiumSkus } from "@/lib/premium/rentals";
import { premiumPageError } from "@/lib/premium/schema";

function fallbackSkus() {
  return [
    { sku: "metal", displayName: "Use this Mac (Metal)", hourlyUsd: 0, target: "local" as const, regionMultiplier: 1 },
    ...listedOpenDoorSkus(),
  ];
}

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const image = await discoverPrivateImageEndpoint();
    const page = await listPremiumPage(orgId, { studioLive: Boolean(image?.url) });
    return NextResponse.json({
      rentals: page.rentals,
      skus: page.skus,
      deployments: page.deployments,
      availableHosts: page.availableHosts,
      host: page.host,
      catalog: PREMIUM_IMAGE_MODELS,
      imageEndpoint: image,
      isSiteAdmin: Boolean(session.isSiteAdmin),
      warning: page.warning || undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/rentals] GET", err);
    let skus = fallbackSkus();
    try {
      skus = await listPremiumSkus();
    } catch {
      /* listed GPU_RATES stay visible so Rent from OpenDoor is never blank */
    }
    return NextResponse.json(
      {
        error: premiumPageError(err),
        skus,
        rentals: [],
        deployments: [],
        availableHosts: [],
        host: { listing: null, eligibility: null, inbound: [] },
        catalog: PREMIUM_IMAGE_MODELS,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const body = await req.json().catch(() => ({}));
    const result = await createRental(orgId, sessionActorId(session), {
      target: body.target,
      deploymentId: body.deploymentId || body.deployment_id,
      sku: body.sku,
      hours: body.hours,
      modelId: body.modelId || body.model_id,
      weightsUri: body.weightsUri || body.weights_uri,
      name: body.name,
      reserved: body.reserved,
      scaleToZero: body.scaleToZero ?? body.scale_to_zero,
      hostShareId: body.hostShareId || body.host_share_id,
      isSiteAdmin: Boolean(session.isSiteAdmin),
    });
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, requiredCents: "requiredCents" in result ? result.requiredCents : undefined },
        { status: result.status }
      );
    }
    return NextResponse.json({ rental: result.rental }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/rentals] POST", err);
    return NextResponse.json({ error: premiumPageError(err, "Could not start rental") }, { status: 500 });
  }
}
