const LINEAR_API = "https://api.linear.app/graphql";

export type SupportSeverity = "low" | "medium" | "high" | "critical";

export type LinearTicket = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  createdAt: string;
  priority: number;
  state: string;
};

export function linearConfigured(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.LINEAR_API_KEY?.trim()) missing.push("LINEAR_API_KEY");
  if (!process.env.LINEAR_SUPPORT_TEAM_ID?.trim()) missing.push("LINEAR_SUPPORT_TEAM_ID");
  return missing.length ? { ok: false, missing } : { ok: true };
}

function orgToken(orgId: string): string {
  return `org_id:${orgId}`;
}

function posthogLinks(opts: {
  distinctId?: string | null;
  sessionId?: string | null;
}): { personUrl?: string; sessionUrl?: string } {
  const ui = (
    process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ||
    process.env.POSTHOG_UI_HOST ||
    "https://us.posthog.com"
  ).replace(/\/$/, "");
  const projectId =
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID ||
    process.env.POSTHOG_PROJECT_ID ||
    "";
  if (!projectId) return {};
  return {
    personUrl: opts.distinctId
      ? `${ui}/project/${projectId}/person/${encodeURIComponent(opts.distinctId)}`
      : undefined,
    sessionUrl: opts.sessionId
      ? `${ui}/project/${projectId}/replay/${encodeURIComponent(opts.sessionId)}`
      : undefined,
  };
}

async function linearGql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = process.env.LINEAR_API_KEY?.trim();
  if (!key) throw new Error("LINEAR_API_KEY is not configured");
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: key,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || `Linear API ${res.status}`);
  }
  if (!json.data) throw new Error("Linear API returned no data");
  return json.data;
}

async function labelIdsFor(names: string[]): Promise<string[]> {
  try {
    const data = await linearGql<{
      issueLabels: { nodes: { id: string; name: string }[] };
    }>(
      `query Labels {
        issueLabels(first: 100) {
          nodes { id name }
        }
      }`,
      {}
    );
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    return data.issueLabels.nodes
      .filter((l) => wanted.has(l.name.toLowerCase()))
      .map((l) => l.id);
  } catch {
    return [];
  }
}

function inferLabels(subject: string, body: string, severity: SupportSeverity): string[] {
  const text = `${subject}\n${body}`.toLowerCase();
  const labels = ["user-report"];
  if (/\b(bill|invoice|stripe|checkout|subscription|credit)\b/.test(text)) labels.push("billing");
  if (/\b(gateway|5xx|api|provider|routing|timeout)\b/.test(text)) labels.push("gateway");
  if (severity === "high" || severity === "critical") labels.push("urgent");
  return labels;
}

function linearPriority(severity: SupportSeverity): number {
  if (severity === "critical") return 1;
  if (severity === "high") return 2;
  if (severity === "medium") return 3;
  return 4;
}

export async function createSupportIssue(opts: {
  subject: string;
  body: string;
  severity: SupportSeverity;
  orgId: string;
  email: string;
  userId?: string | null;
  pageUrl?: string | null;
  userAgent?: string | null;
  reportedAt?: string | null;
  distinctId?: string | null;
  sessionId?: string | null;
}): Promise<LinearTicket> {
  const teamId = process.env.LINEAR_SUPPORT_TEAM_ID!.trim();
  const projectId = process.env.LINEAR_SUPPORT_PROJECT_ID?.trim();
  const labels = inferLabels(opts.subject, opts.body, opts.severity);
  const ids = await labelIdsFor(labels);
  const { personUrl, sessionUrl } = posthogLinks({
    distinctId: opts.distinctId,
    sessionId: opts.sessionId,
  });
  const reportedAt = opts.reportedAt?.trim() || new Date().toISOString();

  const description = [
    opts.body.trim(),
    "",
    "---",
    `**${orgToken(opts.orgId)}**`,
    opts.userId ? `**User ID:** ${opts.userId}` : null,
    `**Email:** ${opts.email}`,
    `**Severity:** ${opts.severity}`,
    opts.pageUrl ? `**Page:** ${opts.pageUrl}` : null,
    opts.userAgent ? `**User-Agent:** ${opts.userAgent}` : null,
    `**Reported at:** ${reportedAt}`,
    personUrl ? `**PostHog person:** ${personUrl}` : null,
    sessionUrl ? `**PostHog session:** ${sessionUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const data = await linearGql<{
    issueCreate: {
      success: boolean;
      issue: {
        id: string;
        identifier: string;
        title: string;
        url: string;
        createdAt: string;
        priority: number;
        state: { name: string };
      } | null;
    };
  }>(
    `mutation Create($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id identifier title url createdAt priority
          state { name }
        }
      }
    }`,
    {
      input: {
        teamId,
        ...(projectId ? { projectId } : {}),
        title: opts.subject.slice(0, 200),
        description,
        priority: linearPriority(opts.severity),
        labelIds: ids,
      },
    }
  );

  const issue = data.issueCreate.issue;
  if (!data.issueCreate.success || !issue) {
    throw new Error("Linear did not create the issue");
  }
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    createdAt: issue.createdAt,
    priority: issue.priority,
    state: issue.state.name,
  };
}

export async function listSupportIssues(orgId: string, limit = 20): Promise<LinearTicket[]> {
  const teamId = process.env.LINEAR_SUPPORT_TEAM_ID!.trim();
  const data = await linearGql<{
    issues: {
      nodes: {
        id: string;
        identifier: string;
        title: string;
        url: string;
        createdAt: string;
        priority: number;
        state: { name: string };
      }[];
    };
  }>(
    `query Recent($teamId: ID!, $token: String!, $first: Int!) {
      issues(
        first: $first
        orderBy: createdAt
        filter: {
          team: { id: { eq: $teamId } }
          description: { contains: $token }
        }
      ) {
        nodes {
          id identifier title url createdAt priority
          state { name }
        }
      }
    }`,
    { teamId, token: orgToken(orgId), first: limit }
  );

  return data.issues.nodes.map((n) => ({
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    createdAt: n.createdAt,
    priority: n.priority,
    state: n.state.name,
  }));
}
