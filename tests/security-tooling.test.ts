import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");

describe("secret scanner", () => {
  it("scans .env.example and package-lock.json while redacting every finding", async () => {
    const root = await mkdtemp(join(tmpdir(), "acg-secret-scan-"));
    const privateKeyHeader = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
    await writeFile(join(root, ".env.example"), `PRIVATE=${privateKeyHeader}\n`, "utf8");
    await writeFile(join(root, "package-lock.json"), `{\"private\":\"${privateKeyHeader}\"}\n`, "utf8");
    const result = await execute(process.execPath, ["scripts/scan-secrets.mjs", root], { cwd: projectRoot }).then(
      () => ({ code: 0, stderr: "" }),
      (error: { code?: number; stderr?: string }) => ({ code: error.code ?? 0, stderr: error.stderr ?? "" }),
    );
    expect(result.code).toBe(1);
    const lines = result.stderr.trim().split("\n");
    expect(lines).toEqual([
      ".env.example:1:private-key: [REDACTED]",
      "package-lock.json:1:private-key: [REDACTED]",
    ]);
    expect(result.stderr).not.toContain("PRIVATE=");
    expect(result.stderr).not.toContain(privateKeyHeader);
  });
});
