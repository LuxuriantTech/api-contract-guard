import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const minimal = "openapi: 3.1.0\npaths: {}\n";

describe("runtime contract additions", () => {
  it.each([[[]], [["wrong"]], [["compare", "--root"]]])("returns exact CLI_USAGE for %j", async (args) => {
    const io = { stdout: "old", stderr: "old" };
    await expect(runCli(args, io)).resolves.toBe(3);
    expect(io).toEqual({ stdout: "", stderr: "ERROR CLI_USAGE\n" });
  });

  it("accepts --consumers and writes its successful report to stdout", async () => {
    const input = await createCase("cli-consumers", minimal, minimal, { "consumers.yaml": "version: 1\nconsumers: []\n" });
    const io = { stdout: "", stderr: "" };
    await expect(runCli(["compare", "--root", input.root, "--baseline", input.baseline, "--candidate", input.candidate, "--out-dir", input.outDir, "--consumers", "consumers.yaml"], io)).resolves.toBe(0);
    expect(io.stderr).toBe("");
    expect(io.stdout).toContain("no-supported-breaking-change-detected");
  });

  it("resolves a relative reference nested under the externally loaded document", async () => {
    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200': {description: ok, content: {application/json: {schema: {$ref: './schemas/order.yaml#/Order'}}}}\n";
    const candidate = baseline;
    const input = await createCase("nested-relative-ref", baseline, candidate, { "schemas/order.yaml": "Order:\n  $ref: './parts.yaml#/Order'\n", "schemas/parts.yaml": "Order: {type: object, required: [id], properties: {id: {type: string}}}\n" });
    await writeFile(join(input.root, "candidate.yaml"), candidate.replace("./schemas/order.yaml", "./schemas/candidate-order.yaml"));
    await writeFile(join(input.root, "schemas/candidate-order.yaml"), "Order:\n  $ref: './candidate-parts.yaml#/Order'\n");
    await writeFile(join(input.root, "schemas/candidate-parts.yaml"), "Order: {type: object, required: [], properties: {id: {type: string}}}\n");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED" }] } });
  });
});
