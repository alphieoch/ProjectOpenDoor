const LINEAR_API = "https://api.linear.app/graphql";

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  state: string;
  labels: string[];
};

export function defaultJulesRepo(): string {
  return process.env.JULES_REPO?.trim() || "alphieoch/ProjectOpenDoor";
}

export function linearTeamId(): string {
  return (
    process.env.LINEAR_SELF_HEAL_TEAM_ID?.trim() ||
    process.env.LINEAR_SUPPORT_TEAM_ID?.trim() ||
    "a6753c8a-b614-4435-95b6-7c7ecde390a2"
  );
}

/** Prefer LINEAR_SELF_HEAL_ASSIGNEE, then LINEAR_SUPPORT_ASSIGNEE (UUID or email). */
async function resolveAssigneeId(): Promise<string | undefined> {
  const raw =
    process.env.LINEAR_SELF_HEAL_ASSIGNEE?.trim() ||
    process.env.LINEAR_SUPPORT_ASSIGNEE?.trim();
  if (!raw) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  try {
    const data = await linearGql<{
      users: { nodes: { id: string }[] };
    }>(
      `query Users($q: String!) {
        users(filter: { email: { eqIgnoreCase: $q } }, first: 1) {
          nodes { id }
        }
      }`,
      { q: raw }
    );
    return data.users.nodes[0]?.id;
  } catch {
    return undefined;
  }
}

async function linearGql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
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

export { linearGql };

export async function loadIssue(idOrIdentifier: string): Promise<LinearIssue> {
  const data = await linearGql<{
    issue: {
      id: string;
      identifier: string;
      title: string;
      description: string | null;
      url: string;
      state: { name: string };
      labels: { nodes: { name: string }[] };
    } | null;
  }>(
    `query One($id: String!) {
      issue(id: $id) {
        id identifier title description url
        state { name }
        labels { nodes { name } }
      }
    }`,
    { id: idOrIdentifier }
  );
  if (!data.issue) throw new Error(`Linear issue not found: ${idOrIdentifier}`);
  return {
    id: data.issue.id,
    identifier: data.issue.identifier,
    title: data.issue.title,
    description: data.issue.description || "",
    url: data.issue.url,
    state: data.issue.state.name,
    labels: data.issue.labels.nodes.map((l) => l.name),
  };
}

export async function nextAgentIssue(): Promise<LinearIssue | null> {
  const teamId = linearTeamId();
  const data = await linearGql<{
    issues: {
      nodes: {
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        url: string;
        state: { name: string };
        labels: { nodes: { name: string }[] };
      }[];
    };
  }>(
    `query Queue($teamId: ID!) {
      issues(
        first: 20
        orderBy: updatedAt
        filter: {
          team: { id: { eq: $teamId } }
          labels: { name: { in: ["agent", "self-heal"] } }
          state: { type: { in: ["unstarted", "backlog"] } }
        }
      ) {
        nodes {
          id identifier title description url
          state { name }
          labels { nodes { name } }
        }
      }
    }`,
    { teamId }
  );

  const preferred =
    data.issues.nodes.find((n) =>
      n.labels.nodes.some((l) => l.name.toLowerCase() === "agent")
    ) || data.issues.nodes[0];
  if (!preferred) return null;
  return {
    id: preferred.id,
    identifier: preferred.identifier,
    title: preferred.title,
    description: preferred.description || "",
    url: preferred.url,
    state: preferred.state.name,
    labels: preferred.labels.nodes.map((l) => l.name),
  };
}

export async function commentOnIssue(
  issueId: string,
  body: string
): Promise<void> {
  const data = await linearGql<{
    commentCreate: { success: boolean };
  }>(
    `mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }`,
    { issueId, body }
  );
  if (!data.commentCreate.success) throw new Error("Linear commentCreate failed");
}

export async function searchIssuesByIdentifier(
  identifier: string
): Promise<LinearIssue | null> {
  try {
    return await loadIssue(identifier);
  } catch {
    return null;
  }
}

export function posthogFingerprintToken(id: string): string {
  return `posthog_issue:${id}`;
}

export async function findIssueByToken(token: string): Promise<LinearIssue | null> {
  const teamId = linearTeamId();
  const data = await linearGql<{
    issues: {
      nodes: {
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        url: string;
        state: { name: string };
        labels: { nodes: { name: string }[] };
      }[];
    };
  }>(
    `query ByToken($teamId: ID!, $token: String!) {
      issues(
        first: 5
        filter: {
          team: { id: { eq: $teamId } }
          description: { contains: $token }
        }
      ) {
        nodes {
          id identifier title description url
          state { name }
          labels { nodes { name } }
        }
      }
    }`,
    { teamId, token }
  );
  const n = data.issues.nodes[0];
  if (!n) return null;
  return {
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    description: n.description || "",
    url: n.url,
    state: n.state.name,
    labels: n.labels.nodes.map((l) => l.name),
  };
}

export async function upsertSelfHealIssue(opts: {
  title: string;
  description: string;
  token: string;
  url?: string;
  priority?: number;
}): Promise<{ issue: LinearIssue; created: boolean }> {
  const existing = await findIssueByToken(opts.token);
  if (existing) {
    return { issue: existing, created: false };
  }
  const teamId = linearTeamId();
  const projectId =
    process.env.LINEAR_SELF_HEAL_PROJECT_ID?.trim() ||
    "1259fce9-8751-45b4-a2c7-e39088feae3d";
  const assigneeId = await resolveAssigneeId();
  const labelData = await linearGql<{
    issueLabels: { nodes: { id: string; name: string }[] };
  }>(
    `query Labels { issueLabels(first: 100) { nodes { id name } } }`,
    {}
  );
  const wanted = new Set(["agent", "self-heal"]);
  const labelIds = labelData.issueLabels.nodes
    .filter((l) => wanted.has(l.name.toLowerCase()))
    .map((l) => l.id);
  const data = await linearGql<{
    issueCreate: {
      success: boolean;
      issue: {
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        url: string;
        state: { name: string };
        labels: { nodes: { name: string }[] };
      } | null;
    };
  }>(
    `mutation Create($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id identifier title description url
          state { name }
          labels { nodes { name } }
        }
      }
    }`,
    {
      input: {
        teamId,
        projectId,
        ...(assigneeId ? { assigneeId } : {}),
        title: opts.title.slice(0, 200),
        description: opts.description,
        priority: opts.priority ?? 2,
        ...(labelIds.length ? { labelIds } : {}),
      },
    }
  );
  const issue = data.issueCreate.issue;
  if (!data.issueCreate.success || !issue) {
    throw new Error("Linear did not create the self-heal issue");
  }
  return {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || "",
      url: issue.url,
      state: issue.state.name,
      labels: issue.labels.nodes.map((l) => l.name),
    },
    created: true,
  };
}
