import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold text-foreground">This page is not in the dashboard</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        That route does not exist. The rest of the workspace is still here.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
          Overview
        </Link>
        <Link href="/dashboard/tools" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Tools
        </Link>
        <Link href="/dashboard/team" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Team
        </Link>
      </div>
    </div>
  );
}
