const ICONS: Record<string, string> = {
  qwen: "/providers/qwen-color.svg",
  alibaba: "/providers/alibaba-color.svg",
  mistral: "/providers/mistral-color.svg",
  meta: "/providers/meta-color.svg",
  openai: "/providers/openai.svg",
  anthropic: "/providers/anthropic.svg",
  claude: "/providers/claude-color.svg",
  google: "/providers/google-color.svg",
  gemini: "/providers/gemini-color.svg",
  deepseek: "/providers/deepseek-color.svg",
  cohere: "/providers/cohere-color.svg",
  microsoft: "/providers/microsoft-color.svg",
  together: "/providers/together-color.svg",
  ollama: "/providers/ollama.svg",
  huggingface: "/providers/huggingface-color.svg",
};

function resolveIcon(provider: string, modelId = ""): string | null {
  const blob = `${provider} ${modelId}`.toLowerCase();
  if (/qwen/.test(blob)) return ICONS.qwen;
  if (/alibaba/.test(blob)) return ICONS.alibaba;
  if (/mistral|codestral/.test(blob)) return ICONS.mistral;
  if (/meta|llama|facebook/.test(blob)) return ICONS.meta;
  if (/claude/.test(blob)) return ICONS.claude;
  if (/anthropic/.test(blob)) return ICONS.anthropic;
  if (/gemini/.test(blob)) return ICONS.gemini;
  if (/google|gemma/.test(blob)) return ICONS.google;
  if (/openai|gpt-|chatgpt|\bo[1-4](-|$)/.test(blob)) return ICONS.openai;
  if (/deepseek/.test(blob)) return ICONS.deepseek;
  if (/cohere|command-r/.test(blob)) return ICONS.cohere;
  if (/microsoft|phi-|azure/.test(blob)) return ICONS.microsoft;
  if (/together/.test(blob)) return ICONS.together;
  if (/ollama|local gpu|this mac/.test(blob)) return ICONS.ollama;
  if (/huggingface|hugging face|hf\.co/.test(blob)) return ICONS.huggingface;
  if (/my llm|local gpu|custom/.test(blob)) return ICONS.ollama;
  return null;
}

export function ProviderLogo({
  provider,
  modelId,
  size = 18,
  title,
}: {
  provider: string;
  modelId?: string;
  size?: number;
  title?: string;
}) {
  const src = resolveIcon(provider, modelId);
  const label = title || provider;

  return (
    <span
      title={label}
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.22)),
        overflow: "hidden",
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        background: "var(--paper)",
      }}
    >
      {src ? (
        // Official LobeHub brand marks
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />
      ) : (
        <span
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            fontSize: size * 0.45,
            fontWeight: 700,
            color: "var(--ink-3)",
            background: "var(--paper-3)",
          }}
        >
          {(provider || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
