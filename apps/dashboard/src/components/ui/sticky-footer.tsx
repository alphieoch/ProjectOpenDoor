"use client";

import React from "react";
import Link from "next/link";
import { DoorOpen, Mail, Globe, Sun, Moon, ArrowUp } from "lucide-react";
import { useTheme } from "next-themes";
import { OchiengLogoSimple } from "@/components/logos/OchiengLogoSimple";
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
    <div className="flex items-center rounded-full border border-border bg-background px-1 py-1 shadow-sm">
      <button
        onClick={() => setTheme("light")}
        className={cn(
            "rounded-full p-2 transition min-h-[44px] min-w-[44px]",
            activeTheme === "light"
              ? "bg-background text-foreground ring-1 ring-border"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label="Light mode"
      >
        <Sun className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => window.scroll({ top: 0, behavior: "smooth" })}
        className="px-3 text-muted-foreground transition hover:text-foreground"
        aria-label="Scroll to top"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={() => setTheme("dark")}
        className={cn(
            "rounded-full p-2 transition min-h-[44px] min-w-[44px]",
            activeTheme === "dark"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label="Dark mode"
      >
        <Moon className="h-4 w-4" />
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
        <div className="relative flex w-full flex-col gap-10 rounded-t-2xl border-t border-border bg-background/70 px-6 py-10 backdrop-blur-md md:px-12">

          {/* Subtle radial glow */}
          <div aria-hidden className="absolute inset-0 isolate z-0 contain-strict">
            <div className="absolute top-0 left-0 h-[300px] w-[180px] -translate-y-[87.5%] -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsl(var(--estate-200)_/_0.4)_0,transparent_80%)]" />
          </div>

          {/* ── Brand + nav ── */}
          <div className="relative z-10 flex flex-col gap-10 md:flex-row">
            {/* Brand */}
            <AnimatedContainer className="w-full max-w-xs shrink-0 space-y-4">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <DoorOpen className="h-4 w-4" />
                </span>
                <span className="font-garamond text-base font-semibold text-foreground">OpenDoor</span>
              </Link>
              <p className="text-sm leading-6 text-muted-foreground">
                Simplifying AI for everyone.
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
                    className="rounded-lg border border-border p-2.5 text-muted-foreground transition hover:text-foreground"
                  >
                    <link.Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </AnimatedContainer>

            {/* Divider */}
            <div className="hidden w-px self-stretch border-l border-border md:block" />

            {/* Nav columns */}
            <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
              {footerLinkGroups.map((group, i) => (
                <AnimatedContainer key={group.label} delay={0.1 + i * 0.08}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
                    {group.label}
                  </h3>
                  <ul className="mt-4 space-y-2">
                    {group.links.map((link) => (
                      <li key={link.title}>
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition hover:text-foreground"
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
          <div className="relative z-10 my-2 border-t border-border" />

          {/* ── Bottom: copyright, parent mark, theme ── */}
          <div className="relative z-10 mt-auto flex flex-col gap-4">
            <div className="grid items-center gap-4 md:grid-cols-3">
              <p className="text-xs text-muted-foreground md:justify-self-start">
                © {new Date().getFullYear()} OpenDoor, Inc.
              </p>
              <a
                href="https://www.ochiengandco.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ochieng and Co"
                className="flex items-center justify-center gap-2 font-sans text-foreground hover:opacity-80 md:justify-self-center"
              >
                <OchiengLogoSimple size={32} className="dark:invert" />
                <span className="text-xs font-medium">Ochieng &amp; Co</span>
              </a>
              <div className="flex justify-start md:justify-end">
                <ThemeToggle />
              </div>
            </div>
            <p className="text-center font-sans text-sm text-muted-foreground">
              Simply AI for everyone
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Data ── */
const socialLinks = [
  { label: "Email", href: "mailto:hello@opendoor.ai", Icon: Mail },
  {
    label: "Ochieng & Co",
    href: "https://www.ochiengandco.com",
    Icon: Globe,
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
  if (shouldReduceMotion) return <div className={props.className}>{children}</div>;
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
