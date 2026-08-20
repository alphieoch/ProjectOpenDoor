import { isSearchToolName } from "@opendoor/shared";
import { houseToolLabel, houseToolThreadContent, isHouseToolName } from "@/lib/openbot-tool-display";

export function HouseToolChip({
  name,
  content,
}: {
  name?: string | null;
  content: string;
}) {
  const title = houseToolLabel(name);
  const body =
    isHouseToolName(name) || isSearchToolName(name) ? houseToolThreadContent(name, content) : content;

  return (
    <div
      className="rounded-xl border border-border bg-muted px-3 py-2 text-sm"
      role="status"
      aria-label={`${title}. ${body}`}
    >
      <p className="text-[11px] leading-4 text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-wrap leading-5 text-foreground">{body}</p>
    </div>
  );
}
