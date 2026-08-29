import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url)));
const ignored = new Set([".git", "node_modules", "dist", "coverage"]);
const patterns = [
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g],
  ["npm-token", /\bnpm_[A-Za-z0-9]{36}\b/g],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["private-key", /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/g]
];

function isExplicitPlaceholder(line) {
  const value = line.slice(line.indexOf("=") + 1).trim();
  return /^(?:change-me|replace-me|REPLACE_ME|YOUR_[A-Z0-9_]+|\$\{[A-Z0-9_]+\})$/u.test(value);
}

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const findings = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) findings.push(...await scan(path));
    else if (entry.isFile()) {
      const content = await readFile(path);
      if (content.includes(0)) continue;
      const text = content.toString("utf8");
      for (const [type, pattern] of patterns) {
        for (const match of text.matchAll(pattern)) {
          const line = text.slice(0, match.index).split("\n").length;
          const lineText = text.split("\n")[line - 1] ?? "";
          if (isExplicitPlaceholder(lineText)) continue;
          findings.push(`${relative(root, path)}:${line}:${type}: [REDACTED]`);
        }
      }
    }
  }
  return findings;
}

const findings = await scan(root);
if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exitCode = 1;
}
