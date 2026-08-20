import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, KeyRound, Monitor, Terminal } from "lucide-react";
import { MarketingCtaBanner, MarketingHero } from "@/components/marketing-page-shell";
import { CopyButton } from "@/components/ui/copy-button";
import { getDb } from "@/lib/db";
import { models } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { docsHref, gatewayBaseUrl } from "@/lib/public-urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SDK & CLI — OpenDoor",
  description:
    "One API key unlocks the OpenDoor CLI and TypeScript SDK — chat, media, assistants, and hosted agents including OpenBot.",
};

const unlocks = [
  {
    title: "Chat & routing",
    body: "OpenAI-shaped completions, streaming, tools, and provider sort/order. Same path the playground uses.",
  },
  {
    title: "Media",
    body: "Images, video, and audio through /v1 — billed to the same prepaid quota as chat.",
  },
  {
    title: "Assistants & workflows",
    body: "Create, run, and iterate without opening the dashboard. Usage lands on this key.",
  },
  {
    title: "Agents, including OpenBot",
    body: "Boot OpenClaw, Hermes, NemoClaw, or OpenBot. Computer tools, take-the-wheel, and memory run on the gateway.",
  },
  {
    title: "Search",
    body: "POST /v1/plugins/web-search — Vertex grounding with citations. $0.10 / query, included on Enterprise.",
  },
];

const steps = [
  {
    title: "Mint a workspace key",
    description:
      "Dashboard → API keys. Allow the models you want. Caps and allowlists apply to CLI and SDK the same way they apply to curl.",
  },
  {
    title: "Point the client at OpenDoor",
    description:
      "Set OPENDOOR_API_KEY and OPENDOOR_BASE_URL. The CLI is bun run od --. The TypeScript client is @opendoor/sdk.",
  },
  {
    title: "Call anything on that key",
    description:
      "Chat, images, assistants, workflows, and hosted agents. OpenBot create/chat/computer is the same runtime as Agents in the dashboard.",
  },
];

const next = [
  {
    title: "API keys",
    body: "Mint a scoped key, then drop it into the CLI or SDK.",
    href: "/dashboard/api-keys",
    icon: KeyRound,
  },
  {
    title: "Agents",
    body: "OpenBot and the other hosted runtimes — same objects the API returns.",
    href: "/dashboard/agents",
    icon: Monitor,
  },
  {
    title: "CLI docs",
    body: "Every od command, including agents create/chat/computer.",
    href: docsHref("/getting-started/cli"),
    icon: Terminal,
  },
  {
    title: "API reference",
    body: "Chat, models, Search, errors, and the live /v1 catalog.",
    href: docsHref("/api"),
    icon: Bot,
  },
];

async function firstModelId() {
  try {
    const db = getDb();
    const row = await db
      .select({ modelId: models.modelId })
      .from(models)
      .where(eq(models.enabled, true))
      .limit(1);
    return row[0]?.modelId || "gemma-4-26b-a4b-it";
  } catch {
    return "gemma-4-26b-a4b-it";
  }
}

export default async function SdkPage() {
  const base = gatewayBaseUrl();
  const host = base.replace(/^https?:\/\//, "");
  const modelId = await firstModelId();

  const envExample = `export OPENDOOR_API_KEY=opd_…
export OPENDOOR_BASE_URL=${base}

bun run od -- chat --model ${modelId} --message "Hello"`;

  const openbotCli = `bun run od -- agents create --name "Desk" --runtime openbot --model ${modelId}
bun run od -- agents chat --id "$AGENT_ID" --message "Open https://example.com and summarize the page."
bun run od -- agents computer --id "$AGENT_ID" --take
bun run od -- agents computer --id "$AGENT_ID" --release`;

  const sdkExample = `import { OpenDoor } from "@opendoor/sdk";

const client = new OpenDoor({
  apiKey: process.env.OPENDOOR_API_KEY,
  baseURL: "${base}",
});

const chat = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "Hello" }],
});

const agent = await client.agents.create({
  name: "Desk",
  runtime: "openbot",
  modelId: "${modelId}",
});

const turn = await client.agents.chat(agent.id, {
  message: "Open https://example.com and summarize the page.",
});

await client.agents.computer(agent.id, "take");`;

  const curlExample = `curl ${base}/v1/agents \\
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Desk",
    "runtime": "openbot",
    "modelId": "${modelId}"
  }'

curl ${base}/v1/agents/$AGENT_ID/chat \\
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Open https://example.com and summarize the page."}'`;

  return (
    <article id="sdk-page">
      <MarketingHero
        eyebrow="SDK & CLI"
        title="One key. The whole platform from your terminal."
        description="Mint an API key, point the OpenDoor CLI or TypeScript SDK at the gateway, and use chat, media, assistants, and hosted agents — including OpenBot’s computer — without living in the dashboard."
        actions={
          <>
            <Link
              href="/dashboard/api-keys"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Mint an API key <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={docsHref("/")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-slate-50"
            >
              Call the API docs
            </Link>
          </>
        }
      />

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <div className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl shadow-slate-950/15">
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="space-y-8 p-8 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                Faster than the dashboard
              </p>
              {steps.map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-400/15 text-sm font-semibold text-blue-200">
                    {i + 1}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{step.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 bg-black/30 p-8 lg:border-l lg:border-t-0 lg:p-12">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                  First call
                </p>
                <CopyButton
                  value={envExample}
                  label="Copy"
                  className="!border-white/15 !bg-white/10 !text-white"
                />
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-xs leading-6 text-emerald-200">
                <code>{envExample}</code>
              </pre>
              <p className="mt-4 text-sm text-slate-400">
                Point clients at <span className="text-slate-200">{host}</span>. Model id comes from
                the live catalog. OPENDOOR_API_URL is accepted as an alias for the base URL.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          One Bearer key
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Everything the product can do is on this API.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {unlocks.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          OpenBot on the gateway
        </p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-foreground">
          CopilotKit OpenBot runs here — browser, /workspace files, and take-the-wheel.
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Create with <code className="rounded bg-muted px-1.5 py-0.5 text-sm">runtime: &quot;openbot&quot;</code>.
          That is the MIT OpenBot coworker stack — Chromium computer, /workspace files, snapshot-then-click,
          take-the-wheel — pointed at this gateway. CopilotKit Intelligence is not required. Set
          OPENBOT_SUPERVISOR_URL so each OpenBot gets its own Chromium container; without it,
          navigate/read/files still run here so CLI and SDK keep working. Agents is a $20/month
          add-on; tokens still bill workspace quota.
        </p>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">CLI</p>
              <CopyButton
                value={openbotCli}
                label="Copy"
                className="!border-white/15 !bg-white/10 !text-white"
              />
            </div>
            <pre className="mt-4 overflow-x-auto text-xs leading-6 text-emerald-200">
              <code>{openbotCli}</code>
            </pre>
          </div>
          <div className="overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                TypeScript SDK
              </p>
              <CopyButton
                value={sdkExample}
                label="Copy"
                className="!border-white/15 !bg-white/10 !text-white"
              />
            </div>
            <pre className="mt-4 overflow-x-auto text-xs leading-6 text-emerald-200">
              <code>{sdkExample}</code>
            </pre>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              curl
            </p>
            <CopyButton value={curlExample} label="Copy" />
          </div>
          <pre className="mt-4 overflow-x-auto text-xs leading-6 text-foreground">
            <code>{curlExample}</code>
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Then keep going</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {next.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex gap-4 rounded-2xl border border-border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <MarketingCtaBanner
        title="Ready to work from the terminal?"
        description="Create a workspace, mint a key, and run the same OpenBot coworker the dashboard hosts."
        href="/get-started"
        label="Get started free"
      />
    </article>
  );
}
