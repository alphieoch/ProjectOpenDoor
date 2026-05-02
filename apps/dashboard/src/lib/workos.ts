import { WorkOS } from "@workos-inc/node";

let _workos: WorkOS | null = null;

export function getWorkOS(): WorkOS {
  if (_workos) return _workos;
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error("WORKOS_API_KEY is not defined");
  }
  _workos = new WorkOS(apiKey);
  return _workos;
}

export function getWorkOSClientId(): string {
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) {
    throw new Error("WORKOS_CLIENT_ID is not defined");
  }
  return clientId;
}
