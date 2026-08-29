import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const validGet = "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      responses: { '200': {description: ok} }\n";
const validPost = "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      responses: { '200': {description: ok} }\n";

async function expectUnsupported(name: string, baseline: string, candidate = baseline): Promise<void> {
  const input = await createCase(name, baseline, candidate);
  await expect(compare(input)).resolves.toEqual({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
  await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
}

describe("W54 request and response surface shapes", () => {
  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      requestBody: []\n      responses: { '200': {description: ok} }\n", validPost],
    ["candidate", validPost, "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      requestBody: []\n      responses: { '200': {description: ok} }\n"],
  ])("rejects requestBody arrays on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`request-body-array-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      responses: []\n", validGet],
    ["candidate", validGet, "openapi: 3.1.0\npaths:\n  /probe:\n    get:\n      responses: []\n"],
  ])("rejects responses arrays on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`responses-array-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      requestBody: {content: []}\n      responses: { '200': {description: ok} }\n", validPost],
    ["candidate", validPost, "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      requestBody: {content: []}\n      responses: { '200': {description: ok} }\n"],
  ])("rejects non-record content on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`content-array-${_side}`, baseline, candidate);
  });

  it.each([
    ["baseline", "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      requestBody: {required: yes}\n      responses: { '200': {description: ok} }\n", validPost],
    ["candidate", validPost, "openapi: 3.1.0\npaths:\n  /probe:\n    post:\n      requestBody: {required: yes}\n      responses: { '200': {description: ok} }\n"],
  ])("rejects non-boolean requestBody.required on the %s side", async (_side, baseline, candidate) => {
    await expectUnsupported(`request-body-required-${_side}`, baseline, candidate);
  });
});
