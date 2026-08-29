import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("CLI packaging and local CI contract", () => {
  it("declares the exact executable and local verification scripts", async () => {
    const manifest = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8")) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(manifest.bin).toEqual({ "api-contract-guard": "dist/main.js" });
    expect(manifest.scripts).toMatchObject({
      "smoke:cli": "node scripts/smoke-cli.mjs",
      "scan:secrets": "node scripts/scan-secrets.mjs",
      "ci:security": "npm audit --omit=dev && npm run scan:secrets"
    });
    expect(manifest.scripts?.ci).toContain("npm run typecheck");
    expect(manifest.scripts?.ci).toContain("npm run build");
    expect(manifest.scripts?.ci).toContain("npm run test:coverage");
    expect(manifest.scripts?.ci).toContain("npm run demo");
    expect(manifest.scripts?.ci).toContain("npm run smoke:cli");
    expect(manifest.scripts?.ci).toContain("npm run scan:secrets");
    const lock = JSON.parse(await readFile(resolve(projectRoot, "package-lock.json"), "utf8")) as {
      packages?: Record<string, { bin?: Record<string, string> }>;
    };
    expect(lock.packages?.[""]?.bin).toEqual(manifest.bin);
  });

  it("keeps CI read-only in repository permissions and runs the local gates", async () => {
    const workflow = await readFile(resolve(projectRoot, ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("  push:");
    expect(workflow).toContain("  pull_request:");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("node-version: 24.15.0");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run ci");
    expect(workflow).toContain("npm run ci:security");
  });
});
