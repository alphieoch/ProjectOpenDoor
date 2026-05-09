"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";

interface MarkdownContentProps {
  content: string;
  isDark?: boolean;
}

export function MarkdownContent({ content, isDark }: MarkdownContentProps) {
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});

  async function copyCode(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    } catch {
      // ignore
    }
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-3 last:mb-0 list-disc pl-5 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-3 last:mb-0 list-decimal pl-5 space-y-1">{children}</ol>;
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>;
        },
        h1({ children }) {
          return <h1 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: "var(--brand)" }}
            >
              {children}
            </a>
          );
        },
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          const codeString = String(children).replace(/\n$/, "");
          const key = `${language}-${codeString.slice(0, 40)}`;

          if (!inline && language) {
            return (
              <div className="mb-3 last:mb-0 rounded-xl overflow-hidden border" style={{ borderColor: "var(--line)" }}>
                <div
                  className="flex items-center justify-between px-3 py-1.5 text-xs"
                  style={{ background: "var(--paper-3)", color: "var(--ink-3)" }}
                >
                  <span className="font-mono uppercase">{language}</span>
                  <button
                    onClick={() => copyCode(codeString, key)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {copiedMap[key] ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <SyntaxHighlighter
                  style={isDark ? (oneLight as any) : oneLight}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: "1rem",
                    fontSize: "0.8125rem",
                    lineHeight: "1.5",
                    background: isDark ? "#1C212B" : "#F2F3FB",
                  }}
                  codeTagProps={{
                    style: {
                      fontFamily: "'Roboto Mono', monospace",
                    },
                  }}
                  {...props}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          }

          return (
            <code
              className="px-1.5 py-0.5 rounded-md text-xs font-mono"
              style={{
                background: "var(--paper-3)",
                color: "var(--ink-2)",
              }}
              {...props}
            >
              {children}
            </code>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote
              className="border-l-2 pl-3 italic mb-3 last:mb-0"
              style={{ borderColor: "var(--brand)", color: "var(--ink-2)" }}
            >
              {children}
            </blockquote>
          );
        },
        hr() {
          return <hr className="my-4 border-t" style={{ borderColor: "var(--line)" }} />;
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto mb-3 last:mb-0">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead style={{ background: "var(--paper-3)" }}>{children}</thead>;
        },
        th({ children }) {
          return (
            <th
              className="px-3 py-2 text-left text-xs font-semibold border-b"
              style={{ borderColor: "var(--line)" }}
            >
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td
              className="px-3 py-2 border-b text-sm"
              style={{ borderColor: "var(--line)" }}
            >
              {children}
            </td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
