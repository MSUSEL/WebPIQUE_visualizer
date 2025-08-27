// component to render security qualtiy aspect CWE, CVE, and lines of code infomration
// unique to WebPIQUE
import React, { useMemo, useState } from "react";
import { Box } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import MuiTabs, { TabItem } from "../components/Tabs";
import ProbabilityDensity from "../components/ProbabilityDensity";
import CVEScoreMiniChart from "../components/CVEChart";
import "../styles/SecurityTabs.css";
import { DiffHints } from "../Utilities/fileDiff";

type ScoresType = any;
type PF = any;
type Measure = any;

type SecTabName = "CWE" | "CVE" | "Lines of Code";

type Props = {
  scores: ScoresType;
  controlledTab?: SecTabName; // tab mirroring
  onTabChange?: (v: SecTabName) => void;
  controlledMeasures?: string | null;
  onMeausreChange?: (key: string | null) => void;
  controlledBucket?: "all" | "critical" | "severe" | "moderate";
  onBucketChange?: (v: "all" | "critical" | "severe" | "moderate") => void;
  controlledPkgFilter?: string;
  onPkgFilterChange?: (v: string) => void;
  controlledFixedFilter?: "all" | "fixed" | "notfixed";
  onFixedFilterChange?: (v: "all" | "fixed" | "notfixed") => void;
  diffHints?: DiffHints;
};

// ------- helpers used across tabs -------
const bucketFor = (score: number): "critical" | "severe" | "moderate" => {
  if (score < 0.6) return "critical";
  if (score < 0.8) return "severe";
  return "moderate";
};

// add severity label and visual icon
type SeverityInfo = {
  color: string;
  label: string;
  icon: string;
};

const getSeverityInfo = (score: number): SeverityInfo => {
  if (score < 0.6) {
    return { color: "#d93025", label: "CWE score below < 0.6", icon: "🔴" };
  } else if (score < 0.8) {
    return { color: "#e37400", label: "CWE score between 0.6-0.8", icon: "🟠" };
  } else {
    return { color: "#188038", label: "CWE score > 0.8", icon: "🟢" };
  }
};

// Normalizes CVE fixed status: "Fixed", "fixed", true, "true" → "fixed" | "notfixed" | ""
const normalizeFixed = (v: any): "fixed" | "notfixed" | "" => {
  if (v === true) return "fixed";
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "fixed") return "fixed";
  if (s === "false" || s === "not fixed") return "notfixed";
  return "";
};

// Extract CWE pillar id from PF name, e.g., "Product_Factor CWE-693" -> "CWE-693"
const extractPillarId = (pfName: string): string | null => {
  const m = /CWE-(\d+)/.exec(pfName || "");
  return m ? `CWE-${m[1]}` : null;
};

// Normalize various CWE measure field formats (248, "CWE-248", etc.) -> "CWE-248"
const normalizeCweId = (v: any): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = /(\d+)/.exec(s);
  return m ? `CWE-${m[1]}` : null;
};

type GroupedCVE = {
  id: string;
  title?: string;
  description?: string;
  severity?: string | number;
  fixed?: any;
  vulnSource?: string;
  vulnSourceVersion?: string;
  fixedVersion?: string;
  cwePillars: Set<string>;
  cweMeasures: Set<string>;
  byTool: any[];
  raw: any[];
};

const SecurityTabs: React.FC<Props> = ({
  scores,
  controlledTab,
  onTabChange,
  controlledMeasures,
  onMeausreChange,
  controlledBucket,
  onBucketChange,
  controlledPkgFilter,
  onPkgFilterChange,
  controlledFixedFilter,
  onFixedFilterChange,
  diffHints,
}) => {
  // ---------- CWE TAB STATE ----------
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedCWEKey = controlledMeasures ?? expandedLocal;
  const setExpandedCWEKey = (key: string | null) => {
    if (controlledMeasures === undefined) setExpandedLocal(key);
    onMeausreChange?.(key);
  };

  const [popoutKey, setPopoutKey] = useState<{ pfName: string; measureIndex: number } | null>(null);

  const sortedPFs = [...((scores.cweProductFactors ?? []) as PF[])].sort(
    (a: PF, b: PF) => (a.value ?? 0) - (b.value ?? 0)
  );

  type Bucket = "all" | "critical" | "severe" | "moderate";
  const [bucketLocal, setBucketLocal] = useState<Bucket>("all");
  const bucket = controlledBucket ?? bucketLocal;

  const counts = {
    critical: sortedPFs.filter((pf: PF) => pf?.value != null && pf.value < 0.6).length,
    severe: sortedPFs.filter((pf: PF) => pf?.value != null && pf.value >= 0.6 && pf.value < 0.8).length,
    moderate: sortedPFs.filter((pf: PF) => pf?.value != null && pf.value >= 0.8).length,
    all: sortedPFs.length,
  };

  const filteredPFs =
    bucket === "all"
      ? sortedPFs
      : sortedPFs.filter((pf: PF) => bucketFor(pf.value) === bucket);

  const onChipClick = (next: Exclude<Bucket, "all">) => {
    const val: Bucket = bucket === next ? "all" : next;
    if (controlledBucket === undefined) setBucketLocal(val);
    onBucketChange?.(val);
  };

  // ---------- CVE TAB STATE ----------
  const [pkgLocal, setPkgLocal] = useState<string>("ALL");
  const pkgFilter = controlledPkgFilter ?? pkgLocal;

  const [fixedLocal, setFixedLocal] = useState<"all" | "fixed" | "notfixed">("all");
  const fixedFilter = controlledFixedFilter ?? fixedLocal;

  // Create the "Package" filter options (unique vulnSource names)
  const packageOptions = useMemo(() => {
    const set = new Set<string>();
    (scores.cweProductFactors ?? []).forEach((pf: any) => {
      (pf.cves ?? []).forEach((cve: any) => {
        const name = (cve?.vulnSource ?? "").trim();
        if (name) set.add(name);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scores]);

  // CVE filter (package + fixed)
  const cveMatches = (payload: { vulnSource?: string; fixed?: any }) => {
    const pkgPass =
      pkgFilter === "ALL" || (payload?.vulnSource ?? "").trim() === pkgFilter;

    const fixedNorm = normalizeFixed(payload?.fixed);
    const fixedPass =
      fixedFilter === "all" ||
      (fixedFilter === "fixed" && fixedNorm === "fixed") ||
      (fixedFilter === "notfixed" && fixedNorm !== "fixed");

    return pkgPass && fixedPass;
  };

  // Group CVEs by CVE-ID and aggregate CWE pillars & measures
  const groupedCves = useMemo<GroupedCVE[]>(() => {
    const groupedById = new Map<string, GroupedCVE>();

    const productFactors: any[] = scores?.cweProductFactors ?? [];
    for (const pf of productFactors) {
      const pillarId = extractPillarId(pf?.name);
      const cves: any[] = pf?.cves ?? [];

      for (const cve of cves) {
        const id: string =
          cve?.cveId ?? cve?.id ?? cve?.name ?? cve?.CVE ?? cve?.CVE_ID;
        if (!id) continue;

        let g = groupedById.get(id);
        if (!g) {
          g = {
            id,
            title: cve?.title ?? cve?.summary ?? id,
            description: cve?.description ?? "",
            severity: cve?.severity ?? cve?.cvss ?? cve?.score,
            fixed: cve?.fixed,
            vulnSource: (cve?.vulnSource ?? "").trim(),
            vulnSourceVersion: (cve?.vulnSourceVersion ?? "").trim(),
            fixedVersion: cve?.fixedVersion,
            cwePillars: new Set<string>(),
            cweMeasures: new Set<string>(),
            byTool: [],
            raw: [],
          };
          groupedById.set(id, g);
        }

        const measureId =
          normalizeCweId(
            cve?.CWEmeasureName ??
            cve?.cweMeasure ??
            cve?.measure ??
            cve?.cwe ??
            cve?.cwe_id ??
            cve?.cweId ??
            cve?.weakness
          ) ?? null;

        if (pillarId) g.cwePillars.add(pillarId);
        if (measureId) g.cweMeasures.add(measureId);

        // merge byTool (avoid duplicates by tool name + score stringified)
        const existingKeys = new Set(g.byTool.map((t: any) => `${t.tool}|${t.score ?? ""}`));
        (cve?.byTool ?? []).forEach((t: any) => {
          const key = `${t.tool}|${t.score ?? ""}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            g.byTool.push(t);
          }
        });

        // prefer first non-empty fields if missing
        if (!g.vulnSource && (cve?.vulnSource ?? "").trim()) {
          g.vulnSource = (cve.vulnSource as string).trim();
        }
        if (!g.vulnSourceVersion && (cve?.vulnSourceVersion ?? "").trim()) {
          g.vulnSourceVersion = (cve.vulnSourceVersion as string).trim();
        }
        if (g.fixed == null && cve?.fixed != null) {
          g.fixed = cve.fixed;
        }

        g.raw.push(cve);
      }
    }

    // Apply filters to grouped result
    return Array.from(groupedById.values()).filter((g) =>
      cveMatches({ vulnSource: g.vulnSource, fixed: g.fixed })
    );
  }, [scores, pkgFilter, fixedFilter]);

  // ---------- TABS ----------
  const tabs: TabItem[] = [];

  // --- CWE tab ---
  tabs.push({
    label: "CWE",
    content: (
      <Box className="st-root">
        <h3 className="st-h3"># of CWE Pillars: {counts.all ?? 0}</h3>

        <div className="st-chips">
          <button
            className={`st-chip st-chip--critical ${bucket === "critical" ? "is-active" : ""}`}
            onClick={() => onChipClick("critical")}
            aria-pressed={bucket === "critical"}
          >
            <span className="st-chip-dot" />
            CWE score &lt; 0.6
            <span className="st-chip-count">{counts.critical}</span>
          </button>

          <button
            className={`st-chip st-chip--severe ${bucket === "severe" ? "is-active" : ""}`}
            onClick={() => onChipClick("severe")}
            aria-pressed={bucket === "severe"}
          >
            <span className="st-chip-dot" />
            CWE score between 0.6-0.8
            <span className="st-chip-count">{counts.severe}</span>
          </button>

          <button
            className={`st-chip st-chip--moderate ${bucket === "moderate" ? "is-active" : ""}`}
            onClick={() => onChipClick("moderate")}
            aria-pressed={bucket === "moderate"}
          >
            <span className="st-chip-dot" />
            CWE score &gt; 0.8
            <span className="st-chip-count">{counts.moderate}</span>
          </button>

          <button
            className={`st-chip st-chip--all ${bucket === "all" ? "is-active" : ""}`}
            onClick={() => {
              if (controlledBucket === undefined) setBucketLocal("all");
              onBucketChange?.("all");
            }}
            aria-pressed={bucket === "all"}
            title="Clear filter"
          >
            All
            <span className="st-chip-count">{counts.all}</span>
          </button>
        </div>

        {filteredPFs.map((pf: PF) => {
          const isExpanded = expandedCWEKey === pf.name;
          const toggleExpand = () => setExpandedCWEKey(isExpanded ? null : pf.name);

          return (
            <Box
              key={pf.name}
              className={`pf-card ${diffHints?.differingPFs.has(pf.name) ? "diff-outline" : ""}`}
              style={{ border: `2px solid ${getSeverityInfo(pf.value).color}`, backgroundColor: "#fff" }}
            >
              <div>
                <span className="icon">{getSeverityInfo(pf.value).icon}</span>
                <span className="label">{getSeverityInfo(pf.value).label}</span>
              </div>
              <h4 className="pf-title">{pf.name.replace("Product_Factor ", "")}</h4>
              <ul className="pf-list">
                <li>
                  <strong>Score:</strong> {pf.value} out of 1
                </li>
                <li>
                  <strong>Description:</strong> {pf.description}
                </li>
                <li>
                  <strong>Benchmark size: </strong>
                  {pf.benchmarkSize ?? pf.measures?.[0]?.threshold?.length ?? 0}
                </li>
                <li>
                  <div className="measure-toggle" onClick={toggleExpand}>
                    <span className="measure-toggle-label">
                      <strong>Measures</strong> (n = {pf.measures.length})
                      <strong>:</strong>
                    </span>
                    {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </div>

                  {isExpanded && (pf.measures?.length ?? 0) > 0 && (
                    <div className="measure-list">
                      <ul>
                        {pf.measures
                          .slice()
                          .sort(
                            (a: Measure, b: Measure) =>
                              Number(a.score ?? 0) - Number(b.score ?? 0)
                          )
                          .map((measure: Measure, idx: number) => (
                            <li
                              key={idx}
                              className={`measure-item ${diffHints?.differingMeasures.has(`${pf.name}::${measure.name}`) ? "diff-outline" : ""}`}
                              style={{ border: `2px solid ${getSeverityInfo(measure.score).color}`, backgroundColor: "#fff" }}
                            >
                              <div className="severity-badge">
                                <span className="icon">{getSeverityInfo(measure.score).icon}</span>
                                <span className="label">{getSeverityInfo(measure.score).label}</span>
                              </div>
                              <strong>{measure.name.replace(" Measure", "")}:</strong>{" "}
                              {measure.description}
                              <ul>
                                <li>
                                  <strong>
                                    Score: {measure.score * 100}% better than the benchmark set.
                                  </strong>
                                </li>
                                <li>
                                  Weight: The CWE measure contributed a{" "}
                                  <strong>{(measure.weight ?? 0).toFixed(4)}</strong>{" "}
                                  to the final CWE pillar score.
                                </li>
                                <li>
                                  <span
                                    className="density-link"
                                    onClick={() =>
                                      setPopoutKey({
                                        pfName: pf.name,
                                        measureIndex: idx,
                                      })
                                    }
                                  >
                                    Density Plot
                                  </span>
                                </li>
                              </ul>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </li>
              </ul>
            </Box>
          );
        })}
      </Box>
    ),
  });

  // --- CVE tab (grouped by CVE-ID) ---
  tabs.push({
    label: "Package Vulnerabilites",
    content: (
      <Box className="st-root">
        <h3 className="st-h3"># of Package Vulnerabilities: {scores.vulnerabilitySummary?.cveCount ?? groupedCves.length}</h3>
        <hr className="st-divider st-divider--narrow" />

        {/* Filters */}
        <div className="st-filters">
          <label className="st-filter">
            <span className="st-filter-label">Vulnerable Package</span>
            <select
              className="st-filter-select"
              value={pkgFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (controlledPkgFilter === undefined) setPkgLocal(v);
                onPkgFilterChange?.(v);
              }}
            >
              <option value="ALL">All packages</option>
              {packageOptions.map((pkg) => (
                <option key={pkg} value={pkg}>
                  {pkg}
                </option>
              ))}
            </select>
          </label>

          <label className="st-filter">
            <span className="st-filter-label">Fixed status</span>
            <select
              className="st-filter-select"
              value={fixedFilter}
              onChange={(e) => {
                const v = e.target.value as "all" | "fixed" | "notfixed";
                if (controlledFixedFilter === undefined) setFixedLocal(v);
                onFixedFilterChange?.(v);
              }}
            >
              <option value="all">All</option>
              <option value="fixed">Fixed</option>
              <option value="notfixed">Not fixed</option>
            </select>
          </label>

          <button
            className="st-filter-reset"
            onClick={() => {
              if (controlledPkgFilter === undefined) setPkgLocal("ALL");
              if (controlledFixedFilter === undefined) setFixedLocal("all");
              onPkgFilterChange?.("ALL");
              onFixedFilterChange?.("all");
            }}
            title="Clear filters"
          >
            Reset
          </button>
        </div>

        {/* Grouped CVE cards */}
        <Box>
          {groupedCves.map((g) => {
            // diff highlighting: match by grouped id or any raw item name
            const differs =
              diffHints?.differingCVEs.has(g.id) ||
              g.raw.some((r: any) => diffHints?.differingCVEs.has(r?.name));

            // compact byTool union for the mini chart
            const byTool = g.byTool ?? [];

            return (
              <Box key={g.id} className={`cve-card ${differs ? "diff-outline" : ""}`}>
                <h4 className="cve-title">{g.id}</h4>
                <ul className="cve-list">
                  <li>
                    <strong>Package name:</strong> {g.vulnSource || "—"}
                  </li>
                  <li>
                    <strong>Vulnerable Package version:</strong> {g.vulnSourceVersion || "—"}
                  </li>
                  <li>
                    <strong>Fixed status:</strong>{" "}
                    {String(g.fixed ?? "").trim() || "Not fixed"}
                  </li>
                  {g.title && (
                    <li>
                      <strong>Fixed Package Version(s):</strong> {g.fixedVersion}
                    </li>
                  )}
                  <li>
                    <strong>Description:</strong> {g.description || "Coming soon"}
                  </li>
                  <li>
                    <strong>Associated CWE pillar(s):</strong>{" "}
                    {g.cwePillars.size ? Array.from(g.cwePillars).sort().join(", ") : "—"}
                  </li>
                  <li>
                    <strong>Associated CWE measure(s):</strong>{" "}
                    {g.cweMeasures.size ? Array.from(g.cweMeasures).sort().join(", ") : "—"}
                  </li>
                  <li>
                    <strong>Findings identified from: </strong> {" "}
                    {byTool.length
                      ? Array.from(new Set(byTool.map((t: any) => t.tool))).join(", ")
                      : "—"}
                  </li>
                </ul>

                <div className="cve-chart-wrap">
                  <div className="cve-chart-caption">CVE Score</div>
                  <CVEScoreMiniChart byTool={byTool} />
                </div>
              </Box>
            );
          })}
        </Box>
      </Box>
    ),
  });

  // --- Vulnerable Lines of Code ---
  tabs.push({
    label: "Lines of Code Vulnerabilities",
    content: (
      <Box className="st-root">
        <h3 className="st-h3"># of Lines of Code Vulnerabilities: </h3>
        <hr className="st-divider st-divider--narrow" />

        <h3>Coming soon</h3>
      </Box>
    ),
  });

  // controlled/uncontrolled tab selection; allows mirroring on comparison page
  const [localTab, setLocalTab] = useState<SecTabName>("CWE");
  const tabName: SecTabName = controlledTab ?? localTab;

  const nameToIndex = (name: SecTabName) =>
    name === "CWE" ? 0 : name === "CVE" ? 1 : 2;
  const indexToName = (i: number): SecTabName =>
    i === 0 ? "CWE" : i === 1 ? "CVE" : "Lines of Code";

  return (
    <>
      <MuiTabs
        tabs={tabs}
        value={nameToIndex(tabName)} // control by index
        onChange={(i) => {
          const next = indexToName(i);
          if (controlledTab === undefined) setLocalTab(next);
          onTabChange?.(next);
        }}
      />
      {popoutKey && (
        <div className="densityPlot">
          <button className="densityPlot-close" onClick={() => setPopoutKey(null)}>
            X
          </button>
          {(() => {
            const pf = (scores?.cweProductFactors as PF[] | undefined)?.find(
              (p: PF) => p.name === popoutKey.pfName
            );
            const m = pf?.measures?.[popoutKey.measureIndex] as Measure | undefined;
            return m ? (
              <ProbabilityDensity
                thresholds={m.threshold ?? []}
                score={m.score ?? 0}
                cweName={m.name}
              />
            ) : null;
          })()}
        </div>
      )}
    </>
  );
};

export default SecurityTabs;

