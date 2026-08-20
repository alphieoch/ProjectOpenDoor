import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function DashboardUnavailable({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/chat" className={buttonVariants({ size: "sm" })}>
          Open Chat
        </Link>
        <Link href="/dashboard/openbot" className={buttonVariants({ size: "sm", variant: "outline" })}>
          OpenBot
        </Link>
        <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Refresh Overview
        </Link>
      </div>
    </div>
  );
}
