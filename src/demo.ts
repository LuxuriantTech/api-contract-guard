import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare } from "./index.js";

const root = await mkdtemp(join(tmpdir(), "acg-demo-"));
const fixtures = new URL("../tests/fixtures/demo/", import.meta.url);
const outDir = "report";
await cp(fixtures, root, { recursive: true });

const result = await compare({
  root,
  baseline: "shop-api-baseline.yaml",
  candidate: "shop-api-candidate.yaml",
  consumers: "synthetic-consumers.yaml",
  outDir,
});

console.log("Synthetic scenario only: fixture-based comparison, not production usage.");
console.log(`Verdict: ${result.report?.verdict ?? result.errorCode}`);
console.log(`Findings: ${result.report?.findings.length ?? 0}`);
for (const finding of result.report?.findings ?? []) {
  console.log(`Finding: ${finding.ruleId} | ${finding.method.toUpperCase()} | ${finding.path} | synthetic consumers: ${finding.consumerIds.join(", ") || "none"}`);
}
console.log(`Local JSON artifact: ${join(root, outDir, "report.json")}`);
console.log(`Local HTML artifact: ${join(root, outDir, "report.html")}`);
process.exitCode = result.exitCode === 2 ? 0 : 1;
