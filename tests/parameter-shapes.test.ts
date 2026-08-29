import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const operation = (parameters: string, schema = "{type: string}") => `openapi: 3.1.0
paths:
  /probe:
    get:
      parameters: ${parameters}
      responses: { '200': { description: ok, content: { application/json: { schema: ${schema} } } } }
`;
const execute = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");

async function expectUnsupported(name: string, baseline: string, candidate = baseline): Promise<void> {
  await expect(compare(await createCase(name, baseline, candidate))).resolves.toEqual({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
}

describe("W52 parameter and schema shapes", () => {
  it("rejects non-boolean readOnly and writeOnly schema flags", async () => {
    await expectUnsupported("read-only-string", operation("[]", "{type: string, readOnly: 'true'}"));
    await expectUnsupported("write-only-string", operation("[]", "{type: string, writeOnly: 'false'}"));
  });

  it("rejects non-array path-item and operation parameters", async () => {
    await expectUnsupported("operation-parameters-record", operation("{name: q, in: query}"));
    await expectUnsupported("path-parameters-record", `openapi: 3.1.0
paths:
  /probe:
    parameters: {name: q, in: query}
    get:
      responses: { '200': {description: ok} }
`);
  });

  it("rejects malformed parameter records", async () => {
    for (const parameter of ["text", "{}", "{name: '', in: query}", "{name: q}", "{name: q, in: matrix}", "{name: q, in: query, required: yes}"]) {
      await expectUnsupported(`parameter-${parameter.length}`, operation(`[${parameter}]`));
    }
  });

  it("rejects non-record parameter schemas and parameter references", async () => {
    await expectUnsupported("parameter-schema-string", operation("[{name: q, in: query, schema: string}]"));
    await expectUnsupported("parameter-reference", operation("[{$ref: '#/components/parameters/Probe'}]"));
  });

  it("keeps internal implementation, tests and TypeScript sources out of the npm pack", async () => {
    const { stdout } = await execute("npm", ["pack", "--dry-run", "--json"], { cwd: projectRoot });
    const packed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const names = packed[0]?.files.map((file) => file.path) ?? [];
    expect(names).toContain("dist/main.js");
    expect(names.some((name) => name.startsWith("dist/internal/") || name.startsWith("tests/") || name.startsWith("src/"))).toBe(false);
  });
});
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
