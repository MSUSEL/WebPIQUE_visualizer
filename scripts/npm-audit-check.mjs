import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const reportFlagIndex = process.argv.indexOf("--report");
const reportPath = reportFlagIndex >= 0 ? process.argv[reportFlagIndex + 1] : null;

const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
const stdout = (result.stdout || "").trim();
const stderr = (result.stderr || "").trim();

if (!stdout) {
  console.error("npm audit did not return JSON output.");
  if (stderr) {
    console.error(stderr);
  }
  process.exit(2);
}

let data;
try {
  data = JSON.parse(stdout);
} catch (error) {
  console.error("Failed to parse npm audit JSON output.");
  console.error(error);
  process.exit(2);
}

const severityRank = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};
const threshold = severityRank.moderate;
const findings = [];

if (data.vulnerabilities && typeof data.vulnerabilities === "object") {
  for (const [pkg, vuln] of Object.entries(data.vulnerabilities)) {
    const severity = vuln.severity;
    if (!severityRank[severity] || severityRank[severity] < threshold) {
      continue;
    }

    let viaDetails = [];
    if (Array.isArray(vuln.via)) {
      for (const via of vuln.via) {
        if (typeof via === "string") {
          viaDetails.push(via);
        } else if (via && typeof via === "object") {
          const title = via.title || via.name || "advisory";
          const url = via.url ? ` (${via.url})` : "";
          viaDetails.push(`${title}${url}`);
        }
      }
    }

    if (viaDetails.length === 0) {
      viaDetails = ["advisory details unavailable"];
    }

    findings.push({
      package: pkg,
      severity,
      details: viaDetails,
    });
  }
} else if (data.advisories && typeof data.advisories === "object") {
  for (const advisory of Object.values(data.advisories)) {
    if (!advisory || typeof advisory !== "object") {
      continue;
    }

    const severity = advisory.severity;
    if (!severityRank[severity] || severityRank[severity] < threshold) {
      continue;
    }

    const title = advisory.title || advisory.module_name || "advisory";
    const url = advisory.url ? ` (${advisory.url})` : "";

    findings.push({
      package: advisory.module_name || "unknown",
      severity,
      details: [`${title}${url}`],
    });
  }
}

findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

let report = "";
if (findings.length > 0) {
  report += `npm audit found ${findings.length} moderate-or-higher vulnerabilities.\n\n`;

  const summary = data.metadata && data.metadata.vulnerabilities;
  if (summary && typeof summary === "object") {
    report += "Summary by severity:\n";
    report += `  low: ${summary.low ?? 0}\n`;
    report += `  moderate: ${summary.moderate ?? 0}\n`;
    report += `  high: ${summary.high ?? 0}\n`;
    report += `  critical: ${summary.critical ?? 0}\n\n`;
  }

  report += "Details:\n";
  for (const item of findings) {
    report += `- ${item.package} (${item.severity}): ${item.details.join("; ")}\n`;
  }
} else {
  report = "npm audit found no moderate-or-higher vulnerabilities.";
}

if (reportPath) {
  writeFileSync(reportPath, report);
}

console.log(report);
process.exit(findings.length > 0 ? 1 : 0);
