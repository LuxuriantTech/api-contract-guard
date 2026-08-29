import { execFile } from "node:child_process";
import { cp, lstat, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compare } from "../src/index.js";
import { createCase } from "./helpers.js";

const execute = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const noFindingsDisclaimer = "No supported breaking changes detected. This is not a general OpenAPI compatibility verdict. Review warnings and supportedRules.";

describe("W57 product consistency", () => {
  it("keeps the exact no-findings disclaimer and uses a non-contradictory finding scope", async () => {
    const empty = await createCase("consistency-empty", "openapi: 3.1.0\npaths: {}\n", "openapi: 3.1.0\npaths: {}\n");
    const emptyResult = await compare(empty);
    expect(emptyResult).toMatchObject({ exitCode: 0, report: { disclaimer: noFindingsDisclaimer } });

    const baseline = "openapi: 3.1.0\npaths:\n  /orders:\n    get:\n      responses: { '200': {description: ok} }\n";
    const finding = await createCase("consistency-finding", baseline, "openapi: 3.1.0\npaths: {}\n");
    const findingResult = await compare(finding);
    expect(findingResult).toMatchObject({ exitCode: 2 });
    expect(findingResult.report?.disclaimer).not.toBe(noFindingsDisclaimer);
    expect(findingResult.report?.disclaimer).toContain("supported rules");
    expect(findingResult.report?.disclaimer).toContain("not a general OpenAPI compatibility verdict");
    const html = await readFile(join(finding.root, finding.outDir, "report.html"), "utf8");
    expect(html).not.toContain(noFindingsDisclaimer);
    expect(html).toContain(findingResult.report?.disclaimer ?? "");
  });

  it("builds before demo in a temporary checkout with no dist directory", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "acg-demo-checkout-"));
    for (const entry of ["src", "tests/fixtures", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json"]) await cp(join(projectRoot, entry), join(temporary, entry), { recursive: true });
    await symlink(join(projectRoot, "node_modules"), join(temporary, "node_modules"));
    await expect(lstat(join(temporary, "dist"))).rejects.toThrow();
    const manifest = JSON.parse(await readFile(join(temporary, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    expect(manifest.scripts?.predemo).toBe("npm run build");
    const { stdout } = await execute("npm", ["run", "demo"], { cwd: temporary });
    expect(stdout).toContain("Synthetic scenario only");
    await expect(lstat(join(temporary, "dist", "demo.js"))).resolves.toBeDefined();
  });
});
