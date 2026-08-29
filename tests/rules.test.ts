import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { baselineOrder, createCase } from "./helpers.js";

describe("AC2-AC6 supported rule fixtures", () => {
  it("reports OPERATION_REMOVED at the removed method pointer", async () => {
    const input = await createCase("operation", baselineOrder, "openapi: 3.1.0\npaths: {}\n");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "OPERATION_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get", message: "operation removed", consumerIds: [] }] } });
  });
  it("reports added required query parameter with exact location", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses: {'200': {description: ok}}\n";
    const candidate = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      parameters:\n        - {name: page, in: query, required: true, schema: {type: integer}}\n      responses: {'200': {description: ok}}\n";
    await expect(compare(await createCase("query", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "REQUIRED_PARAMETER_ADDED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/parameters/0", message: "required query parameter added: page" }] } });
    const referencedBaseline = "openapi: 3.1.0\npaths:\n  /orders: {$ref: './baseline-path.yaml'}\n";
    const referencedCandidate = "openapi: 3.1.0\npaths:\n  /orders: {$ref: './candidate-path.yaml'}\n";
    const referenced = await compare(await createCase("query-path-ref", referencedBaseline, referencedCandidate, {
      "baseline-path.yaml": "get:\n  parameters: [{name: page, in: query, required: false, schema: {type: integer}}]\n  responses: {'200': {description: ok}}\n",
      "candidate-path.yaml": "get:\n  parameters: [{name: page, in: query, required: true, schema: {type: integer}}]\n  responses: {'200': {description: ok}}\n",
    }));
    expect(referenced).toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "REQUIRED_PARAMETER_ADDED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/parameters/0", message: "required query parameter added: page" }] } });
    expect(referenced.report?.findings.filter((finding) => finding.ruleId === "REQUIRED_PARAMETER_ADDED")).toHaveLength(1);
  });
  it("uses operation override and case-insensitive header identity", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    parameters: [{name: X-Trace, in: header, required: false, schema: {type: string}}]\n    get: {responses: {'200': {description: ok}}}\n";
    const candidate = "openapi: 3.1.0\npaths:\n  /orders:\n    parameters: [{name: X-Trace, in: header, required: false, schema: {type: string}}]\n    get:\n      parameters: [{name: x-trace, in: header, required: true, schema: {type: string}}]\n      responses: {'200': {description: ok}}\n";
    await expect(compare(await createCase("header", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "REQUIRED_PARAMETER_ADDED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/parameters/0", message: "required header parameter added: x-trace" }] } });
    const inlineBaseline = "openapi: 3.1.0\npaths:\n  /orders:\n    parameters: [{name: page, in: query, required: false, schema: {type: integer}}]\n    get: {responses: {'200': {description: ok}}}\n";
    const inlineCandidate = inlineBaseline.replace("required: false", "required: true");
    const inline = await compare(await createCase("path-inline", inlineBaseline, inlineCandidate));
    expect(inline.report?.findings.filter((finding) => finding.ruleId === "REQUIRED_PARAMETER_ADDED")).toEqual([{ ruleId: "REQUIRED_PARAMETER_ADDED", method: "get", path: "/orders", pointer: "/paths/~1orders/parameters/0", message: "required query parameter added: page", consumerIds: [] }]);
    const referencedPathParameter = "openapi: 3.1.0\npaths:\n  /orders: {$ref: './path-parameter.yaml'}\n";
    const pathParameter = await compare(await createCase("path-parameter-ref", referencedPathParameter, referencedPathParameter, {
      "path-parameter.yaml": "parameters: [{name: orderId, in: path, required: true, schema: {type: string}}]\nget: {responses: {'200': {description: ok}}}\n",
    }));
    expect(pathParameter).toMatchObject({ exitCode: 0, report: { findings: [], warnings: [{ code: "IGNORED_PARAMETER_LOCATION", location: "/paths/~1orders/parameters/0", message: "ignored path parameter" }] } });
    expect(pathParameter.report?.warnings).toHaveLength(1);
  });
  it("reports reachable required request property and ignores readOnly", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    post:\n      requestBody: {required: true, content: {application/json: {schema: {type: object, properties: {name: {type: string}}}}}}\n      responses: {'200': {description: ok}}\n";
    const candidate = "openapi: 3.1.0\npaths:\n  /orders:\n    post:\n      requestBody: {required: true, content: {application/json: {schema: {type: object, required: [customerId, serverId], properties: {name: {type: string}, customerId: {type: string}, serverId: {type: string, readOnly: true}}}}}}\n      responses: {'200': {description: ok}}\n";
    await expect(compare(await createCase("request", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "REQUEST_REQUIRED_PROPERTY_ADDED", method: "post", path: "/orders", pointer: "/paths/~1orders/post/requestBody/content/application~1json/schema/properties/customerId", message: "required request property added: customerId" }] } });
  });
  it("reports reachable response required-property removal and ignores writeOnly", async () => {
    const candidate = baselineOrder.replace("required: [id, status]", "required: [id]").replace("status: { type: string }", "status: { type: string, writeOnly: true }");
    await expect(compare(await createCase("response", baselineOrder, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/responses/200/content/application~1json/schema/properties/status", message: "required response property removed: status" }] } });
  });
  it("reports request-side enum value loss with exact value", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      parameters: [{name: state, in: query, schema: {type: string, enum: [pending, paid]}}]\n      responses: {'200': {description: ok}}\n";
    const candidate = baseline.replace("[pending, paid]", "[paid]");
    await expect(compare(await createCase("request-enum", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "ENUM_VALUE_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/parameters/0/schema/enum", message: "enum value removed: pending" }] } });
    const referencedBaseline = "openapi: 3.1.0\npaths:\n  /orders: {$ref: './baseline-enum-path.yaml'}\n";
    const referencedCandidate = "openapi: 3.1.0\npaths:\n  /orders: {$ref: './candidate-enum-path.yaml'}\n";
    const referenced = await compare(await createCase("enum-path-ref", referencedBaseline, referencedCandidate, {
      "baseline-enum-path.yaml": "get:\n  parameters: [{name: state, in: query, schema: {type: string, enum: [pending, paid]}}]\n  responses: {'200': {description: ok}}\n",
      "candidate-enum-path.yaml": "get:\n  parameters: [{name: state, in: query, schema: {type: string, enum: [paid]}}]\n  responses: {'200': {description: ok}}\n",
    }));
    expect(referenced).toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "ENUM_VALUE_REMOVED", method: "get", path: "/orders", pointer: "/paths/~1orders/get/parameters/0/schema/enum", message: "enum value removed: pending" }] } });
    expect(referenced.report?.findings.filter((finding) => finding.ruleId === "ENUM_VALUE_REMOVED")).toHaveLength(1);
    const unboundedCandidate = "openapi: 3.1.0\npaths:\n  /orders: {$ref: './candidate-unbounded-enum-path.yaml'}\n";
    const unbounded = await compare(await createCase("enum-path-ref-unbounded", referencedBaseline, unboundedCandidate, {
      "baseline-enum-path.yaml": "get:\n  parameters: [{name: state, in: query, schema: {type: string, enum: [pending, paid]}}]\n  responses: {'200': {description: ok}}\n",
      "candidate-unbounded-enum-path.yaml": "get:\n  parameters: [{name: state, in: query, schema: {type: string}}]\n  responses: {'200': {description: ok}}\n",
    }));
    expect(unbounded).toMatchObject({ exitCode: 0, report: { findings: [], warnings: [{ code: "ENUM_DOMAIN_UNBOUNDED", location: "/paths/~1orders/get/parameters/0/schema", message: "request enum domain removed" }] } });
    expect(unbounded.report?.warnings).toHaveLength(1);
  });
  it("rejects a response-side enum difference as CAPABILITY_UNSUPPORTED", async () => {
    const baseline = baselineOrder.replace("status: { type: string }", "status: { type: string, enum: [pending, paid] }");
    const candidate = baseline.replace("[pending, paid]", "[paid]");
    await expect(compare(await createCase("response-enum", baseline, candidate))).resolves.toMatchObject({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  });
  it("suppresses enum descendant when its request ancestor is removed", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    post:\n      requestBody: {required: true, content: {application/json: {schema: {type: object, properties: {payload: {type: object, properties: {state: {type: string, enum: [pending, paid]}}}}}}}}\n      responses: {'200': {description: ok}}\n";
    const candidate = baseline.replace("properties: {payload", "required: [payload], properties: {payload").replace("[pending, paid]", "[paid]");
    await expect(compare(await createCase("ancestor", baseline, candidate))).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "REQUEST_REQUIRED_PROPERTY_ADDED", method: "post", path: "/orders", pointer: "/paths/~1orders/post/requestBody/content/application~1json/schema/properties/payload", message: "required request property added: payload" }] } });
  });
});
