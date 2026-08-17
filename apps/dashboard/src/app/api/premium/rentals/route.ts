import { NextRequest, NextResponse } from "next/server";
import { PREMIUM_IMAGE_MODELS, discoverPrivateImageEndpoint } from "@opendoor/shared";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { createRental, listRentals } from "@/lib/premium/rentals";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const [rentals, image] = await Promise.all([
    listRentals(orgId),
    discoverPrivateImageEndpoint(),
  ]);
  return NextResponse.json({
    rentals,
    catalog: PREMIUM_IMAGE_MODELS,
    imageEndpoint: image,
  });
}

export async function POST(req: NextRequest) {
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
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, requiredCents: "requiredCents" in result ? result.requiredCents : undefined },
      { status: result.status }
    );
  }
  return NextResponse.json({ rental: result.rental }, { status: 201 });
}
