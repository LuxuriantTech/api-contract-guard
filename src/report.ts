import type { Finding, Report, Warning } from "./model.js";

export const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!).replace(/\u2028/g, "&#8232;").replace(/\u2029/g, "&#8233;");
export const pointerToken = (value: string) => value.replace(/~/g, "~0").replace(/\//g, "~1");

function text(value: string | number): string { return escapeHtml(String(value)); }

function warningItems(warnings: Warning[]): string {
  if (warnings.length === 0) return "<p>No warnings were produced.</p>";
  return `<ul>${warnings.map((warning) => `<li><strong>${text(warning.code)}</strong>: ${text(warning.message)} (${text(warning.location)})</li>`).join("")}</ul>`;
}

function findingRows(findings: Finding[]): string {
  if (findings.length === 0) return "<p>No supported breaking changes were found.</p>";
  return `<table><thead><tr><th>Rule</th><th>Method</th><th>Path</th><th>Message</th><th>Synthetic consumers</th></tr></thead><tbody>${findings.map((finding: Finding) => `<tr><td>${text(finding.ruleId)}</td><td>${text(finding.method)}</td><td>${text(finding.path)}</td><td>${text(finding.message)}</td><td>${text(finding.consumerIds.join(", ") || "None")}</td></tr>`).join("")}</tbody></table>`;
}

export function renderHtml(report: Report): string {
  const summaryRows = report.supportedRules.map((rule) => `<tr><th>${text(rule)}</th><td>${text(report.summary[rule] ?? 0)}</td></tr>`).join("");
  const rulesList = report.supportedRules.map((rule) => `<li>${text(rule)}</li>`).join("");
  const verdict = report.findings.length === 0 ? "No supported breaking changes detected" : "Supported breaking changes detected";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>API Contract Guard</title><style>body{margin:0;background:#f7f7f7;color:#171717;font:16px/1.5 system-ui,sans-serif}.wrap{box-sizing:border-box;max-width:72rem;margin:auto;padding:2rem 1rem}section{background:#fff;border:1px solid #d7d7d7;border-radius:.5rem;margin:1rem 0;padding:1rem}h1,h2{line-height:1.2}table{border-collapse:collapse;display:block;max-width:100%;overflow-x:auto}th,td{border:1px solid #c9c9c9;padding:.5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}p,li,td{overflow-wrap:anywhere}.notice{border-left:4px solid #9a6700;padding-left:.75rem}</style></head><body><main><div class="wrap"><h1>API Contract Guard</h1><section><h2>Verdict</h2><p>${verdict}</p><p>${text(report.disclaimer)}</p></section><section><h2>Summary</h2><table><thead><tr><th>Supported rule</th><th>Findings</th></tr></thead><tbody>${summaryRows}</tbody></table></section><section><h2>Supported rules</h2><ul>${rulesList}</ul></section><section><h2>Warnings</h2>${report.warnings.length ? "<p class=\"notice\">Warnings require manual review.</p>" : ""}${warningItems(report.warnings)}</section><section><h2>Supported breaking changes</h2>${findingRows(report.findings)}</section></div></main></body></html>\n`;
}
