import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DocsMarkdown } from "@/components/docs-markdown";
import { DocsNav } from "@/components/docs-nav";
import {
  adjacentPages,
  groupsForTab,
  knownDocHrefs,
  listDocSlugs,
  loadDocPage,
  loadDocsConfig,
  resolveDocSlug,
  tabForHref,
} from "@/lib/docs-content";
import { docsHref } from "@/lib/public-urls";

type Params = { slug?: string[] };

export function generateStaticParams() {
  return listDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params> | Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveDocSlug(slug ?? []);
  if (!resolved) return { title: "Docs — OpenDoor" };
  const page = loadDocPage(resolved);
  return {
    title: page ? `${page.title} — OpenDoor Docs` : "Docs — OpenDoor",
    description: page?.description,
  };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<Params> | Params;
}) {
  const { slug } = await params;
  const requested = slug ?? [];
  const resolved = resolveDocSlug(requested);
  if (!resolved) notFound();
  if (resolved.join("/") !== requested.join("/")) {
    redirect(docsHref(resolved.length === 0 ? "/" : `/${resolved.join("/")}`));
  }

  const page = loadDocPage(resolved);
  if (!page) notFound();

  const config = loadDocsConfig();
  const activeTab = tabForHref(page.href);
  const { prev, next } = adjacentPages(page.href);
  const showTitle = !page.body.trimStart().startsWith(`# ${page.title}`);

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-8 lg:py-14">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <DocsNav
          tabs={config.tabs}
          groups={groupsForTab(activeTab)}
          pinned={config.pinned}
          currentHref={page.href}
          activeTab={activeTab}
        />
      </aside>

      <article className="min-w-0 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Docs</p>
        {showTitle ? (
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{page.title}</h1>
        ) : null}
        {page.description ? (
          <p className="mt-3 max-w-2xl text-lg leading-7 text-muted-foreground">{page.description}</p>
        ) : null}
        <div className={showTitle || page.description ? "mt-8" : "mt-4"}>
          <DocsMarkdown content={page.body} docHrefs={[...knownDocHrefs()]} />
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link
              href={docsHref(prev.href)}
              className="rounded-2xl border border-border bg-card px-5 py-4 transition hover:border-foreground/20"
            >
              <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Previous
              </span>
              <p className="mt-1 font-medium text-foreground">{prev.title}</p>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={docsHref(next.href)}
              className="rounded-2xl border border-border bg-card px-5 py-4 text-right transition hover:border-foreground/20"
            >
              <span className="inline-flex items-center justify-end gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <p className="mt-1 font-medium text-foreground">{next.title}</p>
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  );
}
