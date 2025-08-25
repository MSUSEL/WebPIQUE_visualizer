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
type CVEItem = any;

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
  // CWE expand box use state
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedCWEKey = controlledMeasures ?? expandedLocal;
  const setExpandedCWEKey = (key: string | null) => {
    if (controlledMeasures === undefined) setExpandedLocal(key);
    onMeausreChange?.(key);
  };
  const [popoutKey, setPopoutKey] = useState<{
    pfName: string;
    measureIndex: number;
  } | null>(null);

  // CVE use state
  const [pkgLocal, setPkgLocal] = useState<string>("ALL");
  const pkgFilter = controlledPkgFilter ?? pkgLocal;

  const [fixedLocal, setFixedLocal] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );
  const fixedFilter = controlledFixedFilter ?? fixedLocal;

  // sort CWE scores from low to high
  const sortedPFs = [...((scores.cweProductFactors ?? []) as PF[])].sort(
    (a: PF, b: PF) => (a.value ?? 0) - (b.value ?? 0)
  );

  // chip cards to filter CWE pillars by severity when clicked
  type Bucket = "all" | "critical" | "severe" | "moderate";

  const bucketFor = (score: number): Exclude<Bucket, "all"> => {
    if (score < 0.6) return "critical";
    if (score < 0.8) return "severe";
    return "moderate";
  };

  const [bucketLocal, setBucketLocal] = useState<Bucket>("all");
  const bucket = controlledBucket ?? bucketLocal;

  // counts of each severity
  const counts = {
    critical: sortedPFs.filter((pf: PF) => pf?.value != null && pf.value < 0.6)
      .length,
    severe: sortedPFs.filter(
      (pf: PF) => pf?.value != null && pf.value >= 0.6 && pf.value < 0.8
    ).length,
    moderate: sortedPFs.filter((pf: PF) => pf?.value != null && pf.value >= 0.8)
      .length,
    all: sortedPFs.length,
  };

  // CWE filtering
  const filteredPFs =
    bucket === "all"
      ? sortedPFs
      : sortedPFs.filter((pf: PF) => bucketFor(pf.value) === bucket);

  // chip click handler
  const onChipClick = (next: Exclude<Bucket, "all">) => {
    const val: Bucket = bucket === next ? "all" : next;
    if (controlledBucket === undefined) setBucketLocal(val);
    onBucketChange?.(val);
  };

  // set CWE card background color by severity score
  const setBackgroundColor = (score: number) => {
    if (score < 0.6) return "#d17f7fff"; // Critical
    if (score < 0.8) return "#f0ea97ff"; // Severe
    return "#a0e5acff"; // Moderate
  };

  // Normalizes CVE fixed status: "Fixed", "fixed", true, "true" → "fixed" | "not fixed" | ""
  const normalizeFixed = (v: any): "fixed" | "notfixed" | "" => {
    if (
      v === true ||
      String(v).toLowerCase() === "true" ||
      String(v).toLowerCase() === "fixed"
    )
      return "fixed";
    if (
      v === false ||
      String(v).toLowerCase() === "false" ||
      String(v).toLowerCase() === "not fixed"
    )
      return "notfixed";
    return String(v || "")
      .trim()
      .toLowerCase() === "fixed"
      ? "fixed"
      : "";
  };

  // filter CVE items
  const cveMatches = (cve: any) => {
    const pkgPass =
      pkgFilter === "ALL" || (cve?.vulnSource ?? "").trim() === pkgFilter;

    const fixedNorm = normalizeFixed(cve?.fixed);
    const fixedPass =
      fixedFilter === "all" ||
      (fixedFilter === "fixed" && fixedNorm === "fixed") ||
      (fixedFilter === "notfixed" && fixedNorm !== "fixed");

    return pkgPass && fixedPass;
  };

  // sorted package options from the parsed scores
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

  // create tabs
  const tabs: TabItem[] = [];

  // --- CWE tab ---
  tabs.push({
    label: "CWE",
    content: (
      <Box className="st-root">
        <h3 className="st-h3">
          # of CWE Pillars: {scores.vulnerabilitySummary?.cweCount ?? 0}
        </h3>

        <div className="st-chips">
          <button
            className={`st-chip st-chip--critical ${
              bucket === "critical" ? "is-active" : ""
            }`}
            onClick={() => onChipClick("critical")}
            aria-pressed={bucket === "critical"}
          >
            <span className="st-chip-dot" />
            Critical (CWE pillar score &lt; 0.6)
            <span className="st-chip-count">{counts.critical}</span>
          </button>

          <button
            className={`st-chip st-chip--severe ${
              bucket === "severe" ? "is-active" : ""
            }`}
            onClick={() => onChipClick("severe")}
            aria-pressed={bucket === "severe"}
          >
            <span className="st-chip-dot" />
            Severe (CWE pillar score 0.6-0.8)
            <span className="st-chip-count">{counts.severe}</span>
          </button>

          <button
            className={`st-chip st-chip--moderate ${
              bucket === "moderate" ? "is-active" : ""
            }`}
            onClick={() => onChipClick("moderate")}
            aria-pressed={bucket === "moderate"}
          >
            <span className="st-chip-dot" />
            Moderate (CWE pillar score &gt; 0.8)
            <span className="st-chip-count">{counts.moderate}</span>
          </button>

          <button
            className={`st-chip st-chip--all ${
              bucket === "all" ? "is-active" : ""
            }`}
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
          const toggleExpand = () =>
            setExpandedCWEKey(isExpanded ? null : pf.name);

          return (
            <Box
              key={pf.name}
              className={`pf-card ${
                diffHints?.differingPFs.has(pf.name) ? "diff-outline" : ""
              }`}
              style={{ backgroundColor: setBackgroundColor(pf.value) }}
            >
              <h4 className="pf-title">
                {pf.name.replace("Product_Factor ", "")}
              </h4>
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
                          .slice() // don't mutate original
                          .sort(
                            (a: Measure, b: Measure) =>
                              Number(a.score ?? 0) - Number(b.score ?? 0)
                          )
                          .map((measure: Measure, idx: number) => (
                            <li
                              key={idx}
                              className={`measure-item ${
                                diffHints?.differingMeasures.has(
                                  `${pf.name}::${measure.name}`
                                )
                                  ? "diff-outline"
                                  : ""
                              }`}
                              style={{
                                backgroundColor: setBackgroundColor(
                                  measure.score
                                ),
                              }}
                            >
                              <strong>
                                {measure.name.replace(" Measure", "")}:
                              </strong>{" "}
                              {measure.description}
                              <ul>
                                <li>
                                  <strong>
                                    Score: {measure.score * 100}% better than
                                    the benchmark set.
                                  </strong>
                                </li>
                                <li>
                                  Weight: The CWE measure contributed a{" "}
                                  <strong>
                                    weight of {(measure.weight ?? 0).toFixed(4)}
                                  </strong>{" "}
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

  // --- CVE tab ---
  tabs.push({
    label: "CVE",
    content: (
      <Box className="st-root">
        <h3 className="st-h3">
          # of CVEs: {scores.vulnerabilitySummary?.cveCount ?? 0}
        </h3>
        <hr className="st-divider st-divider--narrow" />

        {/* Filters */}
        <div className="st-filters">
          <label className="st-filter">
            <span className="st-filter-label">Package</span>
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

        {(scores.cweProductFactors as PF[] | undefined)?.map((pf: PF) => {
          const cves = (pf.cves as CVEItem[] | undefined) ?? [];
          const filtered = cves.filter(cveMatches);
          if (filtered.length === 0) return null; // hide PF block if no CVEs match filters

          return (
            <Box key={pf.name}>
              {filtered.map((cve: CVEItem) => (
                <Box
                  key={cve.name}
                  className={`cve-card ${
                    diffHints?.differingCVEs.has(cve.name) ? "diff-outline" : ""
                  }`}
                >
                  <h4 className="cve-title">{cve.name}</h4>
                  <ul className="cve-list">
                    <li>
                      <strong>Package name:</strong> {cve.vulnSource || "—"}
                    </li>
                    <li>
                      <strong>Package version:</strong>{" "}
                      {cve.vulnSourceVersion || "—"}
                    </li>
                    <li>
                      <strong>Description:</strong>{" "}
                      {cve.description || "Coming soon"}
                    </li>
                    <li>
                      <strong>Fixed status:</strong> {cve.fixed || "Not fixed"}
                    </li>
                    <li>
                      <strong>Fixed version:</strong> {cve.fixedVersion || "—"}
                    </li>
                    <li>
                      <strong>Associated CWE pillar:</strong>{" "}
                      {pf.name.replace("Product_Factor ", "")}
                    </li>
                    <li>
                      <strong>Associated CWE measure:</strong>{" "}
                      {cve.CWEmeasureName?.replace("Measure", "")}
                    </li>
                    <li>
                      <strong>Tools used:</strong>{" "}
                      {cve.byTool.map((t: any) => t.tool).join(", ")}
                    </li>
                  </ul>
                  <div className="cve-chart-wrap">
                    <div className="cve-chart-caption">CVE Score</div>
                    <CVEScoreMiniChart byTool={cve.byTool} />
                  </div>
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>
    ),
  });

  // --- Vulnerable Lines of Code ---
  tabs.push({
    label: "Lines of Code",
    content: <h4>Coming soon</h4>,
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
          <button
            className="densityPlot-close"
            onClick={() => setPopoutKey(null)}
          >
            X
          </button>
          {(() => {
            const pf = (scores?.cweProductFactors as PF[] | undefined)?.find(
              (p: PF) => p.name === popoutKey.pfName
            );
            const m = pf?.measures?.[popoutKey.measureIndex] as
              | Measure
              | undefined;
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
