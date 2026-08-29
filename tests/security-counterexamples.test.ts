import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase, nodeYaml } from "./helpers.js";

const response = (schema: string) => `openapi: 3.1.0
paths:
  /orders:
    get:
      responses:
        '200': {description: ok, content: {application/json: {schema: ${schema}}}}
`;

describe("W45 security counterexamples", () => {
  it("does not report a request finding when only a response required property is added", async () => {
    const baseline = response("{type: object, properties: {id: {type: string}}}");
    const candidate = response("{type: object, required: [id], properties: {id: {type: string}}}");
    await expect(compare(await createCase("response-required-added", baseline, candidate))).resolves.toMatchObject({ exitCode: 0, report: { findings: [] } });
  });

  it("rejects a response enum value removal as unsupported", async () => {
    const baseline = response("{type: string, enum: [pending, paid]}");
    const candidate = response("{type: string, enum: [paid]}");
    await expect(compare(await createCase("response-enum-removed", baseline, candidate))).resolves.toMatchObject({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  });

  it("accepts a response enum whose same domain is reordered", async () => {
    const baseline = response("{type: string, enum: [pending, paid]}");
    const candidate = response("{type: string, enum: [paid, pending]}");
    await expect(compare(await createCase("response-enum-reordered", baseline, candidate))).resolves.toMatchObject({ exitCode: 0, report: { findings: [] } });
  });

  it("rejects OpenAPI 2.0 documents", async () => {
    const legacy = "openapi: 2.0.0\npaths: {}\n";
    await expect(compare(await createCase("openapi-two", legacy, legacy))).resolves.toMatchObject({ exitCode: 3, errorCode: "DOCUMENT_INVALID", report: undefined });
  });

  it("rejects oneOf on a schema reachable only from the candidate", async () => {
    const baseline = response("{type: object, properties: {id: {type: string}}}");
    const candidate = response("{type: object, properties: {id: {type: string}, extra: {oneOf: [{type: string}]}}}");
    await expect(compare(await createCase("candidate-oneof", baseline, candidate))).resolves.toMatchObject({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  });

  it("rejects non-finite YAML numbers", async () => {
    const invalid = "openapi: 3.1.0\npaths: {}\nprobe: .inf\n";
    await expect(compare(await createCase("non-finite", invalid, invalid))).resolves.toMatchObject({ exitCode: 3, errorCode: "DOCUMENT_INVALID", report: undefined });
  });

  it("enforces the node budget cumulatively across baseline and candidate", async () => {
    const within = nodeYaml(49_996);
    const over = nodeYaml(49_997);
    await expect(compare(await createCase("nodes-within", within, within))).resolves.toMatchObject({ exitCode: 0 });
    await expect(compare(await createCase("nodes-over", over, over))).resolves.toMatchObject({ exitCode: 3, errorCode: "INPUT_LIMIT", report: undefined });
  });

  it("rejects references with a non-http URI scheme", async () => {
    const invalid = response("{$ref: 'a1:local.yaml#/S'}");
    await expect(compare(await createCase("custom-scheme", invalid, invalid))).resolves.toMatchObject({ exitCode: 3, errorCode: "REF_INVALID", report: undefined });
  });

  it("rejects empty or duplicate consumer identifiers", async () => {
    const api = response("{type: string}");
    for (const consumers of [
      "version: 1\nconsumers:\n  - id: ''\n    operations: []\n",
      "version: 1\nconsumers:\n  - id: web\n    operations: []\n  - id: web\n    operations: []\n",
    ]) {
      const input = await createCase("consumer-identifiers", api, api, { "consumers.yaml": consumers });
      await expect(compare({ ...input, consumers: "consumers.yaml" })).resolves.toMatchObject({ exitCode: 3, errorCode: "CONSUMER_INVALID", report: undefined });
    }
  });
});
