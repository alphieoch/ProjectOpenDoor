import { NextRequest, NextResponse } from "next/server";
import { discoverPrivateImageEndpoint } from "@opendoor/shared";
import { requireAuth, sessionActorId } from "@/lib/auth";
import {
  listMarketplaceHosts,
  listThisHost,
  loadHostSharePage,
  unlistThisHost,
} from "@/lib/premium/host-listings";
import { premiumPageError, withEnsuredSchema } from "@/lib/premium/schema";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const image = await discoverPrivateImageEndpoint();
    const [host, availableHosts] = await Promise.all([
      withEnsuredSchema(() => loadHostSharePage(orgId, Boolean(image?.url))),
      withEnsuredSchema(() => listMarketplaceHosts(orgId)),
    ]);
    return NextResponse.json({
      host,
      availableHosts,
      isSiteAdmin: Boolean(session.isSiteAdmin),
      imageEndpoint: image,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/host] GET", err);
    return NextResponse.json(
      {
        error: premiumPageError(err, "Could not load host listings"),
        host: { listing: null, eligibility: null, inbound: [] },
        availableHosts: [],
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
    const image = await discoverPrivateImageEndpoint();
    const result = await listThisHost({
      orgId,
      userId: sessionActorId(session),
      isSiteAdmin: Boolean(session.isSiteAdmin),
      hourlyUsd: typeof body.hourlyUsd === "number" ? body.hourlyUsd : Number(body.hourlyUsd),
      studioLive: Boolean(image?.url),
    });
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, eligibility: result.eligibility },
        { status: result.status },
      );
    }
    return NextResponse.json({
      listing: result.listing,
      eligibility: result.eligibility,
      demo: result.demo,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/host] POST", err);
    return NextResponse.json({ error: premiumPageError(err, "Could not list this host") }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await requireAuth();
    const result = await unlistThisHost(session.orgId as string);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ listing: result.listing });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/host] DELETE", err);
    return NextResponse.json({ error: premiumPageError(err, "Could not unlist this host") }, { status: 500 });
  }
}
