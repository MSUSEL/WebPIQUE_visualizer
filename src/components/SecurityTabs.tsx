// component to render security qualtiy aspect CWE, CVE, and lines of code infomration
// unique to WebPIQUE
import React, { useMemo, useState } from "react";
import { Box } from "@mui/material";
import { Collapse } from "@mui/material";
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
  controlledExpandedPlots?: Record<string, boolean>;
  onTogglePlot?: (key: string) => void;
  diffHints?: DiffHints;
  diffFilter?: "all" | "differing" | "unique";
};

// ------- helpers used across tabs -------
const bucketFor = (score: number): "critical" | "severe" | "moderate" => {
  if (score < 0.6) return "critical";
  if (score < 0.8) return "severe";
  return "moderate";
};

type SeverityInfo = {
  color: string;
  border: string;
  label: string;
  icon: string;
};

const getSeverityInfo = (score: number): SeverityInfo => {
  if (score < 0.6) {
    return {
      color: "#c5052fff",
      border: "solid",
      label: "CWE score below < 0.6",
      icon: "🔴",
    };
  } else if (score < 0.8) {
    return {
      color: "rgb(240,228,066)",
      border: "dashed",
      label: "CWE score between 0.6-0.8",
      icon: "🟡",
    };
  } else {
    return { color: "rgb(000,158,115)", border: "dotted", label: "CWE score > 0.8", icon: "🟢" };
  }
};

// normalize CVE fixed status
const normalizeFixed = (v: any): "fixed" | "notfixed" | "" => {
  if (v === true) return "fixed";
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "true" || s === "fixed") return "fixed";
  if (s === "false" || s === "not fixed") return "notfixed";
  return "";
};

// extract CWE pillar id from PF name
const extractPillarId = (pfName: string): string | null => {
  const m = /CWE-(\d+)/.exec(pfName || "");
  return m ? `CWE-${m[1]}` : null;
};

// normalize various CWE measure field formats
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
  controlledExpandedPlots,
  onTogglePlot,
  diffHints,
  diffFilter,
}) => {
  // ---------- CWE tab state ----------
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedCWEKey = controlledMeasures ?? expandedLocal;
  const setExpandedCWEKey = (key: string | null) => {
    if (controlledMeasures === undefined) setExpandedLocal(key);
    onMeausreChange?.(key);
  };

  // track which plots are expanded: key = `${pf.name}::${measure.name}`
  const [expandedPlotsLocal, setExpandedPlotsLocal] = React.useState<
    Record<string, boolean>
  >({});

  const expandedPlots = controlledExpandedPlots ?? expandedPlotsLocal;
  const togglePlot = (key: string) => {
    if (onTogglePlot) {
      onTogglePlot(key);
    } else {
      setExpandedPlotsLocal((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const diffFilterVal = diffFilter ?? "all";

  const sortedPFs = [...((scores.cweProductFactors ?? []) as PF[])].sort(
    (a: PF, b: PF) => (a.value ?? 0) - (b.value ?? 0)
  );

  // counts for each severity bucket
  const counts = useMemo(
    () => ({
      critical: sortedPFs.filter(
        (pf: PF) => pf?.value != null && pf.value < 0.6
      ).length,
      severe: sortedPFs.filter(
        (pf: PF) => pf?.value != null && pf.value >= 0.6 && pf.value < 0.8
      ).length,
      moderate: sortedPFs.filter(
        (pf: PF) => pf?.value != null && pf.value >= 0.8
      ).length,
      all: sortedPFs.length,
    }),
    [sortedPFs]
  );

  // toggle chips (critical / severe / moderate / all)
  type Bucket = "all" | "critical" | "severe" | "moderate";
  const onChipClick = (next: Exclude<Bucket, "all">) => {
    const val: Bucket = bucket === next ? "all" : next;
    if (controlledBucket === undefined) setBucketLocal(val);
    onBucketChange?.(val);
  };

  const [bucketLocal, setBucketLocal] = useState<Bucket>("all");
  const bucket = controlledBucket ?? bucketLocal;

  const filteredPFs = useMemo(() => {
    const base =
      bucket === "all"
        ? sortedPFs
        : sortedPFs.filter((pf: PF) => bucketFor(pf.value) === bucket);

    if (!diffHints || diffFilterVal === "all") return base;

    if (diffFilterVal === "differing") {
      return base.filter(
        (pf: PF) =>
          diffHints.differingPFs.has(pf.name) ||
          (pf.measures ?? []).some((m: any) =>
            diffHints.differingMeasures.has(`${pf.name}::${m?.name}`)
          )
      );
    }

    // "unique"
    return base.filter(
      (pf: PF) =>
        diffHints.missingPFs?.has(pf.name) ||
        (pf.measures ?? []).some((m: any) =>
          diffHints.missingMeasures?.has(`${pf.name}::${m?.name}`)
        )
    );
  }, [sortedPFs, bucket, diffHints, diffFilterVal]);

  // ---------- CVE tab state ----------
  const [pkgLocal, setPkgLocal] = useState<string>("ALL");
  const pkgFilter = controlledPkgFilter ?? pkgLocal;

  const [fixedLocal, setFixedLocal] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );
  const fixedFilter = controlledFixedFilter ?? fixedLocal;

  // create the "Vulnerable Package" filter options
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

  // group CVEs by CVE-ID and aggregate CWE pillars & measures
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
        const existingKeys = new Set(
          g.byTool.map((t: any) => `${t.tool}|${t.score ?? ""}`)
        );
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

    // apply filters to grouped result
    return Array.from(groupedById.values()).filter((g) =>
      cveMatches({ vulnSource: g.vulnSource, fixed: g.fixed })
    );
  }, [scores, pkgFilter, fixedFilter]);

  const filteredGroupedCves = useMemo(() => {
    if (!diffHints || diffFilterVal === "all") return groupedCves;
    if (diffFilterVal === "differing") {
      return groupedCves.filter((g) => diffHints.differingCVEs.has(g.id));
    }
    // "unique"
    return groupedCves.filter((g) => diffHints.missingCVEs?.has(g.id));
  }, [groupedCves, diffHints, diffFilterVal]);

  // ---------- TABS ----------
  const tabs: TabItem[] = [];

  // --- CWE tab ---
  tabs.push({
    label: "CWEs",
    content: (
      <Box className="st-root">
        <h3 className="st-h3"># of CWE Pillars: {sortedPFs.length ?? 0}</h3>

        <div className="st-chips">
          <button
            className={`st-chip ${bucket === "critical" ? "is-active" : ""}`}
            onClick={() => onChipClick("critical")}
            aria-pressed={bucket === "critical"}
          >
            <span />
            🔴 CWE score &lt; 0.6
            <span className="st-chip-count">{counts.critical}</span>
          </button>

          <button
            className={`st-chip ${bucket === "severe" ? "is-active" : ""}`}
            onClick={() => onChipClick("severe")}
            aria-pressed={bucket === "severe"}
          >
            <span />
            🟡 CWE score between 0.6-0.8
            <span className="st-chip-count">{counts.severe}</span>
          </button>

          <button
            className={`st-chip ${bucket === "moderate" ? "is-active" : ""}`}
            onClick={() => onChipClick("moderate")}
            aria-pressed={bucket === "moderate"}
          >
            <span />
            🟢 CWE score &gt; 0.8
            <span className="st-chip-count">{counts.moderate}</span>
          </button>

          <button
            className={`st-chip st-chip--all ${bucket === "all" ? "is-active" : ""
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
          const pfDiff = diffHints?.pfFieldDiffs.get(pf.name);

          return (
            <Box
              key={pf.name}
              className="pf-card"
              style={{
                border: `2px ${getSeverityInfo(pf.value).border} ${getSeverityInfo(pf.value).color}`,
              }}
            >
              {diffHints?.missingPFs?.has(pf.name) ? (
                <span className="diff-indicator-left" aria-hidden="true">
                  ‼️
                </span>
              ) : diffHints?.differingPFs.has(pf.name) ? (
                <span className="diff-arrow-left" aria-hidden="true">
                  🚩
                </span>
              ) : null}

              <div>
                <span className="icon">{getSeverityInfo(pf.value).icon}</span>
                <span className="label">{getSeverityInfo(pf.value).label}</span>
              </div>

              <h4 className="pf-title">
                {pf.name.replace("Product_Factor", "")}
              </h4>

              <ul className="pf-list">
                <li>
                  <strong>Score:</strong>{" "}
                  <span
                    className={
                      !diffHints?.missingPFs?.has(pf.name) &&
                        diffHints?.pfFieldDiffs.get(pf.name)?.value
                        ? "diff-field"
                        : ""
                    }
                  >
                    {pf.value.toFixed(4)} out of 1
                  </span>
                  {/* add arrow marker to indicate if score is greater or lower than other pane */}
                  {(() => {
                    const peer = diffHints?.pfPeerValues?.get(pf.name);
                    const here =
                      typeof pf?.value === "number" ? pf.value : null;
                    if (typeof peer === "number" && typeof here === "number") {
                      const delta = Number((here - peer).toFixed(4));
                      if (Math.abs(delta) > 1e-6) {
                        const up = delta > 0;
                        return (
                          <span
                            className={`pf-delta ${up ? "pf-delta--up" : "pf-delta--down"
                              }`}
                            title={
                              up
                                ? "Higher than other file"
                                : "Lower than other file"
                            }
                            aria-label={
                              up
                                ? "Higher than other file"
                                : "Lower than other file"
                            }
                          >
                            {up ? "▲" : "▼"} ({delta > 0 ? `+${delta}` : delta}){" "}
                            {/* marker and +/- value change */}
                          </span>
                        );
                      }
                    }
                    return null;
                  })()}
                </li>
                <li>
                  <strong>Description:</strong>{" "}
                  <span>
                    {pf.description}
                  </span>
                </li>
                <li>
                  <strong>Benchmark size: </strong>
                  <span className={pfDiff?.benchmarkSize ? "diff-field" : ""}>
                    {pf.benchmarkSize ?? pf.measures?.[0]?.threshold?.length ?? 0}
                  </span>
                  {/* add arrow marker to indicate if benchmark size is greater or lower than other pane */}
                  {(() => {
                    const peer = diffHints?.pfPeerValues?.get(pf.benchmarkSize);
                    const here =
                      typeof pf?.benchmarkSize === "number" ? pf.benchmarkSize : null;
                    if (typeof peer === "number" && typeof here === "number") {
                      const delta = Number((here - peer));
                      if (Math.abs(delta) > 1e-6) {
                        const up = delta > 0;
                        return (
                          <span
                            className={`pf-delta ${up ? "pf-delta--up" : "pf-delta--down"
                              }`}
                            title={
                              up
                                ? "Higher than other file"
                                : "Lower than other file"
                            }
                            aria-label={
                              up
                                ? "Higher than other file"
                                : "Lower than other file"
                            }
                          >
                            {up ? "▲" : "▼"} ({delta > 0 ? `+${delta}` : delta}){" "}
                            {/* marker and +/- value change */}
                          </span>
                        );
                      }
                    }
                    return null;
                  })()}
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
                          .map((measure: Measure, idx: number) => {
                            const key = `${pf.name}::${measure.name}`;
                            const mDiff = diffHints?.measureFieldDiffs.get(key);
                            const isMissingMeasure =
                              diffHints?.missingMeasures?.has(key);
                            const id = `${pf.name}::${measure.name}`;
                            const thresholds = (measure.thresholds ??
                              measure.threshold ??
                              []) as number[];

                            // legend filter for measures
                            if (
                              diffFilterVal === "differing" &&
                              !diffHints?.differingMeasures.has(key)
                            ) {
                              return null;
                            }
                            if (
                              diffFilterVal === "unique" &&
                              !isMissingMeasure
                            ) {
                              return null;
                            }

                            return (
                              <li
                                key={idx}
                                className="measure-item"
                                style={{
                                  border: `2px ${getSeverityInfo(measure.score).border} ${getSeverityInfo(measure.score).color
                                    }`,
                                  backgroundColor: "#fff",
                                }}
                              >
                                {isMissingMeasure ? (
                                  <span
                                    className="diff-indicator-left"
                                    aria-hidden="true"
                                  >
                                    ‼️
                                  </span>
                                ) : diffHints?.differingMeasures.has(key) ? (
                                  <span
                                    className="diff-arrow-left"
                                    aria-hidden="true"
                                  >
                                    🚩
                                  </span>
                                ) : null}
                                <div className="severity-badge">
                                  <span className="icon">
                                    {getSeverityInfo(measure.score).icon}
                                  </span>
                                  <span className="label">
                                    {getSeverityInfo(measure.score).label}
                                  </span>
                                </div>
                                <strong>
                                  {measure.name.replace(" Measure", "")}:
                                </strong>{" "}
                                {measure.description}
                                <ul>
                                  <li>
                                    <strong>
                                      Score:{" "}
                                      <span
                                        className={
                                          diffHints?.measureFieldDiffs?.get(
                                            `${pf.name}::${measure.name}`
                                          )?.score
                                            ? "diff-field"
                                            : ""
                                        }
                                      >
                                        {measure.score.toFixed(4)} out of 1.
                                      </span>
                                    </strong>

                                    {/* Δ vs other pane for this measure */}
                                    {(() => {
                                      const key = `${pf.name}::${measure.name}`;
                                      const peer =
                                        diffHints?.measurePeerValues?.get(key);
                                      const here =
                                        typeof measure?.score === "number"
                                          ? measure.score
                                          : null;
                                      if (
                                        typeof peer === "number" &&
                                        typeof here === "number"
                                      ) {
                                        const delta = Number(
                                          (here - peer).toFixed(4)
                                        );
                                        if (Math.abs(delta) > 1e-6) {
                                          const up = delta > 0;
                                          return (
                                            <span
                                              className={`pf-delta ${up
                                                ? "pf-delta--up"
                                                : "pf-delta--down"
                                                }`}
                                              title={
                                                up
                                                  ? "Higher than other file"
                                                  : "Lower than other file"
                                              }
                                              aria-label={
                                                up
                                                  ? "Higher than other file"
                                                  : "Lower than other file"
                                              }
                                            >
                                              {up ? "▲" : "▼"} (
                                              {delta > 0 ? `+${delta}` : delta})
                                            </span>
                                          );
                                        }
                                      }
                                      return null;
                                    })()}
                                  </li>

                                  <li>
                                    <strong>Interpreted Score: </strong>
                                    <span>
                                      {measure.score.toFixed(4) * 100}% better then the
                                      benchmark set.
                                    </span>
                                  </li>

                                  <li>
                                    Weight: The CWE measure contributed a{" "}
                                    <strong>
                                      <span
                                        className={
                                          !isMissingMeasure && mDiff?.weight
                                            ? "diff-field"
                                            : ""
                                        }
                                      >
                                        {(measure.weight ?? 0).toFixed(4)}
                                      </span>
                                    </strong>{" "}
                                    to the final CWE pillar score.

                                    {(() => {
                                      const peer = diffHints?.measurePeerValues?.get(measure.weight);
                                      const here =
                                        typeof measure?.weight === "number" ? measure?.weight : null;
                                      if (typeof peer === "number" && typeof here === "number") {
                                        const delta = Number((here - peer));
                                        if (Math.abs(delta) > 1e-6) {
                                          const up = delta > 0;
                                          return (
                                            <span
                                              className={`pf-delta ${up ? "pf-delta--up" : "pf-delta--down"
                                                }`}
                                              title={
                                                up
                                                  ? "Higher than other file"
                                                  : "Lower than other file"
                                              }
                                              aria-label={
                                                up
                                                  ? "Higher than other file"
                                                  : "Lower than other file"
                                              }
                                            >
                                              {up ? "▲" : "▼"} ({delta > 0 ? `+${delta}` : delta}){" "}
                                              {/* marker and +/- value change */}
                                            </span>
                                          );
                                        }
                                      }
                                      return null;
                                    })()}
                                  </li>

                                  <li>
                                    <div style={{ marginTop: 6 }}>
                                      <span
                                        className="density-link"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => togglePlot(id)}
                                        onKeyDown={(e) =>
                                          e.key === "Enter"
                                            ? togglePlot(id)
                                            : null
                                        }
                                        aria-expanded={!!expandedPlots[id]}
                                        aria-controls={`density-${id}`}
                                        style={{
                                          textDecoration: "underline",
                                          cursor: "pointer",
                                        }}
                                      >
                                        {expandedPlots[id]
                                          ? "Hide Density Plot"
                                          : "Show Density Plot"}
                                      </span>
                                    </div>
                                    <Collapse
                                      in={!!expandedPlots[id]}
                                      timeout={250}
                                    >
                                      <div
                                        className="densityPlot"
                                        id={`density-${id}`}
                                      >
                                        <ProbabilityDensity
                                          thresholds={thresholds}
                                          score={measure.score ?? 0}
                                          cweName={measure.name}
                                        />
                                      </div>
                                    </Collapse>
                                  </li>
                                </ul>
                              </li>
                            );
                          })}
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
        <h3 className="st-h3">
          # of Package Vulnerabilities:{" "}
          {scores.vulnerabilitySummary?.cveCount ?? groupedCves.length}
        </h3>
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

        {/* grouped CVE cards */}
        <Box>
          {filteredGroupedCves.map((g) => {
            const byTool = g.byTool ?? [];
            const cveDiff = diffHints?.cveFieldDiffs.get(g.id);
            const isMissingCVE = diffHints?.missingCVEs?.has(g.id);

            return (
              <Box
                key={g.id}
                className="cve-card"
                style={{ position: "relative", marginLeft: "24px" }}
              >
                {diffHints?.missingCVEs?.has(g.id) ? (
                  <span className="diff-indicator-left" aria-hidden="true">
                    ‼️
                  </span>
                ) : diffHints?.differingCVEs.has(g.id) ? (
                  <span className="diff-arrow-left" aria-hidden="true">
                    🚩
                  </span>
                ) : null}

                <h4 className="cve-title">{g.id}</h4>
                <ul className="cve-list">
                  <li>
                    <strong>Package name:</strong>{" "}
                    <span
                      className={
                        !isMissingCVE && cveDiff?.pkg ? "diff-field" : ""
                      }
                    >
                      {g.vulnSource || "—"}
                    </span>
                  </li>
                  <li>
                    <strong>Vulnerable Package version:</strong>{" "}
                    <span
                      className={
                        !isMissingCVE && cveDiff?.vulnVer ? "diff-field" : ""
                      }
                    >
                      {g.vulnSourceVersion || "—"}
                    </span>
                  </li>
                  <li>
                    <strong>Fixed status:</strong>{" "}
                    <span
                      className={
                        !isMissingCVE && cveDiff?.fixed ? "diff-field" : ""
                      }
                    >
                      {String(g.fixed ?? "").trim() || "Not fixed"}
                    </span>
                  </li>
                  {g.title && (
                    <li>
                      <strong>Fixed Package Version(s):</strong>{" "}
                      <span
                        className={
                          !isMissingCVE && cveDiff?.fixedVer ? "diff-field" : ""
                        }
                      >
                        {g.fixedVersion}
                      </span>
                    </li>
                  )}
                  <li>
                    <strong>Description:</strong>{" "}
                    {g.description || "Coming soon"}
                  </li>
                  <li>
                    <strong>Associated CWE pillar(s):</strong>{" "}
                    {g.cwePillars.size
                      ? Array.from(g.cwePillars).sort().join(", ")
                      : "—"}
                  </li>
                  <li>
                    <strong>Associated CWE measure(s):</strong>{" "}
                    {g.cweMeasures.size
                      ? Array.from(g.cweMeasures).sort().join(", ")
                      : "—"}
                  </li>
                  <li>
                    <strong>Findings identified from: </strong>{" "}
                    {byTool.length
                      ? Array.from(
                        new Set(byTool.map((t: any) => t.tool))
                      ).join(", ")
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
    </>
  );
};

export default SecurityTabs;
