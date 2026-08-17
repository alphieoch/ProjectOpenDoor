import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  deploymentRouters,
  deploymentRouterTargets,
  deployments,
} from "@opendoor/database";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const db = getDb();

  const routers = await db.query.deploymentRouters.findMany({
    where: eq(deploymentRouters.organizationId, orgId),
    orderBy: [desc(deploymentRouters.createdAt)],
  });

  if (routers.length === 0) {
    return NextResponse.json({ routers: [] });
  }

  const routerIds = routers.map((r) => r.id);
  const targets = await db.query.deploymentRouterTargets.findMany({
    where: inArray(deploymentRouterTargets.routerId, routerIds),
  });

  const deploymentIds = [...new Set(targets.map((t) => t.deploymentId))];
  const deps =
    deploymentIds.length > 0
      ? await db.query.deployments.findMany({
          where: and(
            eq(deployments.organizationId, orgId),
            inArray(deployments.id, deploymentIds)
          ),
        })
      : [];
  const depMap = new Map(deps.map((d) => [d.id, d]));

  return NextResponse.json({
    routers: routers.map((r) => ({
      ...r,
      modelId: `router:${r.slug}`,
      targets: targets
        .filter((t) => t.routerId === r.id)
        .map((t) => ({
          ...t,
          deployment: depMap.get(t.deploymentId)
            ? {
                id: depMap.get(t.deploymentId)!.id,
                name: depMap.get(t.deploymentId)!.name,
                status: depMap.get(t.deploymentId)!.status,
              }
            : null,
        })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const slug =
    typeof body.slug === "string" && body.slug.trim()
      ? slugify(body.slug)
      : slugify(name);
  const targetsIn = Array.isArray(body.targets) ? body.targets : [];

  if (!name || !slug) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (targetsIn.length < 2) {
    return NextResponse.json(
      { error: "At least two targets are required for A/B traffic split" },
      { status: 400 }
    );
  }

  const db = getDb();
  for (const t of targetsIn) {
    const depId = t.deploymentId || t.deployment_id;
    const weight = Number(t.weight ?? 100);
    if (!depId || weight <= 0) {
      return NextResponse.json(
        { error: "Each target needs deploymentId and positive weight" },
        { status: 400 }
      );
    }
    const dep = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, depId), eq(deployments.organizationId, orgId)),
    });
    if (!dep) {
      return NextResponse.json({ error: `Unknown deployment ${depId}` }, { status: 400 });
    }
  }

  const [router] = await db
    .insert(deploymentRouters)
    .values({
      organizationId: orgId,
      name,
      slug,
      status: "active",
    })
    .returning();

  const insertedTargets = await db
    .insert(deploymentRouterTargets)
    .values(
      targetsIn.map((t: any) => ({
        routerId: router.id,
        deploymentId: t.deploymentId || t.deployment_id,
        weight: Math.max(1, Math.floor(Number(t.weight ?? 100))),
      }))
    )
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.router_created",
    entityType: "deployment_router",
    entityId: router.id,
    metadata: { slug, targets: insertedTargets.length },
  });

  return NextResponse.json(
    {
      router: {
        ...router,
        modelId: `router:${router.slug}`,
        targets: insertedTargets,
      },
    },
    { status: 201 }
  );
}
