import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

export const disclaimer = "No supported breaking changes detected. This is not a general OpenAPI compatibility verdict. Review warnings and supportedRules.";

export async function createCase(name: string, baseline: string, candidate: string, files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), `acg-${name}-`));
  await writeFile(join(root, "baseline.yaml"), baseline, "utf8");
  await writeFile(join(root, "candidate.yaml"), candidate, "utf8");
  await Promise.all(Object.entries(files).map(async ([relative, value]) => {
    const path = join(root, relative);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, value, "utf8");
  }));
  return { root, baseline: "baseline.yaml", candidate: "candidate.yaml", outDir: "out" };
}

export async function reportBytes(root: string, outDir: string) {
  return Promise.all(["report.json", "report.html"].map((name) => readFile(join(root, outDir, name))));
}

export const baselineOrder = `openapi: 3.1.0
paths:
  /orders:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [id, status]
                properties:
                  id: { type: string }
                  status: { type: string }
`;

export function depthYaml(depth: number): string {
  let yaml = "openapi: 3.1.0\npaths: {}\nprobe:\n";
  for (let level = 0; level < depth; level += 1) yaml += `${"  ".repeat(level + 1)}child:\n`;
  return `${yaml}${"  ".repeat(depth + 1)}leaf: value\n`;
}

export function nodeYaml(nodes: number): string {
  return `openapi: 3.1.0\npaths: {}\nprobe:\n${"  - value\n".repeat(nodes)}`;
}
