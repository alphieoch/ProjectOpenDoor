/**
 * How the agent tool loop should treat a failed /v1/chat/completions call.
 * Computer-use turns must keep tools; dropping them makes the model hallucinate clicks.
 */
export type AgentCompletionMode = "retry-tools" | "drop-tools" | "fail";

export function nextAgentCompletionMode(
  error: string,
  useTools: boolean,
  alreadyRetried: boolean,
): AgentCompletionMode {
  const text = error.trim();
  if (!useTools) return "fail";
  if (/does not support tools|tools? (are )?not supported|unknown tool|tool_choice/i.test(text)) {
    return "drop-tools";
  }
  if (!alreadyRetried && /all providers failed|gateway returned 502|\b502\b/i.test(text)) {
    return "retry-tools";
  }
  return "fail";
}
