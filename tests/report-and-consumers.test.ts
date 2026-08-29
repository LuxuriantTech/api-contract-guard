import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { runCli } from "../src/cli.js";
import { baselineOrder, createCase, disclaimer, reportBytes } from "./helpers.js";

describe("AC1, AC9-AC11 reports, warnings, consumers and demo", () => {
  it("uses the exact disclaimer and deterministic bytes in distinct output directories", async () => {
    const first = await createCase("determinism-a", baselineOrder, baselineOrder);
    const second = await createCase("determinism-b", baselineOrder, baselineOrder);
    await expect(compare(first)).resolves.toMatchObject({ exitCode: 0, report: { disclaimer, findings: [] } });
    await expect(compare(second)).resolves.toMatchObject({ exitCode: 0, report: { disclaimer, findings: [] } });
    expect(await reportBytes(first.root, first.outDir)).toEqual(await reportBytes(second.root, second.outDir));
  });
  it("emits the exact closed warning list with exact locations", async () => {
    const baseline = "openapi: 3.1.0\ninfo: {title: ignored}\npaths:\n  /warn:\n    get:\n      parameters: [{name: trace, in: path, required: true, schema: {type: string}}]\n      responses: {'200': {description: ok, content: {text/plain: {schema: {type: string}}}}}\n    post:\n      requestBody: {required: false, content: {application/json: {schema: {type: object, title: ignored}}}}\n      responses: {'200': {description: ok}}\n  /new:\n    post:\n      responses: {'200': {description: ok}}\n";
    const candidate = baseline.replace("required: false", "required: true").replace("  /new:\n    post:\n      responses", "  /new:\n    post:\n      requestBody: {required: true, content: {application/json: {schema: {type: object}}}}\n      responses");
    await expect(compare(await createCase("warnings", baseline, candidate))).resolves.toMatchObject({ exitCode: 0, report: { warnings: [
      { code: "IGNORED_OPENAPI_SURFACE", location: "/info", message: "ignored OpenAPI surface" },
      { code: "NEW_REQUEST_BODY", location: "/paths/~1new/post/requestBody", message: "new request body" },
      { code: "IGNORED_PARAMETER_LOCATION", location: "/paths/~1warn/get/parameters/0", message: "ignored path parameter" },
      { code: "IGNORED_MEDIA_TYPE", location: "/paths/~1warn/get/responses/200/content/text~1plain", message: "ignored media type" },
      { code: "IGNORED_SCHEMA_KEYWORD", location: "/paths/~1warn/post/requestBody/content/application~1json/schema/title", message: "ignored schema keyword: title" },
      { code: "REQUEST_BODY_REQUIRED_CHANGED", location: "/paths/~1warn/post/requestBody/required", message: "request body required flag changed" }
    ] } });
  });
  it("emits request-side ENUM_DOMAIN_UNBOUNDED only for a whole enum removal", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      parameters: [{name: state, in: query, schema: {type: string, enum: [pending, paid]}}]\n      responses: {'200': {description: ok}}\n";
    const candidate = baseline.replace(", enum: [pending, paid]", "");
    await expect(compare(await createCase("warning-enum-domain", baseline, candidate))).resolves.toMatchObject({ exitCode: 0, report: { warnings: [{ code: "ENUM_DOMAIN_UNBOUNDED", location: "/paths/~1orders/get/parameters/0/schema", message: "request enum domain removed" }] } });
  });
  it("renders the required neutral manual-review banner when warnings exist", async () => {
    const yaml = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses: {'200': {description: ok, content: {text/plain: {schema: {type: string}}}}}\n";
    const input = await createCase("warning-banner", yaml, yaml);
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 0, report: { warnings: [{ code: "IGNORED_MEDIA_TYPE" }] } });
    await expect(readFile(join(input.root, input.outDir, "report.html"), "utf8")).resolves.toContain("Warnings require manual review");
  });
  it("rejects an unallowlisted reachable warning near miss", async () => {
    const yaml = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: object\n                discriminator:\n                  propertyName: kind\n";
    await expect(compare(await createCase("warning-near-miss", yaml, yaml))).resolves.toMatchObject({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED" });
  });
  it("annotates a matching synthetic consumer without suppressing the operation finding", async () => {
    const baseline = baselineOrder;
    const candidate = "openapi: 3.1.0\npaths: {}\n";
    const consumers = "version: 1\nconsumers:\n  - id: synthetic-shop-web\n    operations: [{method: get, path: /orders}]\n";
    const input = await createCase("consumer", baseline, candidate, { "consumers.yaml": consumers });
    await expect(compare({ ...input, consumers: "consumers.yaml" })).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "OPERATION_REMOVED", consumerIds: ["synthetic-shop-web"] }] } });
  });
  it("rejects a synthetic consumer operation missing from baseline", async () => {
    const consumers = "version: 1\nconsumers:\n  - id: synthetic-nope\n    operations: [{method: get, path: /missing}]\n";
    const input = await createCase("consumer-invalid", baselineOrder, baselineOrder, { "consumers.yaml": consumers });
    await expect(compare({ ...input, consumers: "consumers.yaml" })).resolves.toMatchObject({ exitCode: 3, errorCode: "CONSUMER_INVALID" });
  });
  it("escapes hostile removed-path finding text without active HTML", async () => {
    const hostilePath = "/</style><svg onload=alert(1)>";
    const baseline = `openapi: 3.1.0\npaths:\n  '${hostilePath}':\n    get:\n      responses: {'200': {description: ok}}\n`;
    const input = await createCase("html", baseline, "openapi: 3.1.0\npaths: {}\n");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ path: hostilePath }] } });
    const html = await readFile(join(input.root, input.outDir, "report.html"), "utf8");
    expect(html).toContain("&lt;/style&gt;&lt;svg onload=alert(1)&gt;");
    expect(html).not.toMatch(/<script|<svg|<style[^>]*>.*<svg/s);
  });
  it("makes the CLI write no reports and only static stderr for invalid hostile input", async () => {
    const hostile = "openapi: 3.1.0\npaths: {}\n'/tmp/\u001b[31msecret\u202e\r': [unterminated\n";
    const input = await createCase("stderr", hostile, hostile);
    const io = { stdout: "", stderr: "" };
    await expect(runCli(["compare", "--root", input.root, "--baseline", input.baseline, "--candidate", input.candidate, "--out-dir", input.outDir], io)).resolves.toBe(3);
    expect(io).toEqual({ stdout: "", stderr: "ERROR DOCUMENT_INVALID\n" });
    await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
    await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
  });
  it("reads the versioned synthetic Shop API demo fixture contract", async () => {
    const baseline = await readFile(new URL("./fixtures/demo/shop-api-baseline.yaml", import.meta.url), "utf8");
    const candidate = await readFile(new URL("./fixtures/demo/shop-api-candidate.yaml", import.meta.url), "utf8");
    const consumers = await readFile(new URL("./fixtures/demo/synthetic-consumers.yaml", import.meta.url), "utf8");
    const input = await createCase("demo", baseline, candidate, { "synthetic-consumers.yaml": consumers });
    await expect(compare({ ...input, consumers: "synthetic-consumers.yaml" })).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "OPERATION_REMOVED", method: "get", path: "/orders", consumerIds: ["synthetic-shop-web"] }] } });
  });
});
