# Extra providers — **wired**

Cerebras and Perplexity adapters live in `apps/gateway/src/providers/` and are registered from `apps/gateway/src/providers/index.ts` after the Cohere block:

```ts
import { registerExtraProviders } from "./extras.js";
registerExtraProviders(register);
```

Groq and xAI were already registered by the parity pass — they are **not** in `extras.ts` and were not double-registered.

Set `CEREBRAS_API_KEY` / `PERPLEXITY_API_KEY` to advertise those models. Constructors throw without a key; `registerExtraProviders` catches that and skips.

`instantiateProvider("cerebras" | "perplexity", orgKey)` passes the org BYOK key into the constructor. Env keys are the fallback.
