import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { compareWithFileSystem, createRaceFileSystem } from "../src/internal/compare-test.js";
import { createCase, depthYaml, nodeYaml } from "./helpers.js";

const refBaseline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200': {description: ok, content: {application/json: {schema: {$ref: './schemas.yaml#/Order'}}}}\n";

describe("AC7-AC8 resolver and filesystem boundaries", () => {
  it("resolves an equivalent local reference with an exact response finding", async () => {
    const files = { "schemas.yaml": "Order:\n  type: object\n  required: [id]\n  properties: {id: {type: string}}\n" };
    const candidate = refBaseline.replace("required: [id]", "required: []");
    const input = await createCase("local-ref", refBaseline, candidate, files);
    await writeFile(join(input.root, "candidate.yaml"), candidate.replace("./schemas.yaml", "./candidate-schemas.yaml"));
    await writeFile(join(input.root, "candidate-schemas.yaml"), "Order:\n  type: object\n  required: []\n  properties: {id: {type: string}}\n");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 2, report: { findings: [{ ruleId: "RESPONSE_REQUIRED_PROPERTY_REMOVED", pointer: "/paths/~1orders/get/responses/200/content/application~1json/schema/properties/id" }] } });
  });
  it("rejects network, traversal, percent, malformed tilde and noncanonical-index refs", async () => {
    for (const ref of ["https://example.test/a.yaml#/X", "../outside.yaml#/X", "a%2eyaml#/X", "a.yaml#/bad~2token", "a.yaml#/list/01"]) {
      const baseline = refBaseline.replace("./schemas.yaml#/Order", ref);
      await expect(compare(await createCase(`ref-${ref.length}`, baseline, baseline))).resolves.toMatchObject({ exitCode: 3, errorCode: "REF_INVALID" });
    }
  });
  it("rejects a real local-reference pointer cycle", async () => {
    const cycle = "Loop:\n  $ref: './schemas.yaml#/Loop'\n";
    const input = await createCase("ref-cycle", refBaseline.replace("#/Order", "#/Loop"), refBaseline.replace("#/Order", "#/Loop"), { "schemas.yaml": cycle });
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 3, errorCode: "REF_INVALID" });
  });
  it("rejects duplicate, custom-tag and multidocument YAML", async () => {
    for (const yaml of ["openapi: 3.1.0\nopenapi: 3.1.0\npaths: {}\n", "openapi: !custom 3.1.0\npaths: {}\n", "openapi: 3.1.0\npaths: {}\n---\npaths: {}\n"]) {
      await expect(compare(await createCase("yaml-invalid", yaml, yaml))).resolves.toMatchObject({ exitCode: 3, errorCode: "DOCUMENT_INVALID" });
    }
  });
  it("rejects aliases, cycles, depth 129 and 100001 real YAML nodes", async () => {
    for (const yaml of ["openapi: 3.1.0\npaths: {}\na: &a [x]\nprobe: [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\n", "openapi: 3.1.0\npaths: {}\na: &a {self: *a}\n", depthYaml(129), nodeYaml(100001)]) {
      await expect(compare(await createCase("yaml-limit", yaml, yaml))).resolves.toMatchObject({ exitCode: 3, errorCode: "INPUT_LIMIT" });
    }
  });
  it("accepts __proto__ as a null-prototype own data key", async () => {
    const yaml = "openapi: 3.1.0\npaths: {}\ncomponents:\n  schemas:\n    __proto__: {type: object}\n";
    await expect(compare(await createCase("proto", yaml, yaml))).resolves.toMatchObject({ exitCode: 0, report: { findings: [] } });
  });
  it("rejects input and output-parent symlinks", async () => {
    const input = await createCase("links", "openapi: 3.1.0\npaths: {}\n", "openapi: 3.1.0\npaths: {}\n");
    await symlink("baseline.yaml", join(input.root, "linked.yaml"));
    await mkdir(join(input.root, "real-parent"));
    await symlink("real-parent", join(input.root, "linked-parent"));
    await expect(compare({ ...input, baseline: "linked.yaml" })).resolves.toMatchObject({ exitCode: 3, errorCode: "PATH_INVALID" });
    await expect(compare({ ...input, outDir: "linked-parent/out" })).resolves.toMatchObject({ exitCode: 3, errorCode: "PATH_INVALID" });
  });
  it("rejects an actual referenced-file symlink", async () => {
    const baseline = refBaseline;
    const input = await createCase("ref-symlink", baseline, baseline, { "real-schemas.yaml": "Order: {type: object}\n" });
    await symlink("real-schemas.yaml", join(input.root, "schemas.yaml"));
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 3, errorCode: "PATH_INVALID" });
  });
  it("uses an internal-only FileSystem seam to detect a stat race", async () => {
    const input = await createCase("race", "openapi: 3.1.0\npaths: {}\n", "openapi: 3.1.0\npaths: {}\n");
    await expect(compareWithFileSystem(input, createRaceFileSystem())).resolves.toMatchObject({ exitCode: 3, errorCode: "INPUT_RACE" });
  });
  it("rejects output target collision without replacing it", async () => {
    const input = await createCase("collision", "openapi: 3.1.0\npaths: {}\n", "openapi: 3.1.0\npaths: {}\n");
    await mkdir(join(input.root, input.outDir));
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 3, errorCode: "OUTPUT_INVALID" });
  });
});
