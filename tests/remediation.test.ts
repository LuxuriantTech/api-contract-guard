import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { baselineOrder, createCase, reportBytes } from "./helpers.js";

function rootWithPathRefs(count: number, directory: string): string {
  return `openapi: 3.1.0\npaths:\n${Array.from({ length: count }, (_, index) => `  /p${index}: {$ref: './${directory}/${index}.yaml#/Operation'}`).join("\n")}\n`;
}

function rootWithRepeatedPathRefs(count: number): string {
  return `openapi: 3.1.0\npaths:\n${Array.from({ length: count }, (_, index) => `  /p${index}: {$ref: './shared.yaml#/Operation'}`).join("\n")}\n`;
}

function matchedResolutionRoots(): { baseline: string; candidate: string; files: Record<string, string> } {
  const shared = Array.from({ length: 2047 }, (_, index) => `  /p${index}: {$ref: './shared.yaml#/Operation'}`).join("\n");
  return {
    baseline: `openapi: 3.1.0\npaths:\n${shared}\n  /special: {$ref: './baseline-special.yaml#/Operation'}\n`,
    candidate: `openapi: 3.1.0\npaths:\n${shared}\n  /special: {$ref: './candidate-special.yaml#/Operation'}\n`,
    files: {
      "shared.yaml": "Operation: {get: {responses: {'200': {description: ok}}}}\n",
      "baseline-special.yaml": "Operation: {get: {responses: {'200': {description: ok, content: {application/json: {schema: {type: string}}}}}}}\n",
      "candidate-special.yaml": "Operation: {get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: './schema.yaml#/Value'}}}}}}}\n",
      "schema.yaml": "Value: {type: string}\n"
    }
  };
}

function padYamlToBytes(base: string, target: number): string {
  return `${base}# ${"x".repeat(target - Buffer.byteLength(base) - 3)}\n`;
}

function nestedPointerJson(tokens: string[]): string {
  let value: Record<string, unknown> = { type: "string" };
  for (let i = tokens.length - 1; i >= 0; i -= 1) value = { [tokens[i]!]: value };
  return `${JSON.stringify(value)}\n`;
}

describe("reviewer remediation: reachable surface and deterministic boundaries", () => {
  it("reports a required cookie parameter with its exact method, path and pointer", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /cart:\n    get:\n      responses: {'200': {description: ok}}\n";
    const candidate = baseline.replace("responses:", "parameters: [{name: cart_session, in: cookie, required: true, schema: {type: string}}]\n      responses:");
    await expect(compare(await createCase("cookie", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "REQUIRED_PARAMETER_ADDED", method: "get", path: "/cart", pointer: "/paths/~1cart/get/parameters/0", message: "required cookie parameter added: cart_session" }] } });
  });

  it("detects nested request items and response items with exact pointers", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /cart:\n    post:\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: array\n              items:\n                type: object\n                properties: {sku: {type: string}}\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: array\n                items:\n                  type: object\n                  required: [sku]\n                  properties: {sku: {type: string}}\n";
    const candidate = "openapi: 3.1.0\npaths:\n  /cart:\n    post:\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: array\n              items:\n                type: object\n                required: [sku]\n                properties: {sku: {type: string}}\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: array\n                items:\n                  type: object\n                  required: []\n                  properties: {sku: {type: string}}\n";
    await expect(compare(await createCase("nested-items", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [
      { ruleId: "REQUEST_REQUIRED_PROPERTY_ADDED", pointer: "/paths/~1cart/post/requestBody/content/application~1json/schema/items/properties/sku" },
      { ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", pointer: "/paths/~1cart/post/responses/200/content/application~1json/schema/items/properties/sku" }
    ] } });
  });

  it("treats missing candidate response, media type, and schema as removed baseline response properties", async () => {
    const baseline = baselineOrder;
    const withoutResponse = baseline.replace("responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: object\n                required: [id, status]\n                properties:\n                  id: { type: string }\n                  status: { type: string }", "responses: {}");
    const withoutMedia = baseline.replace("application/json:", "text/plain:");
    const withoutSchema = baseline.replace("schema:\n                type: object\n                required: [id, status]\n                properties:\n                  id: { type: string }\n                  status: { type: string }", "schema: {}");
    for (const candidate of [withoutResponse, withoutMedia, withoutSchema]) {
      await expect(compare(await createCase("missing-response-surface", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [
        { ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/responses/200/content/application~1json/schema/properties/id" },
        { ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/responses/200/content/application~1json/schema/properties/status" }
      ] } });
    }
  });

  it("proves inline and local-ref fixtures have equal verdict, findings, warnings and summary", async () => {
    const inline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema: {type: object, required: [id], properties: {id: {type: string}}}\n";
    const inlineCandidate = inline.replace("required: [id]", "required: []");
    const ref = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema: {$ref: './schema.yaml#/Order'}\n";
    const refCandidate = ref.replace("./schema.yaml", "./candidate-schema.yaml");
    const inlineResult = await compare(await createCase("inline-equivalence", inline, inlineCandidate));
    expect(inlineResult).toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/responses/200/content/application~1json/schema/properties/id" }] } });
    const refInput = await createCase("ref-equivalence", ref, refCandidate, {
      "schema.yaml": "Order: {type: object, required: [id], properties: {id: {type: string}}}\n",
      "candidate-schema.yaml": "Order: {type: object, required: [], properties: {id: {type: string}}}\n"
    });
    const refResult = await compare(refInput);
    expect(refResult).toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/responses/200/content/application~1json/schema/properties/id" }] } });
    expect(refResult).toMatchObject({ exitCode: inlineResult.exitCode, report: { findings: inlineResult.report?.findings, warnings: inlineResult.report?.warnings, summary: inlineResult.report?.summary } });
  });

  it("rejects actual file, total-size, file-count, resolution, chain, pointer-token and schema-depth limits", async () => {
    const rootYaml = "openapi: 3.1.0\npaths: {}\n";
    const fileOverOneMiB = `${rootYaml}payload: ${"x".repeat(1_048_577)}\n`;
    const subOneMiBOperation = `Operation: {get: {responses: {'200': {description: ok}}}}\n# ${"x".repeat(940_000)}\n`;
    const pointerOver = `./schema.yaml#/${"a/".repeat(1_025)}a`;
    const tokenOver = `./schema.yaml#/${Array.from({ length: 129 }, (_, index) => `p${index}`).join("/")}`;
    const deepSchema = `openapi: 3.1.0\npaths:\n  /x:\n    post:\n      requestBody: {content: {application/json: {schema: ${"{type: array, items: ".repeat(33)}{type: string}${"}".repeat(33)}}}}\n      responses: {'200': {description: ok}}\n`;
    const cases = [
      createCase("file-over-one-mib", fileOverOneMiB, fileOverOneMiB),
      createCase("total-over-eight-mib", rootWithPathRefs(9, "total"), rootWithPathRefs(9, "total"), Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`total/${index}.yaml`, subOneMiBOperation]))),
      createCase("129-identities", rootWithPathRefs(127, "many"), rootWithPathRefs(127, "many"), Object.fromEntries(Array.from({ length: 127 }, (_, index) => [`many/${index}.yaml`, "Operation: {get: {responses: {'200': {description: ok}}}}\n"]))),
      createCase("4097-resolutions", matchedResolutionRoots().baseline, matchedResolutionRoots().candidate, matchedResolutionRoots().files),
      createCase("33-chain", "openapi: 3.1.0\npaths:\n  /x:\n    get:\n      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: './chain/0.yaml#/Leaf'}}}}}\n", "openapi: 3.1.0\npaths:\n  /x:\n    get:\n      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: './chain/0.yaml#/Leaf'}}}}}\n", Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`chain/${index}.yaml`, index === 32 ? "Leaf: {type: string}\n" : `Leaf: {$ref: './${index + 1}.yaml#/Leaf'}\n`]))),
      createCase("pointer-over", `openapi: 3.1.0\npaths:\n  /x:\n    get:\n      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${pointerOver}'}}}}}\n`, `openapi: 3.1.0\npaths:\n  /x:\n    get:\n      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${pointerOver}'}}}}}\n`, { "schema.yaml": "a: {type: string}\n" }),
      createCase("token-over", `openapi: 3.1.0\npaths:\n  /x:\n    get:\n      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${tokenOver}'}}}}}\n`, `openapi: 3.1.0\npaths:\n  /x:\n    get:\n      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${tokenOver}'}}}}}\n`, { "schema.yaml": "p0: {type: string}\n" }),
      createCase("schema-depth-33", deepSchema, deepSchema)
    ];
    for (const input of await Promise.all(cases)) await expect(compare(input)).resolves.toMatchObject({ exitCode: 3, errorCode: "INPUT_LIMIT", report: undefined });
  });

  it("preserves an output collision sentinel and emits neither JSON nor HTML on exit 3", async () => {
    const input = await createCase("collision-sentinel", baselineOrder, baselineOrder);
    await mkdir(join(input.root, input.outDir));
    await writeFile(join(input.root, input.outDir, "sentinel.txt"), "unchanged", "utf8");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 3, errorCode: "OUTPUT_INVALID", report: undefined });
    await expect(readFile(join(input.root, input.outDir, "sentinel.txt"), "utf8")).resolves.toBe("unchanged");
    await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
    await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
  });

  it("causally enforces report tuple sorting and excludes CR, timestamps and temporary paths", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /z:\n    get: {responses: {'200': {description: ok}}}\n  /é:\n    get: {responses: {'200': {description: ok}}}\n  /😀:\n    get: {responses: {'200': {description: ok}}}\n";
    const input = await createCase("report-order", baseline, "openapi: 3.1.0\npaths: {}\n");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ method: "get", path: "/z" }, { method: "get", path: "/é" }, { method: "get", path: "/😀" }] } });
    const [json, html] = await reportBytes(input.root, input.outDir);
    for (const artifact of [json.toString("utf8"), html.toString("utf8")]) {
      expect(artifact).not.toContain("\r");
      expect(artifact).not.toContain(input.root);
      expect(artifact).not.toMatch(/20\d\d-[01]\d-[0-3]\dT/);
      expect(artifact.endsWith("\n")).toBe(true);
    }
  });

  it("orders Unicode warnings, consumer IDs and report maps by code unit", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /z:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            text/plain:\n              schema: {type: string}\n  /é:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            text/plain:\n              schema: {type: string}\n  /😀:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            text/plain:\n              schema: {type: string}\n  /removed:\n    get:\n      responses:\n        '200': {description: ok}\n";
    const candidate = baseline.replace("  /removed:\n    get:\n      responses:\n        '200': {description: ok}\n", "");
    const consumers = "version: 1\nconsumers:\n  - {id: z, operations: [{method: get, path: /z}]}\n  - {id: é, operations: [{method: get, path: /z}]}\n  - {id: 😀, operations: [{method: get, path: /z}]}\n";
    const manifest = consumers.replaceAll("path: /z", "path: /removed");
    const input = await createCase("unicode-collections", baseline, candidate, { "é.yaml": baseline, "😀.yaml": candidate, "z.yaml": manifest });
    const result = await compare({ ...input, baseline: "é.yaml", candidate: "😀.yaml", consumers: "z.yaml" });
    expect(result).toMatchObject({ exitCode: 2, report: {
      warnings: [{ location: "/paths/~1z/get/responses/200/content/text~1plain" }, { location: "/paths/~1é/get/responses/200/content/text~1plain" }, { location: "/paths/~1😀/get/responses/200/content/text~1plain" }],
      findings: [{ ruleId: "OPERATION_REMOVED", path: "/removed", consumerIds: ["z", "é", "😀"] }],
      supportedRules: ["ENUM_VALUE_REMOVED", "OPERATION_REMOVED", "REQUIRED_PARAMETER_ADDED", "REQUEST_REQUIRED_PROPERTY_ADDED", "RESPONSE_REQUIRED_PROPERTY_REMOVED"]
    } });
    expect(Object.keys(result.report!.inputSha256)).toEqual(["z.yaml", "é.yaml", "😀.yaml"]);
    expect(Object.keys(result.report!.summary)).toEqual(["ENUM_VALUE_REMOVED", "OPERATION_REMOVED", "REQUIRED_PARAMETER_ADDED", "REQUEST_REQUIRED_PROPERTY_ADDED", "RESPONSE_REQUIRED_PROPERTY_REMOVED"]);
  });

  it("accepts inclusive size, identity, resolution, chain, pointer, token and schema-depth boundaries", async () => {
    const exactMiB = `openapi: 3.1.0\npaths: {}\n# ${"x".repeat(1_048_576 - 28)}\n`;
    const exactPointer = `./schema.yaml#/${"a".repeat(2047)}`;
    const tokenParts = Array.from({ length: 128 }, (_, index) => `p${index}`);
    expect(tokenParts).toHaveLength(128);
    const exactTokens = `./schema.yaml#/${tokenParts.join("/")}`;
    const totalRoot = rootWithPathRefs(8, "total-boundary");
    const totalRemaining = 8 * 1024 * 1024 - 2 * Buffer.byteLength(totalRoot);
    const totalTargets = Array.from({ length: 8 }, (_, index) => Math.floor(totalRemaining / 8) + (index < totalRemaining % 8 ? 1 : 0));
    const operation = "Operation: {get: {responses: {'200': {description: ok}}}}\n";
    expect(2048 + 2048 + 1).toBe(4097);
    expect(totalTargets.every((target) => target <= 1024 * 1024)).toBe(true);
    expect(2 * Buffer.byteLength(totalRoot) + totalTargets.reduce((sum, target) => sum + target, 0)).toBe(8 * 1024 * 1024);
    const deep32 = `openapi: 3.1.0\npaths:\n  /x:\n    post:\n      requestBody: {content: {application/json: {schema: ${"{type: array, items: ".repeat(32)}{type: string}${"}".repeat(32)}}}}\n      responses: {'200': {description: ok}}\n`;
    const cases = [
      createCase("inclusive-one-mib", exactMiB, exactMiB),
      createCase("inclusive-eight-mib-total", totalRoot, totalRoot, Object.fromEntries(totalTargets.map((target, index) => [`total-boundary/${index}.yaml`, padYamlToBytes(operation, target)]))),
      createCase("inclusive-128-identities", rootWithPathRefs(126, "ids"), rootWithPathRefs(126, "ids"), Object.fromEntries(Array.from({ length: 126 }, (_, index) => [`ids/${index}.yaml`, "Operation: {get: {responses: {'200': {description: ok}}}}\n"]))),
      createCase("inclusive-4096-resolutions", rootWithRepeatedPathRefs(2048), rootWithRepeatedPathRefs(2048), { "shared.yaml": "Operation: {get: {responses: {'200': {description: ok}}}}\n" }),
      createCase("inclusive-pointer", `openapi: 3.1.0\npaths:\n  /x:\n    get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${exactPointer}'}}}}}}\n`, `openapi: 3.1.0\npaths:\n  /x:\n    get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${exactPointer}'}}}}}}\n`, { "schema.yaml": `${JSON.stringify({ ["a".repeat(2047)]: { type: "string" } })}\n` }),
      createCase("inclusive-tokens", `openapi: 3.1.0\npaths:\n  /x:\n    get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${exactTokens}'}}}}}}\n`, `openapi: 3.1.0\npaths:\n  /x:\n    get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: '${exactTokens}'}}}}}}\n`, { "schema.yaml": nestedPointerJson(tokenParts) }),
      createCase("inclusive-chain-32", "openapi: 3.1.0\npaths:\n  /x:\n    get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: './chain/0.yaml#/Leaf'}}}}}}\n", "openapi: 3.1.0\npaths:\n  /x:\n    get: {responses: {'200': {description: ok, content: {application/json: {schema: {$ref: './chain/0.yaml#/Leaf'}}}}}}\n", Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`chain/${index}.yaml`, index === 31 ? "Leaf: {type: string}\n" : `Leaf: {$ref: './${index + 1}.yaml#/Leaf'}\n`]))),
      createCase("inclusive-schema-depth", deep32, deep32)
    ];
    for (const input of await Promise.all(cases)) await expect(compare(input)).resolves.toMatchObject({ exitCode: 0 });
  });
});
