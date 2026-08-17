import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type DocsTab = { id: string; title: string; href: string };
export type DocsPageLink = { title: string; href: string };
export type DocsSidebarGroup = {
  group: string;
  tab?: string;
  pages: DocsPageLink[];
};

export type DocsConfig = {
  name: string;
  description?: string;
  tabs: DocsTab[];
  sidebar: DocsSidebarGroup[];
  redirects?: Record<string, string>;
};

export type DocsArticle = {
  slug: string[];
  href: string;
  title: string;
  description: string;
  body: string;
};

function findRepoRoot() {
  const fromEnv = process.env.OPENDOOR_DOCS_ROOT;
  if (fromEnv && existsSync(join(fromEnv, "docs.json"))) return fromEnv;

  const candidates = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "../.."),
    join(process.cwd(), "../../.."),
    "/app",
  ];
  for (const root of candidates) {
    if (existsSync(join(root, "docs.json")) && existsSync(join(root, "docs"))) {
      return root;
    }
  }
  throw new Error("Could not find docs.json. Set OPENDOOR_DOCS_ROOT to the repo root.");
}

export function docsDir() {
  return join(findRepoRoot(), "docs");
}

export function loadDocsConfig(): DocsConfig {
  const raw = readFileSync(join(findRepoRoot(), "docs.json"), "utf8");
  return JSON.parse(raw) as DocsConfig;
}

function parseFrontmatter(raw: string) {
  if (!raw.startsWith("---")) {
    return { data: {} as Record<string, string>, body: raw };
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {} as Record<string, string>, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return { data, body: match[2] };
}

function expandDocsComponents(body: string) {
  return body.replace(/<CardGroup>([\s\S]*?)<\/CardGroup>/g, (_m, inner: string) => {
    const cards = [
      ...inner.matchAll(
        /<Card\s+title="([^"]+)"\s+href="([^"]+)"(?:\s+icon="[^"]*")?\s*>([\s\S]*?)<\/Card>/g,
      ),
    ];
    if (!cards.length) return inner;
    return cards
      .map(([, title, href, desc]) => `- **[${title}](${href})** — ${String(desc).trim()}`)
      .join("\n");
  });
}

function slugToHref(slug: string[]) {
  return slug.length === 0 ? "/" : `/${slug.join("/")}`;
}

function fileForSlug(slug: string[]) {
  return slug.length === 0 ? "index.mdx" : `${slug.join("/")}.mdx`;
}

function safeDocPath(file: string) {
  const root = resolve(docsDir());
  const abs = resolve(root, file);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.includes("\0")) return null;
  return abs;
}

export function listDocSlugs(): string[][] {
  const slugs: string[][] = [];
  const walk = (dir: string, prefix: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...prefix, entry.name]);
        continue;
      }
      if (!entry.name.endsWith(".mdx")) continue;
      if (entry.name === "index.mdx" && prefix.length === 0) {
        slugs.push([]);
        continue;
      }
      slugs.push([...prefix, entry.name.replace(/\.mdx$/, "")]);
    }
  };
  walk(docsDir(), []);
  return slugs;
}

export function knownDocHrefs() {
  const hrefs = new Set<string>(["/"]);
  for (const slug of listDocSlugs()) hrefs.add(slugToHref(slug));
  const config = loadDocsConfig();
  for (const group of config.sidebar) {
    for (const page of group.pages) hrefs.add(page.href);
  }
  return hrefs;
}

export function loadDocPage(slug: string[]): DocsArticle | null {
  const file = safeDocPath(fileForSlug(slug));
  if (!file || !existsSync(file)) return null;
  const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
  const href = slugToHref(slug);
  return {
    slug,
    href,
    title: data.title || headingFromBody(body) || href,
    description: data.description || "",
    body: expandDocsComponents(body).trim(),
  };
}

function headingFromBody(body: string) {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

export function resolveDocSlug(slug: string[]): string[] | null {
  const href = slugToHref(slug);
  const redirects = loadDocsConfig().redirects ?? {};
  const dest =
    redirects[href] ?? (href !== "/" ? redirects[`/docs${href}`] : undefined);
  if (dest) {
    const next = dest === "/" || dest === "" ? [] : dest.replace(/^\//, "").split("/");
    return loadDocPage(next) ? next : null;
  }
  return loadDocPage(slug) ? slug : null;
}

export function flattenSidebarPages() {
  return loadDocsConfig().sidebar.flatMap((group) => group.pages);
}

export function adjacentPages(href: string) {
  const pages = flattenSidebarPages();
  const i = pages.findIndex((page) => page.href === href);
  return {
    prev: i > 0 ? pages[i - 1] : null,
    next: i >= 0 && i < pages.length - 1 ? pages[i + 1] : null,
  };
}

export function tabForHref(href: string) {
  const config = loadDocsConfig();
  const group = config.sidebar.find((item) => item.pages.some((page) => page.href === href));
  return group?.tab ?? config.tabs[0]?.id ?? "guides";
}

export function groupsForTab(tabId: string) {
  return loadDocsConfig().sidebar.filter((group) => (group.tab ?? "guides") === tabId);
}
