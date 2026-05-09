import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

let _composio: Composio | null = null;

export function getComposio(): Composio {
  if (!_composio) {
    _composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY!,
      provider: new VercelProvider(),
    });
  }
  return _composio;
}

// One Composio user per org — isolates each org's connected accounts
export function entityId(orgId: string): string {
  return `od-${orgId}`;
}
