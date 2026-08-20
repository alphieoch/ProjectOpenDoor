import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createSupportIssue,
  linearConfigured,
  listSupportIssues,
  type SupportSeverity,
} from "@/lib/linear";
import { posthogServerCapture } from "@/lib/posthog-server";

const SEVERITIES = new Set<SupportSeverity>(["low", "medium", "high", "critical"]);

function asSeverity(value: unknown): SupportSeverity | null {
  return typeof value === "string" && SEVERITIES.has(value as SupportSeverity)
    ? (value as SupportSeverity)
    : null;
}

export async function GET() {
  try {
    const session = await requireAuth();
    const configured = linearConfigured();
    if (!configured.ok) {
      return NextResponse.json({
        configured: false,
        missing: configured.missing,
        tickets: [],
        message: `configure ${configured.missing.join(" and ")}`,
      });
    }

    const tickets = await listSupportIssues(session.orgId);
    return NextResponse.json({ configured: true, tickets });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list tickets";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const configured = linearConfigured();
    if (!configured.ok) {
      return NextResponse.json(
        {
          error: `configure ${configured.missing.join(" and ")}`,
          missing: configured.missing,
        },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      subject?: string;
      body?: string;
      severity?: string;
      pageUrl?: string;
      source?: string;
    };
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const severity = asSeverity(body.severity);
    const pageUrl =
      typeof body.pageUrl === "string" && body.pageUrl.trim()
        ? body.pageUrl.trim().slice(0, 2000)
        : null;
    const source =
      typeof body.source === "string" && body.source.trim()
        ? body.source.trim().slice(0, 64)
        : "support_page";
    if (!subject || !text || !severity) {
      return NextResponse.json(
        { error: "subject, body, and severity (low|medium|high|critical) are required" },
        { status: 400 }
      );
    }

    const sessionId = req.headers.get("x-posthog-session-id");
    const distinctId =
      req.headers.get("x-posthog-distinct-id") || session.userId;
    const userAgent = req.headers.get("user-agent");

    const ticket = await createSupportIssue({
      subject,
      body: text,
      severity,
      orgId: session.orgId,
      email: session.email,
      userId: session.userId,
      pageUrl,
      userAgent,
      distinctId,
      sessionId,
    });

    posthogServerCapture(req, session.userId, "support_ticket_created", {
      organization_id: session.orgId,
      severity,
      linear_identifier: ticket.identifier,
      linear_url: ticket.url,
      source,
      page_url: pageUrl,
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create ticket";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
