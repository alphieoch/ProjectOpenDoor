"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { docsHref } from "@/lib/public-urls";

function textFrom(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFrom).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textFrom((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function rewriteHref(href: string | undefined, known: Set<string>) {
  if (!href) return href;
  if (href.startsWith("mailto:") || href.startsWith("#")) return href;
  if (/^https?:\/\//.test(href)) {
    const match = href.match(/^https?:\/\/docs\.page\/alphieoch\/ProjectOpenDoor(\/.*)?$/);
    if (!match) return href;
    return docsHref(match[1] || "/");
  }
  const [path, hash] = href.split("#");
  const normalized = path === "" || path === "/" ? "/" : path.replace(/\/$/, "") || "/";
  if (known.has(normalized) || known.has(path)) {
    const dest = docsHref(normalized);
    return hash ? `${dest}#${hash}` : dest;
  }
  return href;
}

export function DocsMarkdown({
  content,
  docHrefs,
}: {
  content: string;
  docHrefs: string[];
}) {
  const known = new Set(docHrefs);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1({ children }) {
          return (
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h1>
          );
        },
        h2({ children }) {
          const id = slugify(textFrom(children));
          return (
            <h2 id={id} className="mt-12 scroll-mt-28 text-2xl font-semibold tracking-tight text-foreground">
              {children}
            </h2>
          );
        },
        h3({ children }) {
          const id = slugify(textFrom(children));
          return (
            <h3 id={id} className="mt-8 scroll-mt-28 text-lg font-semibold text-foreground">
              {children}
            </h3>
          );
        },
        p({ children }) {
          return <p className="mt-4 text-[15px] leading-7 text-muted-foreground first:mt-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground">{children}</ol>;
        },
        li({ children }) {
          return <li className="leading-7">{children}</li>;
        },
        a({ href, children }) {
          const next = rewriteHref(href, known) || href || "#";
          const className = "font-medium text-primary underline-offset-2 hover:underline";
          if (next.startsWith("/")) {
            return (
              <Link href={next} className={className}>
                {children}
              </Link>
            );
          }
          return (
            <a href={next} className={className} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="mt-6 border-l-2 border-primary pl-4 text-[15px] leading-7 text-muted-foreground">
              {children}
            </blockquote>
          );
        },
        hr() {
          return <hr className="my-10 border-border" />;
        },
        table({ children }) {
          return (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="bg-muted text-muted-foreground">{children}</thead>;
        },
        th({ children }) {
          return <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{children}</th>;
        },
        td({ children }) {
          return <td className="border-t border-border px-4 py-3 align-top text-foreground">{children}</td>;
        },
        code({ className, children, ...props }) {
          const text = String(children).replace(/\n$/, "");
          const language = /language-(\w+)/.exec(className || "")?.[1];
          if (!language) {
            return (
              <code
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{language}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(text);
                    setCopied(text);
                    window.setTimeout(() => setCopied(null), 1600);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-muted-foreground hover:bg-background"
                >
                  {copied === text ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied === text ? "Copied" : "Copy"}
                </button>
              </div>
              <SyntaxHighlighter
                style={oneLight}
                language={language === "mermaid" ? "text" : language}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: "1rem 1.1rem",
                  fontSize: "0.8125rem",
                  lineHeight: 1.6,
                  background: "transparent",
                }}
                codeTagProps={{
                  style: { fontFamily: "var(--font-roboto-mono), ui-monospace, monospace" },
                }}
              >
                {text}
              </SyntaxHighlighter>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
