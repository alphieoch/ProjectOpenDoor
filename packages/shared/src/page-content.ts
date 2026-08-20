/**
 * First-party page extract for OpenDoor Search / OpenBot.
 * GOOD = article-like text. BAD = skip-links, cookie chrome, social dumps.
 */

export type PageQuality = "GOOD" | "BAD";

export type ExtractedPage = {
  quality: PageQuality;
  title: string;
  text: string;
  snippet: string;
  reason?: string;
};

export const PAGE_CONTENT = {
  minGoodChars: 220,
  maxTextChars: 8_000,
  snippetChars: 280,
} as const;

const SKIP_LINE =
  /skip to (content|footer|main|navigation|results)|cookie (policy|settings|preferences)|accept all|reject all|manage cookies|we use cookies|privacy policy|terms of (use|service)|all rights reserved/i;

const CHROME_LINE =
  /^(home|tickets|menu|search|login|sign in|sign up|subscribe|follow us|share|close|back)$/i;

const SOCIAL =
  /^(twitter|x|facebook|instagram|youtube|tiktok|linkedin|pinterest|whatsapp|snapchat)$/i;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripBlocks(html: string, tag: string) {
  return html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
}

function innerMatch(html: string, re: RegExp): string {
  const match = html.match(re);
  return match?.[1] || "";
}

function hostnameTitle(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function collapse(text: string) {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function visibleText(html: string): string {
  const without = stripBlocks(
    stripBlocks(stripBlocks(stripBlocks(html, "script"), "style"), "noscript"),
    "svg",
  )
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|aside|form|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return collapse(decodeEntities(without));
}

function dropChrome(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.length < 3) return false;
      if (SKIP_LINE.test(line)) return false;
      if (CHROME_LINE.test(line)) return false;
      if (SOCIAL.test(line)) return false;
      return true;
    })
    .join("\n");
}

function chromeRatio(raw: string, cleaned: string): number {
  const rawLen = raw.replace(/\s+/g, " ").trim().length;
  if (rawLen <= 0) return 1;
  const lost = rawLen - cleaned.replace(/\s+/g, " ").trim().length;
  return lost / rawLen;
}

function sentenceCount(text: string): number {
  return (text.match(/[.!?]["']?\s+[A-Z0-9]/g) || []).length + (text.includes(".") ? 1 : 0);
}

export function extractPageContent(html: string, url?: string): ExtractedPage {
  const source = typeof html === "string" ? html : "";
  const title =
    visibleText(innerMatch(source, /<title[^>]*>([\s\S]*?)<\/title>/i)).slice(0, 180) ||
    visibleText(innerMatch(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i)).slice(0, 180) ||
    hostnameTitle(url);

  const main =
    innerMatch(source, /<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    innerMatch(source, /<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    innerMatch(source, /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i) ||
    source;

  const rawVisible = visibleText(main || source);
  const text = dropChrome(rawVisible).slice(0, PAGE_CONTENT.maxTextChars);
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, PAGE_CONTENT.snippetChars);
  const chars = text.replace(/\s+/g, " ").trim().length;
  const ratio = chromeRatio(rawVisible, text);

  if (!chars) {
    return { quality: "BAD", title, text: "", snippet: "", reason: "empty" };
  }
  if (SKIP_LINE.test(text) && chars < PAGE_CONTENT.minGoodChars * 2) {
    return { quality: "BAD", title, text, snippet, reason: "skip_chrome" };
  }
  if (chars < PAGE_CONTENT.minGoodChars) {
    return { quality: "BAD", title, text, snippet, reason: "too_short" };
  }
  if (ratio > 0.72 && sentenceCount(text) < 2) {
    return { quality: "BAD", title, text, snippet, reason: "chrome_heavy" };
  }

  return { quality: "GOOD", title, text, snippet };
}

export function isGoodPage(page: ExtractedPage): boolean {
  return page.quality === "GOOD" && page.text.trim().length >= PAGE_CONTENT.minGoodChars;
}
