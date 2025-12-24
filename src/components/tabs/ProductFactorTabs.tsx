// ProductFactorTabs.tsx
// Uses FindingsTab and MeasuresDropdown.

import React, { useMemo, useState } from "react";
import { Box } from "@mui/material";
import MuiTabs, { TabItem } from "../tabs/Tabs";
import { RelationalExtract } from "../../Utilities/DataParser";
import "../../styles/SecurityTabs.css";
import { DiffHints } from "../../Utilities/fileDiff";

import FindingTab from "../tabs/FindingsTab";
import MeasuresDropdown from "../tabs/MeasuresDropdown";

type ScoresType = any;
type PF = any;
type Measure = any;

type SecTabName = "PF" | "VULN_OR_DIAG";

// ------- helpers (unchanged) -------
const bucketFor = (score: number): "critical" | "severe" | "moderate" =>
  score < 0.6 ? "critical" : score < 0.8 ? "severe" : "moderate";

type SeverityInfo = {
  color: string;
  border: string;
  label: string;
  icon: string;
};
const getSeverityInfo = (score: number): SeverityInfo =>
  score < 0.6
    ? { color: "#c5052fff", border: "solid", label: "Score < 0.6", icon: "🔴" }
    : score < 0.8
    ? {
        color: "rgb(240,228,066)",
        border: "dashed",
        label: "Score 0.6–0.8",
        icon: "🟡",
      }
    : {
        color: "rgb(000,158,115)",
        border: "dotted",
        label: "Score ≥ 0.8",
        icon: "🟢",
      };

const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

// de-dupe measures within PF
const measureKey = (m: any) =>
  (m?.id ?? String(m?.name ?? "")).toString().trim().toLowerCase();

const dedupeMeasuresForPF = <T extends { id?: string; name?: string }>(
  list: T[]
): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of list ?? []) {
    const key = measureKey(m);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
};

type FlagKind = "diff" | "unique" | null;

const flagForPF = (name: string, hints?: DiffHints): FlagKind =>
  !hints
    ? null
    : hints.missingPFs?.has(name)
    ? "unique"
    : hints.differingPFs?.has(name)
    ? "diff"
    : null;

const flagForPFIncludingMeasures = (
  pfName: string,
  measures: any[],
  hints?: DiffHints
): FlagKind => {
  if (!hints) return null;

  const direct = flagForPF(pfName, hints);
  if (direct) return direct;

  let hasDiff = false;
  let hasUnique = false;
  for (const m of measures ?? []) {
    const key = mkey(pfName, m.name);
    if (hints.differingMeasures?.has(key)) hasDiff = true;
    if (hints.missingMeasures?.has(key)) hasUnique = true;
    if (hasDiff) break;
  }
  return hasDiff ? "diff" : hasUnique ? "unique" : null;
};

const DiffBadge: React.FC<{ kind: FlagKind }> = ({ kind }) =>
  !kind ? null : (
    <span
      className={`diff-flag diff-flag--${kind}`}
      title={
        kind === "diff" ? "Differs from the other file" : "Only in this file"
      }
      aria-label={
        kind === "diff" ? "Differs from the other file" : "Only in this file"
      }
    >
      {kind === "diff" ? "🚩" : "‼️"}
    </span>
  );

const Delta: React.FC<{
  here?: number | null;
  peer?: number | null;
  places?: number;
}> = ({ here, peer, places = 4 }) => {
  if (typeof here !== "number" || typeof peer !== "number") return null;
  const delta = Number((here - peer).toFixed(places));
  if (Math.abs(delta) <= 1e-6) return null;
  const up = delta > 0;
  return (
    <span
      className={`pf-delta ${up ? "pf-delta--up" : "pf-delta--down"}`}
      title={up ? "Higher than other file" : "Lower than other file"}
      aria-label={up ? "Higher than other file" : "Lower than other file"}
    >
      {up ? "▲" : "▼"} ({delta > 0 ? `+${delta}` : delta})
    </span>
  );
};

// ---- relational fallback helpers ----
const measuresForPF = (pf: any, relational?: RelationalExtract): any[] => {
  if (Array.isArray(pf?.measures) && pf.measures.length) return pf.measures;
  if (!relational) return [];

  const ids = new Set<string>(
    [String(pf?.id ?? ""), String(pf?.name ?? "")].filter(Boolean) as string[]
  );
  const edges = relational.pfMeasures.filter((e) => ids.has(e.pfId));

  const list = edges
    .map((edge) => {
      const m = relational.measures.find((mm) => mm.id === edge.measureId);
      return m
        ? {
            id: m.id,
            name: m.name,
            description: m.description,
            score: m.value ?? 0,
            thresholds: Array.isArray(m.thresholds) ? m.thresholds : [],
            weight: edge.weight ?? 0,
            children: [],
          }
        : null;
    })
    .filter(Boolean) as any[];

  return dedupeMeasuresForPF(list);
};

const firstThresholdsLen = (measures: any[]): number => {
  for (const m of measures ?? []) {
    const th: any = (m as any)?.thresholds ?? (m as any)?.threshold;
    if (Array.isArray(th) && th.length) return th.length;
  }
  return 0;
};

// ---------- props ----------
type Props = {
  aspectName: string;
  scores: ScoresType;
  relational?: RelationalExtract;

  controlledTab?: SecTabName;
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

const ProductFactorTabs: React.FC<Props> = ({
  aspectName,
  scores,
  relational,
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
  const aspectPFs = useMemo<PF[]>(() => {
    const byAspect = (scores?.productFactorsByAspect ?? {}) as Record<
      string,
      PF[]
    >;
    const list = (byAspect?.[aspectName] ?? []) as PF[];
    if (list.length === 0 && /security/i.test(aspectName || ""))
      return (scores?.cweProductFactors ?? []) as PF[];
    return list;
  }, [scores, aspectName]);

  const aspectPfIdSet = useMemo(() => {
    const set = new Set<string>();
    aspectPFs.forEach((pf: any) => {
      if (pf?.id) set.add(String(pf.id));
      if (pf?.name) set.add(String(pf.name));
    });
    return set;
  }, [aspectPFs]);

  // controlled/uncontrolled tab selection
  const [localTab, setLocalTab] = useState<SecTabName>("PF");
  const tabName: SecTabName = controlledTab ?? localTab;

  // expanded PF selection (controlled/uncontrolled)
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedKey = controlledMeasures ?? expandedLocal;

  const setExpandedKey = (key: string | null) => {
    if (controlledMeasures === undefined) setExpandedLocal(key);
    onMeausreChange?.(key);
  };

  // plot expansion state (controlled/uncontrolled)
  const [expandedPlotsLocal, setExpandedPlotsLocal] = useState<
    Record<string, boolean>
  >({});
  const expandedPlots = controlledExpandedPlots ?? expandedPlotsLocal;

  const togglePlotLocal = (key: string) => {
    if (onTogglePlot) onTogglePlot(key);
    else setExpandedPlotsLocal((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const diffFilterVal = diffFilter ?? "all";

  const sortedPFs = useMemo(() => {
    const arr = [...aspectPFs];
    if (!diffHints)
      return arr.sort((a: PF, b: PF) => (a.value ?? 0) - (b.value ?? 0));

    const common = arr.filter((pf: PF) => !diffHints.missingPFs?.has(pf.name));
    const unique = arr.filter((pf: PF) => diffHints.missingPFs?.has(pf.name));
    const byName = (a: PF, b: PF) =>
      String(a.name || "").localeCompare(String(b.name || ""));
    common.sort(byName);
    unique.sort(byName);
    return [...common, ...unique];
  }, [aspectPFs, diffHints]);

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

  type Bucket = "all" | "critical" | "severe" | "moderate";
  const [bucketLocal, setBucketLocal] = useState<Bucket>("all");
  const bucket = controlledBucket ?? bucketLocal;

  const onChipClick = (next: Exclude<Bucket, "all">) => {
    const val: Bucket = bucket === next ? "all" : next;
    if (controlledBucket === undefined) setBucketLocal(val);
    onBucketChange?.(val);
  };

  const filteredPFs = useMemo(() => {
    const base =
      bucket === "all"
        ? sortedPFs
        : sortedPFs.filter((pf: PF) => bucketFor(pf.value) === bucket);

    if (!diffHints || diffFilterVal === "all") return base;

    if (diffFilterVal === "differing") {
      return base.filter((pf: PF) => {
        const measures = measuresForPF(pf, relational);
        return (
          diffHints.differingPFs.has(pf.name) ||
          measures.some((m) =>
            diffHints.differingMeasures?.has(mkey(pf.name, m.name))
          )
        );
      });
    }

    return base.filter((pf: PF) => {
      const measures = measuresForPF(pf, relational);
      return (
        diffHints.missingPFs?.has(pf.name) ||
        measures.some((m) =>
          diffHints.missingMeasures?.has(mkey(pf.name, m.name))
        )
      );
    });
  }, [sortedPFs, bucket, diffHints, diffFilterVal, relational]);

  // measures computed per PF (sorting preserved)
  const measuresByPF = useMemo(() => {
    const map = new Map<string, any[]>();
    (aspectPFs ?? []).forEach((pf: any) => {
      const base = dedupeMeasuresForPF(measuresForPF(pf, relational));

      let arr: any[] = [];
      if (!diffHints) {
        arr = base
          .slice()
          .sort(
            (a: any, b: any) => Number(a.score ?? 0) - Number(b.score ?? 0)
          );
      } else {
        const isMissing = (m: any) =>
          diffHints.missingMeasures?.has(mkey(pf.name, m.name));
        const common = base.filter((m) => !isMissing(m));
        const unique = base.filter((m) => isMissing(m));
        const byName = (a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""));
        common.sort(byName);
        unique.sort(byName);
        arr = [...common, ...unique];
      }

      map.set(pf.name, arr);
    });
    return map;
  }, [aspectPFs, relational, diffHints]);

  // paging state (preserved)
  const INITIAL_MEASURES = 30;
  const PAGE_MEASURES = 50;
  const [visibleByPF, setVisibleByPF] = useState<Record<string, number>>({});

  // PF tab labels
  const hasCWE = (aspectPFs ?? []).some(
    (pf: any) => typeof pf?.name === "string" && /cwe/i.test(pf.name)
  );
  const pfTabLabel = hasCWE ? "CWEs" : "Product Factors";
  const pfHeader = hasCWE
    ? `# of CWEs: ${sortedPFs.length ?? 0}`
    : `# of product factors: ${sortedPFs.length ?? 0}`;

  // compute Findings tab label (unchanged logic)
  const hasPackageVulns = useMemo(() => {
    if (!relational) return false;

    const diagToMeasures = new Map<string, string[]>();
    relational.measureDiagnostics.forEach((e) => {
      const arr = diagToMeasures.get(e.diagnosticId) ?? [];
      arr.push(e.measureId);
      diagToMeasures.set(e.diagnosticId, arr);
    });

    const measureToPFs = new Map<string, string[]>();
    relational.pfMeasures.forEach((e) => {
      const arr = measureToPFs.get(e.measureId) ?? [];
      arr.push(e.pfId);
      measureToPFs.set(e.measureId, arr);
    });

    for (const f of relational.findings ?? []) {
      const id = String(f.id ?? "").trim();
      if (!id) continue;
      if (!/^(?:CVE|GHSA)-/i.test(id)) continue;

      const midList = diagToMeasures.get(f.diagnosticId) ?? [];
      for (const mid of midList) {
        const pfs = measureToPFs.get(mid) ?? [];
        if (pfs.some((pfId) => aspectPfIdSet.has(pfId))) return true;
      }
    }
    return false;
  }, [relational, aspectPfIdSet]);

  const tabs: TabItem[] = [];

  tabs.push({
    label: pfTabLabel,
    content: (
      <Box className="st-root">
        <h3 className="st-h3">{pfHeader}</h3>

        <div className="st-chips">
          <button
            className={`st-chip ${bucket === "critical" ? "is-active" : ""}`}
            onClick={() => onChipClick("critical")}
            aria-pressed={bucket === "critical"}
          >
            <span /> 🔴 score &lt; 0.6{" "}
            <span className="st-chip-count">{counts.critical}</span>
          </button>

          <button
            className={`st-chip ${bucket === "severe" ? "is-active" : ""}`}
            onClick={() => onChipClick("severe")}
            aria-pressed={bucket === "severe"}
          >
            <span /> 🟡 score 0.6–0.8{" "}
            <span className="st-chip-count">{counts.severe}</span>
          </button>

          <button
            className={`st-chip ${bucket === "moderate" ? "is-active" : ""}`}
            onClick={() => onChipClick("moderate")}
            aria-pressed={bucket === "moderate"}
          >
            <span /> 🟢 score ≥ 0.8{" "}
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
            All<span className="st-chip-count">{counts.all}</span>
          </button>
        </div>

        {filteredPFs.map((pf: PF) => {
          const sev = getSeverityInfo(pf.value);
          const isExpanded = expandedKey === pf.name;
          const allMeasures = measuresByPF.get(pf.name) ?? [];

          const pfBadge = flagForPFIncludingMeasures(
            pf.name,
            allMeasures,
            diffHints
          );
          const pfDiff = diffHints?.pfFieldDiffs.get(pf.name);

          const visibleCount =
            visibleByPF[pf.name] ??
            Math.min(INITIAL_MEASURES, allMeasures.length);
          const hasMore = isExpanded && visibleCount < allMeasures.length;

          const toggleExpand = () => {
            setExpandedKey(isExpanded ? null : pf.name);
            if (!isExpanded) {
              setVisibleByPF((v) => ({
                ...v,
                [pf.name]: Math.min(INITIAL_MEASURES, allMeasures.length),
              }));
            }
          };

          const onShowMore = () => {
            setVisibleByPF((v) => ({
              ...v,
              [pf.name]: Math.min(
                (v[pf.name] ?? INITIAL_MEASURES) + PAGE_MEASURES,
                allMeasures.length
              ),
            }));
          };

          return (
            <Box
              key={pf.name}
              className="pf-card card--with-badge"
              style={{ border: `2px ${sev.border} ${sev.color}` }}
            >
              <div>
                <span className="icon">{sev.icon}</span>
                <span className="label">{sev.label}</span>
              </div>

              <h4 className="pf-title">
                {pf.name.replace("Product_Factor", "")}
                <DiffBadge kind={pfBadge} />
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
                  <Delta
                    here={pf.value}
                    peer={diffHints?.pfPeerValues?.get(pf.name) ?? null}
                  />
                </li>

                {pf.description && (
                  <li>
                    <strong>Description:</strong> <span>{pf.description}</span>
                  </li>
                )}

                <li>
                  <strong>Benchmark size: </strong>
                  {(() => {
                    const hereBench =
                      typeof pf?.benchmarkSize === "number"
                        ? pf.benchmarkSize
                        : firstThresholdsLen(allMeasures);

                    const peerRaw = diffHints?.pfPeerBenchmarkSize?.get(
                      pf.name
                    );
                    const peerBench =
                      typeof peerRaw === "number" ? peerRaw : null;

                    return (
                      <>
                        <span
                          className={
                            !diffHints?.missingPFs?.has(pf.name) &&
                            pfDiff?.benchmarkSize
                              ? "diff-field"
                              : ""
                          }
                        >
                          {hereBench}
                        </span>
                        <Delta here={hereBench} peer={peerBench} places={0} />
                      </>
                    );
                  })()}
                </li>

                {/* delegate inner logic to MeasuresDropdown */}
                <li>
                  <MeasuresDropdown
                    pfName={pf.name}
                    measures={allMeasures as Measure[]}
                    isExpanded={isExpanded}
                    onToggleExpanded={toggleExpand}
                    diffHints={diffHints}
                    diffFilter={diffFilterVal}
                    expandedPlots={expandedPlots}
                    onTogglePlot={togglePlotLocal}
                    visibleCount={visibleCount}
                    onShowMore={onShowMore}
                    hasMore={hasMore}
                  />
                </li>
              </ul>
            </Box>
          );
        })}
      </Box>
    ),
  });

  tabs.push({
    label: hasPackageVulns ? "Package Vulnerabilities" : "Diagnostics",
    content: (
      <FindingTab
        aspectName={aspectName}
        relational={relational}
        aspectPFs={aspectPFs}
        aspectPfIdSet={aspectPfIdSet}
        diffHints={diffHints}
        diffFilter={diffFilter}
        controlledPkgFilter={controlledPkgFilter}
        onPkgFilterChange={onPkgFilterChange}
        controlledFixedFilter={controlledFixedFilter}
        onFixedFilterChange={onFixedFilterChange}
      />
    ),
  });

  const nameToIndex = (name: SecTabName) => (name === "PF" ? 0 : 1);
  const indexToName = (i: number): SecTabName =>
    i === 0 ? "PF" : "VULN_OR_DIAG";

  return (
    <MuiTabs
      tabs={tabs}
      value={nameToIndex(tabName)}
      onChange={(i) => {
        const next = indexToName(i);
        if (controlledTab === undefined) setLocalTab(next);
        onTabChange?.(next);
      }}
    />
  );
};

export default ProductFactorTabs;
