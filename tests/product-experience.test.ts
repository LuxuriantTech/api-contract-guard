import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

async function htmlFor(name: string, baseline: string, candidate: string): Promise<string> {
  const input = await createCase(name, baseline, candidate);
  await expect(compare(input)).resolves.not.toMatchObject({ exitCode: 3 });
  return readFile(join(input.root, input.outDir, "report.html"), "utf8");
}

describe("W55 report experience", () => {
  it("renders the no-findings state as a semantic narrow document", async () => {
    const html = await htmlFor("product-empty", "openapi: 3.1.0\npaths: {}\n", "openapi: 3.1.0\npaths: {}\n");
    expect(html).toContain("<main>");
    expect(html).toContain("<h1>API Contract Guard</h1>");
    expect(html).toContain("No supported breaking changes detected.");
    expect(html).toContain("Supported rules");
    expect(html).toContain("No supported breaking changes were found.");
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toContain("max-width:72rem");
    expect(html).not.toMatch(/<pre|<script|<form|https?:|\s(?:src|href|action)=/u);
  });

  it("makes warnings visible without inventing findings", async () => {
    const api = "openapi: 3.1.0\ninfo: {title: synthetic}\npaths: {}\n";
    const html = await htmlFor("product-warning", api, api);
    expect(html).toContain("Warnings require manual review");
    expect(html).toContain("IGNORED_OPENAPI_SURFACE");
    expect(html).toContain("No supported breaking changes were found.");
  });

  it("renders escaped findings in a table with no dynamic markup", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  '/<hostile>':\n    get:\n      responses: { '200': {description: ok} }\n";
    const html = await htmlFor("product-finding", baseline, "openapi: 3.1.0\npaths: {}\n");
    expect(html).toContain("Supported breaking changes");
    expect(html).toContain("<table>");
    expect(html).toContain("OPERATION_REMOVED");
    expect(html).toContain("/&lt;hostile&gt;");
    expect(html).not.toContain("/<hostile>");
    expect(html).not.toMatch(/<img|<svg|\son\w+=|javascript:/iu);
  });
});
