import { ProviderLogo } from "@/components/ui/provider-logo";

const PALETTE = [
  ["#1A73E8", "#D3E4FD"],
  ["#006E5A", "#C8EDD9"],
  ["#7A5700", "#FFEFC2"],
  ["#7C5CFF", "#E8E0FF"],
  ["#D97706", "#FFE8C7"],
  ["#0866FF", "#D6E6FF"],
  ["#FF6A00", "#FFE0CC"],
  ["#39AA56", "#D4F0DC"],
];

function hashHue(input: string) {
  let n = 0;
  for (let i = 0; i < input.length; i++) n = (n * 31 + input.charCodeAt(i)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

export function ModelMark({
  name,
  provider,
  modelId,
  size = 40,
}: {
  name: string;
  provider?: string;
  modelId?: string;
  size?: number;
}) {
  if (provider || modelId) {
    return <ProviderLogo provider={provider || name} modelId={modelId || name} size={size} title={provider || name} />;
  }

  const [fg, bg] = hashHue(name);
  const initials = name
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "M";

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: bg,
        color: fg,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-serif)",
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
