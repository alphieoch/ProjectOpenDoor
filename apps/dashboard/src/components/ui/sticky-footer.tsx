"use client";

import React from "react";
import Link from "next/link";
import { DIcons } from "dicons";
import { useTheme } from "next-themes";
import { DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { docsHref } from "@/lib/public-urls";
import { motion, useReducedMotion } from "framer-motion";

/* ── Theme toggle + scroll-to-top pill ── */
function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? resolvedTheme : "light";

  return (
    <div className="flex items-center rounded-full border border-dotted border-slate-300 bg-white px-1 py-1 shadow-sm dark:border-slate-600 dark:bg-slate-900">
      <button
        onClick={() => setTheme("light")}
        className={cn(
          "rounded-full p-2 transition",
          activeTheme === "light"
            ? "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        )}
        aria-label="Light mode"
      >
        <DIcons.Sun className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <button
        type="button"
        onClick={() => window.scroll({ top: 0, behavior: "smooth" })}
        className="px-3 text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100"
        aria-label="Scroll to top"
      >
        <DIcons.ArrowUp className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={() => setTheme("dark")}
        className={cn(
          "rounded-full p-2 transition",
          activeTheme === "dark"
            ? "bg-slate-950 text-white hover:bg-slate-800"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        )}
        aria-label="Dark mode"
      >
        <DIcons.Moon className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

/* ── Main footer ── */
type StickyFooterProps = React.ComponentProps<"footer">;

export function StickyFooter({ className, ...props }: StickyFooterProps) {
  return (
    <footer className={cn("relative w-full", className)} {...props}>
      <div className="relative">
        <div className="relative flex w-full flex-col gap-10 border-t border-slate-200/80 bg-white/70 px-6 py-10 dark:border-slate-700/70 dark:bg-slate-950/80 md:px-12">

          {/* Subtle radial glow */}
          <div aria-hidden className="absolute inset-0 isolate z-0 contain-strict">
            <div className="absolute top-0 left-0 h-[300px] w-[180px] -translate-y-[87.5%] -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(26,115,232,0.06)_0,transparent_80%)]" />
            <div className="absolute top-0 right-0 h-[300px] w-[200px] -translate-y-[70%] rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(26,115,232,0.04)_0,transparent_100%)]" />
          </div>

          {/* ── Brand + nav ── */}
          <div className="relative z-10 flex flex-col gap-10 md:flex-row">
            {/* Brand */}
            <AnimatedContainer className="w-full max-w-xs shrink-0 space-y-4">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white shadow-lg shadow-blue-900/10">
                  <DoorOpen className="h-4 w-4" />
                </span>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">OpenDoor</span>
              </Link>
              <p className="text-sm leading-6 text-slate-500 dark:text-slate-300">
                Provider-agnostic LLM API gateway. Route, govern, and monitor
                production AI traffic across every major provider from a
                single control plane.
              </p>
              {/* Social icons */}
              <div className="flex flex-wrap gap-2">
                {socialLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    className="rounded-xl border border-dotted border-slate-300 p-2.5 text-slate-500 transition-transform hover:-translate-y-1 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
                  >
                    <link.Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </AnimatedContainer>

            {/* Divider */}
            <div className="hidden w-px self-stretch border-l border-dotted border-slate-200 dark:border-slate-700 md:block" />

            {/* Nav columns */}
            <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
              {footerLinkGroups.map((group, i) => (
                <AnimatedContainer key={group.label} delay={0.1 + i * 0.08}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-900 dark:text-slate-100">
                    {group.label}
                  </h3>
                  <ul className="mt-4 space-y-2">
                    {group.links.map((link) => (
                      <li key={link.title}>
                        <Link
                          href={link.href}
                          className="text-sm text-slate-500 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                        >
                          {link.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </AnimatedContainer>
              ))}
            </div>
          </div>

          {/* ── Dotted divider ── */}
          <div className="relative z-10 my-2 border-t border-dotted border-slate-300 dark:border-slate-700" />

          {/* ── Bottom row: copyright + theme toggle ── */}
          <div className="relative z-10 mt-auto flex flex-wrap items-center justify-between gap-4">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-300">
              <span>© {new Date().getFullYear()} OpenDoor, Inc.</span>
              <span>—</span>
              <span>Made with</span>
              <DIcons.Heart className="h-3.5 w-3.5 animate-pulse text-red-500" />
              <span>by</span>
              <a
                href="https://www.ochiengandco.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-900 transition hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
              >
                Ochieng &amp; Co
              </a>
            </p>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Provider-agnostic LLM control plane
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Data ── */
const socialLinks = [
  { label: "Email", href: "mailto:hello@opendoor.ai", Icon: DIcons.Mail },
  {
    label: "Ochieng & Co",
    href: "https://www.ochiengandco.com",
    Icon: DIcons.Globe,
  },
];

const footerLinkGroups = [
  {
    label: "Product",
    links: [
      { title: "Platform", href: "/platform" },
      { title: "How it works", href: "/how-it-works" },
      { title: "Security", href: "/security" },
      { title: "Pricing", href: "/pricing" },
      { title: "Playground", href: "/dashboard/playground" },
    ],
  },
  {
    label: "Developers",
    links: [
      { title: "Get started", href: "/get-started" },
      { title: "API keys", href: "/dashboard/api-keys" },
      { title: "Usage", href: "/dashboard/usage" },
      { title: "System status", href: "/status" },
      { title: "Docs", href: docsHref("/") },
    ],
  },
  {
    label: "Solutions",
    links: [
      { title: "Startups", href: "/get-started" },
      { title: "Enterprise", href: "/get-started" },
      {
        title: "Sector templates",
        href: "/dashboard/governance/sector-templates",
      },
      { title: "Governance", href: "/dashboard/governance" },
      { title: "Compliance", href: "/dashboard/governance/compliance" },
    ],
  },
  {
    label: "Company",
    links: [
      { title: "About", href: "https://www.ochiengandco.com" },
      { title: "Contact", href: "mailto:hello@opendoor.ai" },
      { title: "Sign in", href: "/login" },
      { title: "Create account", href: "/signup" },
      { title: "Status", href: "/status" },
      { title: "Terms", href: "/terms" },
      { title: "Privacy", href: "/privacy" },
    ],
  },
];

/* ── Animated wrapper ── */
type AnimatedContainerProps = React.ComponentProps<typeof motion.div> & {
  children?: React.ReactNode;
  delay?: number;
};

function AnimatedContainer({ delay = 0.1, children, ...props }: AnimatedContainerProps) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return <div {...props}>{children}</div>;
  return (
    <motion.div
      initial={false}
      animate={{ filter: "blur(0px)", translateY: 0, opacity: 1 }}
      transition={{ delay, duration: 0.7, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
