"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { InboxMenu } from "@/components/inbox-menu";
import { Button } from "@/components/ui/button";

export default function DashboardTools() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const isStudio = pathname === "/dashboard/studio" || pathname.startsWith("/dashboard/studio/");

  useEffect(() => {
    const open = () => setSearchOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("opendoor:command-palette", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("opendoor:command-palette", open);
    };
  }, []);

  return (
    <>
      {!isStudio && (
        <div className="pointer-events-none fixed right-4 top-4 z-30 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="pointer-events-auto bg-white/90 shadow-sm backdrop-blur md:hidden dark:bg-zinc-900/90"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0 font-mono text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </Button>
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-white/90 p-0.5 shadow-sm backdrop-blur dark:bg-zinc-900/90">
            <InboxMenu />
            <ThemeToggle />
          </div>
        </div>
      )}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
