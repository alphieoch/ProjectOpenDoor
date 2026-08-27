import {
  Activity,
  ArrowRight,
  Bot,
  ClipboardList,
  FlaskConical,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatActivityWhen,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/account-activity";

const KIND_ICON: Record<ActivityKind, typeof Activity> = {
  audit: ClipboardList,
  request: Activity,
  agent: Bot,
  training: FlaskConical,
  workflow: GitBranch,
  chat: MessageSquare,
};

export function RecentActivityCard({
  items,
  emptyAction,
}: {
  items: ActivityItem[];
  emptyAction: { href: string; label: string; description: string };
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Account
        </p>
        <CardTitle className="font-sans text-lg">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No account activity yet</p>
            <p className="text-sm text-muted-foreground">{emptyAction.description}</p>
            <Link href={emptyAction.href} className={buttonVariants({ size: "sm" })}>
              {emptyAction.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const when = formatActivityWhen(item.at);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{item.title}</span>
                      {(item.actor || item.detail) && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {[item.actor, item.detail].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={item.at}
                      title={when.absolute}
                    >
                      {when.label}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
