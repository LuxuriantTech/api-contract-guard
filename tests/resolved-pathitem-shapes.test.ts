import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const valid = "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      responses: { '200': {description: ok} }\n";

async function expectUnsupported(name: string, baseline: string, candidate: string, files: Record<string, string>): Promise<void> {
  const input = await createCase(name, baseline, candidate, files);
  await expect(compare(input)).resolves.toEqual({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
  await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
}

describe("W60 resolved Path Item shapes", () => {
  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe: {$ref: './baseline-item.yaml#/Item'}\n", valid, { "baseline-item.yaml": "Item: {get: scalar}\n" }],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe: {$ref: './candidate-item.yaml#/Item'}\n", { "candidate-item.yaml": "Item: {get: scalar}\n" }],
  ])("rejects resolved scalar methods on the %s side", async (_side, baseline, candidate, files) => {
    await expectUnsupported(`resolved-method-scalar-${_side}`, baseline, candidate, files);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe: {$ref: './baseline-item.yaml#/Item'}\n", valid, { "baseline-item.yaml": "Item: {get: {$ref: '#/Operation'}, Operation: {responses: {'200': {description: ok}}}}\n" }],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe: {$ref: './candidate-item.yaml#/Item'}\n", { "candidate-item.yaml": "Item: {get: {$ref: '#/Operation'}, Operation: {responses: {'200': {description: ok}}}}\n" }],
  ])("rejects resolved operation references on the %s side", async (_side, baseline, candidate, files) => {
    await expectUnsupported(`resolved-operation-ref-${_side}`, baseline, candidate, files);
  });
});
