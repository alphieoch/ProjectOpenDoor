import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  DOCS_EXAMPLE_MODEL,
  PRODUCTION_GATEWAY_URL,
  interpolateDocsBody,
  knownDocHrefs,
  loadDocsConfig,
  loadDocPage,
  resolveDocSlug,
} from "./docs-content";

describe("docs interpolation", () => {
  test("substitutes gateway, app, and example model tokens", () => {
    const out = interpolateDocsBody(
      "curl {{GATEWAY_URL}}/v1/chat/completions {{APP_URL}} {{EXAMPLE_MODEL}}",
      {
        gatewayUrl: "https://opendoor-gateway-u5ojp4qjiq-uc.a.run.app",
        appUrl: "https://opendoor-gcp.web.app",
        exampleModel: "gemma-4-26b-a4b-it",
      },
    );
    expect(out).toBe(
      "curl https://opendoor-gateway-u5ojp4qjiq-uc.a.run.app/v1/chat/completions https://opendoor-gcp.web.app gemma-4-26b-a4b-it",
    );
    expect(out).not.toContain("{{");
  });

  test("defaults to the hosted Cloud Run URL when env is unset", () => {
    const out = interpolateDocsBody("{{GATEWAY_URL}}", {
      gatewayUrl: PRODUCTION_GATEWAY_URL,
      exampleModel: DOCS_EXAMPLE_MODEL,
    });
    expect(out).toBe(PRODUCTION_GATEWAY_URL);
  });
});

describe("docs catalog", () => {
  test("pinned Use the API pages resolve to real articles", () => {
    const config = loadDocsConfig();
    expect(config.pinned?.map((p) => p.title)).toEqual([
      "Get started",
      "API keys",
      "Chat",
      "Models",
      "Errors",
      "JavaScript SDK",
      "Python SDK",
      "Search",
      "OpenBot / Agents",
    ]);
    for (const page of config.pinned ?? []) {
      const slug = page.href === "/" ? [] : page.href.replace(/^\//, "").split("/");
      expect(loadDocPage(slug)?.href).toBe(page.href);
    }
  });

  test("/docs/api and /api-reference land on the API overview", () => {
    expect(resolveDocSlug(["api"])).toEqual(["api"]);
    expect(resolveDocSlug(["api-reference"])).toEqual(["api"]);
    expect(knownDocHrefs().has("/api")).toBe(true);
    expect(knownDocHrefs().has("/api-reference/errors")).toBe(true);
    expect(knownDocHrefs().has("/getting-started/python")).toBe(true);
  });

  test("search docs state Vertex grounding and $0.10 / query", () => {
    const page = loadDocPage(["api-reference", "web-search"]);
    expect(page?.body).toContain("/v1/plugins/web-search");
    expect(page?.body).toContain("$0.10");
    expect(page?.body).toContain("vertex_google_search");
    expect(page?.body).toContain("Enterprise");
    expect(page?.body).not.toContain("Tavily");
  });

  test("get-started page interpolates a callable chat path", () => {
    const page = loadDocPage([]);
    expect(page?.body).toContain("/v1/chat/completions");
    expect(page?.body).toContain("OPENDOOR_API_KEY");
    expect(page?.body).toContain("/dashboard/api-keys");
    expect(page?.body).not.toContain("{{GATEWAY_URL}}");
    expect(page?.body).not.toContain("coming soon");
  });

  test("docs client pages do not import rag-search", () => {
    const root = join(import.meta.dir, "..");
    const files = [
      "components/docs-nav.tsx",
      "components/docs-markdown.tsx",
      "app/docs/[[...slug]]/page.tsx",
      "app/docs/layout.tsx",
      "lib/docs-content.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toContain("rag-search");
    }
  });
});
