import { constants } from "node:fs";
import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { compare } from "../src/index.js";
import { compareWithFileSystem } from "../src/internal/compare-test.js";
import { nodeFileSystem } from "../src/files.js";
import type { FileSystem } from "../src/files.js";
import { createCase } from "./helpers.js";

const minimal = "openapi: 3.1.0\npaths: {}\n";

describe("filesystem protocol", () => {
  it("clears both CLI channels before writing only the final success channel", async () => {
    const input = await createCase("cli-channels", minimal, minimal);
    const io = { stdout: "stale stdout", stderr: "stale stderr" };
    await expect(runCli(["compare", "--root", input.root, "--baseline", input.baseline, "--candidate", input.candidate, "--out-dir", input.outDir], io)).resolves.toBe(0);
    expect(io.stdout).toContain("no-supported-breaking-change-detected");
    expect(io.stderr).toBe("");
  });

  it("clears both CLI channels before writing only the final error channel", async () => {
    const input = await createCase("cli-error-channel", minimal, minimal);
    const io = { stdout: "stale stdout", stderr: "stale stderr" };
    await expect(runCli(["compare", "--root", input.root, "--baseline", "missing.yaml", "--candidate", input.candidate, "--out-dir", input.outDir], io)).resolves.toBe(3);
    expect(io.stdout).toBe("");
    expect(io.stderr).toBe("ERROR PATH_INVALID\n");
  });

  it("rejects a supplied root that is itself a symlink without publishing reports", async () => {
    const input = await createCase("symlink-root", minimal, minimal);
    const linkedRoot = `${input.root}-link`;
    await symlink(input.root, linkedRoot);
    await expect(compare({ ...input, root: linkedRoot })).resolves.toMatchObject({ exitCode: 3, errorCode: "PATH_INVALID", report: undefined });
    await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
  });

  it("reserves the output directory before reading an invalid baseline", async () => {
    const input = await createCase("reserve-first", "not: [valid", minimal);
    await mkdir(join(input.root, input.outDir));
    await writeFile(join(input.root, input.outDir, "sentinel"), "keep", "utf8");
    await expect(compare(input)).resolves.toMatchObject({ exitCode: 3, errorCode: "OUTPUT_INVALID", report: undefined });
    await expect(readFile(join(input.root, input.outDir, "sentinel"), "utf8")).resolves.toBe("keep");
  });

  it("uses nofollow inputs and exclusive private synchronized reports", async () => {
    const input = await createCase("protocol-calls", minimal, minimal);
    const opens: Array<{ flags: number | string; mode: number | undefined }> = [];
    const mkdirs: number[] = [];
    let syncs = 0;
    let closes = 0;
    const fs: FileSystem = {
      ...nodeFileSystem,
      async mkdir(path, options) { mkdirs.push(options.mode); return nodeFileSystem.mkdir(path, options); },
      async open(path, flags, mode) {
        opens.push({ flags, mode });
        const handle = await nodeFileSystem.open(path, flags, mode);
        return new Proxy(handle, { get(target, property, receiver) {
          if (property === "sync") return async () => { syncs += 1; return target.sync(); };
          if (property === "close") return async () => { closes += 1; return target.close(); };
          return Reflect.get(target, property, receiver);
        } });
      }
    };
    await expect(compareWithFileSystem(input, fs)).resolves.toMatchObject({ exitCode: 0 });
    expect(mkdirs).toContain(0o700);
    const inputOpens = opens.filter(({ flags }) => typeof flags === "number");
    expect(inputOpens).toHaveLength(2);
    expect(inputOpens.every(({ flags }) => flags === (constants.O_RDONLY | constants.O_NOFOLLOW))).toBe(true);
    expect(opens.filter(({ flags }) => flags === "wx")).toEqual([{ flags: "wx", mode: 0o600 }, { flags: "wx", mode: 0o600 }]);
    expect(syncs).toBe(2);
    expect(closes).toBeGreaterThanOrEqual(4);
  });

  it("cleans the reserved directory after the second report publication fails", async () => {
    const input = await createCase("cleanup-second", minimal, minimal);
    let reportOpenCount = 0;
    const fs: FileSystem = {
      ...nodeFileSystem,
      async open(path, flags, mode) {
        if (flags === "wx" && path.endsWith("report.html")) {
          reportOpenCount += 1;
          throw new Error("injected second publication failure");
        }
        return nodeFileSystem.open(path, flags, mode);
      }
    };
    await expect(compareWithFileSystem(input, fs)).resolves.toMatchObject({ exitCode: 3, errorCode: "INTERNAL_ERROR", report: undefined });
    expect(reportOpenCount).toBe(1);
    await expect(lstat(join(input.root, input.outDir))).rejects.toThrow();
    await expect(readFile(join(input.root, input.outDir, "report.json"))).rejects.toThrow();
    await expect(readFile(join(input.root, input.outDir, "report.html"))).rejects.toThrow();
  });
});
