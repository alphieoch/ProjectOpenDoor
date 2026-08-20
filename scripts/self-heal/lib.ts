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
