// Wire from providers/index.ts: registerExtraProviders(register) — owned by parity agent.
import type { ProviderAdapter } from "./base.js";
import { CerebrasProvider } from "./cerebras.js";
import { PerplexityProvider } from "./perplexity.js";

export function registerExtraProviders(register: (p: ProviderAdapter) => void) {
  register(new CerebrasProvider());
  if (!process.env.CEREBRAS_API_KEY) {
    console.log("Cerebras registered — set CEREBRAS_API_KEY or org BYOK to route traffic");
  }
  register(new PerplexityProvider());
  if (!process.env.PERPLEXITY_API_KEY) {
    console.log("Perplexity registered — set PERPLEXITY_API_KEY or org BYOK to route traffic");
  }
}
