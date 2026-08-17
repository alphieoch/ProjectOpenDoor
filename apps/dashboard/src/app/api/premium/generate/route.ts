import { NextRequest, NextResponse } from "next/server";
import { generatePrivateImage, isPrivateImageDown } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import { getRental } from "@/lib/premium/rentals";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const rentalId = typeof body.rentalId === "string" ? body.rentalId : "";
  const extraUrls: string[] = [];
  if (rentalId) {
    const rental = await getRental(orgId, rentalId);
    if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });
    if (rental.status !== "active" && rental.status !== "pending") {
      return NextResponse.json({ error: "Rental is not active" }, { status: 409 });
    }
    if (rental.deployment?.fqdn) extraUrls.push(rental.deployment.fqdn);
  }

  try {
    const { image, endpoint } = await generatePrivateImage({
      prompt,
      size: typeof body.size === "string" ? body.size : undefined,
      extraUrls,
    });
    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      model: rentalId ? `premium:${rentalId}` : "premium",
      endpoint,
      data: [{ b64_json: image.b64, mime: image.mime }],
    });
  } catch (err) {
    if (isPrivateImageDown(err)) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
