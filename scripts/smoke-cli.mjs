import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);
const prefix = join(tmpdir(), "acg-smoke-");
const root = await mkdtemp(prefix);

try {
  await cp(new URL("../tests/fixtures/demo/", import.meta.url), root, { recursive: true });
  const { stdout, stderr } = await execFile(process.execPath, [
    "dist/main.js",
    "compare",
    "--root", root,
    "--baseline", "shop-api-baseline.yaml",
    "--candidate", "shop-api-candidate.yaml",
    "--consumers", "synthetic-consumers.yaml",
    "--out-dir", "report"
  ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  throw new Error(`CLI smoke expected exit code 2, received successful process: ${stdout}${stderr}`);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === 2) {
    const stdout = String(error.stdout ?? "");
    const stderr = String(error.stderr ?? "");
    if (stderr === "") {
      const report = JSON.parse(stdout);
      if (report.verdict === "supported-breaking-change-detected") {
        await Promise.all([
          readFile(join(root, "report", "report.json"), "utf8"),
          readFile(join(root, "report", "report.html"), "utf8")
        ]);
        process.exitCode = 0;
      } else throw error;
    } else throw error;
  } else throw error;
} finally {
  if (!root.startsWith(prefix)) throw new Error("refusing unsafe smoke cleanup");
  await rm(root, { recursive: true, force: true });
}
