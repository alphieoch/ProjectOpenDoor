import {
  DEFAULT_LOCALE,
  parseLocale,
  type AppLocale,
} from "@opendoor/shared";
import en from "../../../messages/en.json";

export type Messages = typeof en;

const loaders: Record<AppLocale, () => Promise<Messages>> = {
  en: async () => en,
  fr: () => import("../../../messages/fr.json").then((m) => m.default as Messages),
  ar: () => import("../../../messages/ar.json").then((m) => m.default as Messages),
  pt: () => import("../../../messages/pt.json").then((m) => m.default as Messages),
  sw: () => import("../../../messages/sw.json").then((m) => m.default as Messages),
  ha: () => import("../../../messages/ha.json").then((m) => m.default as Messages),
  yo: () => import("../../../messages/yo.json").then((m) => m.default as Messages),
  am: () => import("../../../messages/am.json").then((m) => m.default as Messages),
  zu: () => import("../../../messages/zu.json").then((m) => m.default as Messages),
  es: () => import("../../../messages/es.json").then((m) => m.default as Messages),
  zh: () => import("../../../messages/zh.json").then((m) => m.default as Messages),
  hi: () => import("../../../messages/hi.json").then((m) => m.default as Messages),
};

export async function loadMessages(locale: string | null | undefined): Promise<Messages> {
  const parsed = parseLocale(locale) ?? DEFAULT_LOCALE;
  try {
    return await loaders[parsed]();
  } catch {
    return en;
  }
}

function walk(source: unknown, parts: string[]): unknown {
  let cur: unknown = source;
  for (const part of parts) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function translate(
  messages: Messages,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const parts = key.split(".");
  const hit = walk(messages, parts);
  const fallback = walk(en, parts);
  let text =
    typeof hit === "string" ? hit : typeof fallback === "string" ? fallback : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function flattenMessageKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") return flattenMessageKeys(child, next);
    return [next];
  });
}

export { en as englishMessages };
