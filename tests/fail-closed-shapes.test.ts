import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const response = (schema: string) => `openapi: 3.1.0
paths:
  /probe:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
${schema}`;

const malformedSchemas: Record<string, string> = {
  "type array": "                type: [string]\n",
  "required non-string": "                type: object\n                required: [id, 7]\n",
  "properties array": "                type: object\n                properties: [id]\n",
  "items scalar": "                type: array\n                items: string\n",
  "schema ref with sibling": "                $ref: '#/components/schemas/Probe'\n                description: forbidden sibling\ncomponents:\n  schemas:\n    Probe:\n      type: string\n",
};

async function expectCapabilityUnsupported(name: string, document: string) {
  const input = await createCase(name, document, document);
  await expect(compare(input)).resolves.toEqual({ exitCode: 3, errorCode: "CAPABILITY_UNSUPPORTED", report: undefined });
  await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
  await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
}

describe("fail-closed supported OpenAPI shapes", () => {
  it.each(Object.entries(malformedSchemas))("rejects malformed schema: %s", async (name, schema) => {
    await expectCapabilityUnsupported(`shape-${name.replaceAll(" ", "-")}`, response(schema));
  });

  it("rejects parameter references with siblings instead of ignoring them", async () => {
    await expectCapabilityUnsupported("parameter-ref", `openapi: 3.1.0
paths:
  /probe:
    get:
      parameters:
        - $ref: '#/components/parameters/Probe'
          description: forbidden sibling
      responses: { '200': { description: ok } }
components:
  parameters:
    Probe: { name: q, in: query, schema: { type: string } }
`);
  });

  it("rejects request body references with siblings instead of ignoring them", async () => {
    await expectCapabilityUnsupported("request-body-ref", `openapi: 3.1.0
paths:
  /probe:
    post:
      requestBody:
        $ref: '#/components/requestBodies/Probe'
        description: forbidden sibling
      responses: { '200': { description: ok } }
components:
  requestBodies:
    Probe: { content: { application/json: { schema: { type: string } } } }
`);
  });

  it("rejects response references with siblings instead of ignoring them", async () => {
    await expectCapabilityUnsupported("response-ref", `openapi: 3.1.0
paths:
  /probe:
    get:
      responses:
        '200':
          $ref: '#/components/responses/Probe'
          description: forbidden sibling
components:
  responses:
    Probe: { description: ok, content: { application/json: { schema: { type: string } } } }
`);
  });
});
