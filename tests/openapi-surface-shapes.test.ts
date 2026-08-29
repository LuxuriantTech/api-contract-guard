import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const valid = "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      responses: { '200': {description: ok} }\n";

async function expectUnsupported(name: string, baseline: string, candidate = baseline, files?: Record<string, string>): Promise<void> {
  const input = await createCase(name, baseline, candidate, files);
  await expect(compare(input)).resolves.toEqual({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
  await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
}

describe("W58 OpenAPI surface shapes", () => {
  it.each([
    ["baseline", "openapi: 3.1.0\npaths: []\n", valid],
    ["candidate", valid, "openapi: 3.1.0\npaths: []\n"],
  ])("rejects non-record paths on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`paths-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe: scalar\n", valid],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe: scalar\n"],
  ])("rejects direct non-record path items on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`path-item-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    get: scalar\n", valid],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe:\n    get: scalar\n"],
  ])("rejects non-record operations on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`operation-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    get: {$ref: '#/components/operations/Probe'}\ncomponents:\n  operations:\n    Probe: {responses: { '200': {description: ok} }}\n", valid],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe:\n    get: {$ref: '#/components/operations/Probe'}\ncomponents:\n  operations:\n    Probe: {responses: { '200': {description: ok} }}\n"],
  ])("rejects operation references on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`operation-ref-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe: {$ref: './scalar.yaml#/value'}\n", valid, { "scalar.yaml": "value: scalar\n" }],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe: {$ref: './scalar.yaml#/value'}\n", { "scalar.yaml": "value: scalar\n" }],
  ])("rejects path item references resolving to scalars on the %s side", async (_side, baseline, candidate, files) => {
    await expectUnsupported(`path-item-ref-${_side}`, baseline, candidate, files);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      parameters: [{name: state, in: query, content: {application/json: {schema: {type: string, enum: [open, closed]}}}}]\n      responses: { '200': {description: ok} }\n", valid],
    ["candidate", valid, "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      parameters: [{name: state, in: query, content: {application/json: {schema: {type: string, enum: [closed]}}}}]\n      responses: { '200': {description: ok} }\n"],
  ])("rejects unsupported Parameter.content on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`parameter-content-${_side}`, baseline, candidate);
  });
});
import { readFile } from "node:fs/promises";
import { join } from "node:path";
