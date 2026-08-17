/**
 * Talk to a running dedicated endpoint's LoRA control plane (vLLM OpenAI server).
 * Local Ollama targets do not support multi-LoRA load — those stay pending with a hint.
 */

export async function loadLoraOnEndpoint(opts: {
  fqdn: string;
  name: string;
  adapterUri: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const base = opts.fqdn.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/load_lora_adapter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lora_name: opts.name,
        lora_path: opts.adapterUri,
      }),
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    // Older vLLM builds use a different path — try once more
    if (res.status === 404) {
      const alt = await fetch(`${base}/load_lora_adapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lora_name: opts.name,
          lora_path: opts.adapterUri,
        }),
      });
      if (alt.ok) return { ok: true };
      return { ok: false, detail: (await alt.text()) || text };
    }
    return { ok: false, detail: text.slice(0, 1000) };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "load failed" };
  }
}

export async function unloadLoraOnEndpoint(opts: {
  fqdn: string;
  name: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const base = opts.fqdn.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/unload_lora_adapter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lora_name: opts.name }),
    });
    if (res.ok || res.status === 404) return { ok: true };
    return { ok: false, detail: (await res.text()).slice(0, 1000) };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "unload failed" };
  }
}
