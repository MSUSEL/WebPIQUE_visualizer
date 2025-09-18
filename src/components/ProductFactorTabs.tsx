/// component to render quality-aspect Product Factors/CWEs, CVEs/Diagnostics, and LoC
import React, { useMemo, useState } from "react";
import { Box, Collapse } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import MuiTabs, { TabItem } from "../components/Tabs";
import { RelationalExtract } from "../Utilities/DataParser";
import ProbabilityDensity from "../components/ProbabilityDensity";
import ProbabilityCDF from "../components/ProbabilityCDF";
import CVEScoreMiniChart from "../components/CVEChart";
import "../styles/SecurityTabs.css";
import { DiffHints } from "../Utilities/fileDiff";

type ScoresType = any;
type PF = any;
type Measure = any;

type SecTabName = "PF" | "VULN_OR_DIAG" | "Lines of Code";

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

// ------- helpers -------
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
  if (score < 0.6)
    return {
      color: "#c5052fff",
      border: "solid",
      label: "Score < 0.6",
      icon: "🔴",
    };
  if (score < 0.8)
    return {
      color: "rgb(240,228,066)",
      border: "dashed",
      label: "Score 0.6–0.8",
      icon: "🟡",
    };
  return {
    color: "rgb(000,158,115)",
    border: "dotted",
    label: "Score ≥ 0.8",
    icon: "🟢",
  };
};

const isVulnId = (s?: string) => !!(s && /^(?:CVE|GHSA)-/i.test(s));
const normalizeFixed = (v: any): "Fixed" | "Not Fixed" | "" => {
  if (v === true) return "Fixed";
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "true" || s === "fixed") return "Fixed";
  if (s === "false" || s === "not fixed") return "Not Fixed";
  return "";
};
const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

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
  if (Array.isArray(pf?.measures) && pf.measures.length) return pf.measures; // full JSON
  if (!relational) return [];
  const candidates: string[] = [];
  if (pf?.id) candidates.push(String(pf.id));
  if (pf?.name) candidates.push(String(pf.name));
  const set = new Set(candidates);
  const edges = relational.pfMeasures.filter((e) => set.has(e.pfId));
  return edges
    .map((edge) => {
      const m = relational.measures.find((mm) => mm.id === edge.measureId);
      return m
        ? {
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
};
const firstThresholdsLen = (measures: any[]): number => {
  for (const m of measures ?? []) {
    const th: any = (m as any)?.thresholds ?? (m as any)?.threshold;
    if (Array.isArray(th) && th.length) return th.length;
  }
  return 0;
};

// CWE ID if present; otherwise strip boilerplate words.
const cleanAssocLabel = (s?: string) => {
  const txt = (s ?? "").trim();
  if (!txt) return "";

  // If there's a CWE token anywhere, prefer that exact token.
  const cwe = /CWE-[\w-]+/i.exec(txt);
  if (cwe) return cwe[0];

  // Otherwise remove leading/trailing boilerplate words
  let out = txt
    .replace(/^(Product[_\s-]*Factor|Pillar)\s*/i, "") // leading
    .replace(/\s*(Measure|Pillar)\s*$/i, ""); // trailing

  // Cosmetic: underscores to hyphens, squeeze spaces
  out = out.replace(/_/g, "-").replace(/\s+/g, " ").trim();
  return out;
};

// ---------- Component ----------
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
  // PFs for aspect
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

  // ---------- PF tab state ----------
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedKey = controlledMeasures ?? expandedLocal;
  const setExpandedKey = (key: string | null) => {
    if (controlledMeasures === undefined) setExpandedLocal(key);
    onMeausreChange?.(key);
  };

  const [expandedPlotsLocal, setExpandedPlotsLocal] = useState<
    Record<string, boolean>
  >({});
  const expandedPlots = controlledExpandedPlots ?? expandedPlotsLocal;
  const togglePlotLocal = (key: string) => {
    if (onTogglePlot) onTogglePlot(key);
    else setExpandedPlotsLocal((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const diffFilterVal = diffFilter ?? "all";
  const sortedPFs = useMemo(
    () =>
      [...aspectPFs].sort((a: PF, b: PF) => (a.value ?? 0) - (b.value ?? 0)),
    [aspectPFs]
  );

  // counts
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

  // Filtered PFs
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
          (diffHints?.differingMeasures &&
            measures.some((m) =>
              diffHints.differingMeasures.has(mkey(pf.name, m.name))
            ))
        );
      });
    }
    // unique
    return base.filter((pf: PF) => {
      const measures = measuresForPF(pf, relational);
      return (
        diffHints.missingPFs?.has(pf.name) ||
        (diffHints?.missingMeasures &&
          measures.some((m) =>
            diffHints.missingMeasures?.has(mkey(pf.name, m.name))
          ))
      );
    });
  }, [sortedPFs, bucket, diffHints, diffFilterVal, relational]);

  // ---------- PERF: precompute and sort measures per PF, and page big lists ----------
  const INITIAL_MEASURES = 30;
  const PAGE_MEASURES = 50;
  const [visibleByPF, setVisibleByPF] = useState<Record<string, number>>({});

  const measuresByPF = useMemo(() => {
    const map = new Map<string, any[]>();
    (aspectPFs ?? []).forEach((pf: any) => {
      const arr = measuresForPF(pf, relational)
        .slice()
        .sort(
          (a: Measure, b: Measure) =>
            Number(a.score ?? 0) - Number(b.score ?? 0)
        );
      map.set(pf.name, arr);
    });
    return map;
  }, [aspectPFs, relational]);

  // ---------- CVE/GHSA for THIS aspect only ----------
  type GroupedCVE = {
    id: string;
    title?: string;
    alias?: string;
    description?: string;
    severity?: string | number;
    fixed?: any;
    vulnSource?: string;
    vulnSourceVersion?: string;
    fixedVersion?: string;
    cwePillars?: string[];
    cweMeasures?: string[];
    byTool: any[];
    raw: any[];
  };

  // state for vulnerable package, fixed status, and cwe filters -- vulnerable package tab
  const [pkgLocal, setPkgLocal] = useState<string>("ALL");
  const pkgFilter = controlledPkgFilter ?? pkgLocal;
  const [fixedLocal, setFixedLocal] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );
  const fixedFilter = controlledFixedFilter ?? fixedLocal;
  const [pkgInput, setPkgInput] = useState("");
  const [cweLocal, setCweLocal] = useState<string>("ALL");
  const cweFilter = cweLocal; // uncontrolled (like pkgLocal)
  const [cweInput, setCweInput] = useState("");

  const cveMatches = (payload: { vulnSource?: string; fixed?: any }) => {
    const pkgPass =
      pkgFilter === "ALL" || (payload?.vulnSource ?? "").trim() === pkgFilter;
    const fixedNorm = normalizeFixed(payload?.fixed);
    const fixedPass =
      fixedFilter === "all" ||
      (fixedFilter === "fixed" && fixedNorm === "Fixed") ||
      (fixedFilter === "notfixed" && fixedNorm !== "Fixed");
    return pkgPass && fixedPass;
  };

  const pkgFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All packages" : opt),
    ignoreAccents: true,
    trim: true,
  });

  const groupedCves = useMemo<GroupedCVE[]>(() => {
    const groupedById = new Map<string, GroupedCVE>();
    if (!relational) return [];

    const pfNameById = new Map<string, string>();
    (relational.productFactors ?? []).forEach((p) =>
      pfNameById.set(p.id, p.name)
    );
    const measureNameById = new Map<string, string>();
    (relational.measures ?? []).forEach((m) =>
      measureNameById.set(m.id, m.name)
    );

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

      // restrict to this aspect
      const diagId = f.diagnosticId;
      const measureIds = diagToMeasures.get(diagId) ?? [];
      let inAspect = false;
      const pfNamesInAspect = new Set<string>();
      const measureNamesInAspect = new Set<string>();

      for (const mid of measureIds) {
        const pfs = measureToPFs.get(mid) ?? [];
        const anyInAspectHere = pfs.some((pfId) => aspectPfIdSet.has(pfId));
        if (!anyInAspectHere) continue;
        inAspect = true;

        // associated measures
        const mName = measureNameById.get(mid) ?? "";
        const mLabel = cleanAssocLabel(mName);
        if (mLabel) measureNamesInAspect.add(mLabel);

        // associated product factors
        for (const pfId of pfs) {
          if (!aspectPfIdSet.has(pfId)) continue;
          const pfName = pfNameById.get(pfId) ?? "";
          const pfLabel = cleanAssocLabel(pfName);
          if (pfLabel) pfNamesInAspect.add(pfLabel);
        }
      }
      if (!inAspect) continue;
      for (const mid of measureIds) {
        const pfs = measureToPFs.get(mid) ?? [];
        if (pfs.some((pfId) => aspectPfIdSet.has(pfId))) {
          inAspect = true;
          break;
        }
      }
      if (!inAspect) continue;

      let g = groupedById.get(id);
      if (!g) {
        g = {
          id,
          title: f.title ?? id,
          alias: f.alias ?? "",
          description: f.description ?? "",
          severity: undefined,
          fixed: f.fixed,
          vulnSource: (f.vulnSource ?? "").trim(),
          vulnSourceVersion: (f.vulnSourceVersion ?? "").trim(),
          fixedVersion: f.fixedVersion,
          byTool: (f.byTool ?? []).slice(),
          raw: [f],
          cwePillars: Array.from(pfNamesInAspect).sort(),
          cweMeasures: Array.from(measureNamesInAspect).sort(),
        };
        groupedById.set(id, g);
      } else {
        const existing = new Set(
          (g.byTool ?? []).map((t: any) => `${t.tool}|${t.score ?? ""}`)
        );
        for (const t of f.byTool ?? []) {
          const key = `${t.tool}|${t.score ?? ""}`;
          if (!existing.has(key)) {
            existing.add(key);
            (g.byTool ?? (g.byTool = [])).push(t);
          }
        }
        (g.raw ?? (g.raw = [])).push(f);
      }
      // union pillars/measures
      g.cwePillars ??= [];
      g.cweMeasures ??= [];
      for (const code of pfNamesInAspect)
        if (!g.cwePillars.includes(code)) g.cwePillars.push(code);
      for (const code of measureNamesInAspect)
        if (!g.cweMeasures.includes(code)) g.cweMeasures.push(code);
    }

    return Array.from(groupedById.values()).filter((g) => {
      const basePass = cveMatches({ vulnSource: g.vulnSource, fixed: g.fixed });
      if (!basePass) return false;
      if (cweFilter === "ALL") return true;

      const labels = [
        ...(g.cwePillars ?? []).map(cleanAssocLabel),
        ...(g.cweMeasures ?? []).map(cleanAssocLabel),
      ].filter(Boolean);

      return labels.includes(cweFilter);
    });
  }, [relational, aspectPfIdSet, pkgFilter, fixedFilter, cweFilter]);

  const packageOptions = useMemo(() => {
    const set = new Set<string>();
    groupedCves.forEach((g) => {
      const name = (g?.vulnSource ?? "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupedCves]);

  const allPkgOptions = useMemo(
    () => ["ALL", ...packageOptions],
    [packageOptions]
  );

  const cweOptions = useMemo(() => {
    const set = new Set<string>();
    groupedCves.forEach((g) => {
      (g.cwePillars ?? []).forEach((nm) => {
        const lab = cleanAssocLabel(nm);
        if (lab) set.add(lab);
      });
      (g.cweMeasures ?? []).forEach((nm) => {
        const lab = cleanAssocLabel(nm);
        if (lab) set.add(lab);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupedCves]);

  const allCweOptions = useMemo(() => ["ALL", ...cweOptions], [cweOptions]);

  // nicer “contains” matching
  const cweFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All CWEs" : opt),
    ignoreAccents: true,
    trim: true,
  });

  // ---------- Non-CVE Diagnostics for aspect ----------
  type DiagCard = {
    id: string;
    name: string;
    description?: string;
    toolName?: string;
    value?: number;
    measures: string[];
    productFactors: string[];
  };

  const nonCveDiagnostics = useMemo<DiagCard[]>(() => {
    if (!relational) return [];
    const measuresById = new Map(relational.measures.map((m) => [m.id, m]));
    const diagsById = new Map(relational.diagnostics.map((d) => [d.id, d]));
    const diagToMeasures = new Map<string, Set<string>>();
    relational.measureDiagnostics.forEach((e) => {
      const s = diagToMeasures.get(e.diagnosticId) ?? new Set<string>();
      s.add(e.measureId);
      diagToMeasures.set(e.diagnosticId, s);
    });
    const measureToPFs = new Map<string, Set<string>>();
    relational.pfMeasures.forEach((e) => {
      const s = measureToPFs.get(e.measureId) ?? new Set<string>();
      s.add(e.pfId);
      measureToPFs.set(e.measureId, s);
    });
    const pfNameById = new Map<string, string>();
    aspectPFs.forEach((pf: any) => {
      const id = String(pf?.id ?? pf?.name ?? "");
      if (id) pfNameById.set(id, String(pf?.name ?? id));
    });
    const diagHasFindings = new Set<string>();
    (relational.findings ?? []).forEach((f) =>
      diagHasFindings.add(f.diagnosticId)
    );

    const cards: DiagCard[] = [];
    const seen = new Set<string>();
    for (const [diagId, measureIdsSet] of diagToMeasures.entries()) {
      const diagRow = diagsById.get(diagId);
      const diagName = String(diagRow?.name ?? diagId);
      if (isVulnId(diagId) || isVulnId(diagName)) continue; // skip CVE/GHSA
      if (diagHasFindings.has(diagId)) continue; // skip if it actually has CVE/GHSA children

      const measureIds = Array.from(measureIdsSet);
      const pfNames = new Set<string>();
      const mNames = new Set<string>();
      for (const mid of measureIds) {
        const pfIds = Array.from(measureToPFs.get(mid) ?? []);
        const anyInAspect = pfIds.some((id) => aspectPfIdSet.has(id));
        if (!anyInAspect) continue;
        const m = measuresById.get(mid);
        if (m?.name) mNames.add(m.name);
        pfIds.forEach((id) => {
          if (aspectPfIdSet.has(id)) {
            const nm = pfNameById.get(id) ?? id;
            pfNames.add(nm);
          }
        });
      }
      if (pfNames.size === 0) continue;
      if (seen.has(diagId)) continue;
      seen.add(diagId);

      cards.push({
        id: diagId,
        name: diagName,
        description: diagRow?.description,
        toolName: diagRow?.toolName,
        value: diagRow?.value,
        measures: Array.from(mNames).sort(),
        productFactors: Array.from(pfNames).sort(),
      });
    }
    cards.sort(
      (a, b) =>
        (a.toolName || "").localeCompare(b.toolName || "") ||
        a.name.localeCompare(b.name)
    );
    return cards;
  }, [relational, aspectPFs, aspectPfIdSet]);

  // ---------- Tab labels & headers ----------
  const hasCWE = (aspectPFs ?? []).some(
    (pf: any) => typeof pf?.name === "string" && /cwe/i.test(pf.name)
  );
  const pfTabLabel = hasCWE ? "CWEs" : "Product Factors";
  const pfHeader = hasCWE
    ? `# of CWEs: ${sortedPFs.length ?? 0}`
    : `# of product factors: ${sortedPFs.length ?? 0}`;

  const hasPackageVulns = groupedCves.length > 0;
  const secondTabLabel = hasPackageVulns
    ? "Package Vulnerabilities"
    : "Diagnostics";
  const secondHeader = hasPackageVulns
    ? `# of package vulnerabilities: ${groupedCves.length}`
    : `# of findings: ${nonCveDiagnostics.length}`;

  const tabs: TabItem[] = [];

  // --- Tab 1: PFs ---
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
          const isExpanded = expandedKey === pf.name;
          const allMeasures = measuresByPF.get(pf.name) ?? [];
          const visibleCount =
            visibleByPF[pf.name] ??
            Math.min(INITIAL_MEASURES, allMeasures.length);
          const showMore = isExpanded && visibleCount < allMeasures.length;
          const toggleExpand = () => {
            setExpandedKey(isExpanded ? null : pf.name);
            if (!isExpanded) {
              // seed visible items on first open for snappy expand
              setVisibleByPF((v) => ({
                ...v,
                [pf.name]: Math.min(INITIAL_MEASURES, allMeasures.length),
              }));
            }
          };
          const pfDiff = diffHints?.pfFieldDiffs.get(pf.name);

          return (
            <Box
              key={pf.name}
              className="pf-card"
              style={{
                border: `2px ${getSeverityInfo(pf.value).border} ${
                  getSeverityInfo(pf.value).color
                }`,
              }}
            >
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
                          className={pfDiff?.benchmarkSize ? "diff-field" : ""}
                        >
                          {hereBench}
                        </span>
                        <Delta here={hereBench} peer={peerBench} places={0} />
                      </>
                    );
                  })()}
                </li>

                <li>
                  <div className="measure-toggle" onClick={toggleExpand}>
                    <span className="measure-toggle-label">
                      <strong>Measures</strong> (n = {allMeasures.length})
                      <strong>:</strong>
                    </span>
                    {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </div>

                  {isExpanded && (allMeasures?.length ?? 0) > 0 && (
                    <div className="measure-list">
                      <ul>
                        {(allMeasures as Measure[])
                          .slice(0, visibleCount)
                          .map((measure: Measure, idx: number) => {
                            const key = `${pf.name}::${measure.name}`;
                            const mDiff = diffHints?.measureFieldDiffs.get(key);
                            const isMissingMeasure =
                              diffHints?.missingMeasures?.has(key);
                            const id = key;
                            const thresholds = (measure.thresholds ??
                              measure.threshold ??
                              []) as number[];

                            if (
                              diffFilterVal === "differing" &&
                              !diffHints?.differingMeasures.has(key)
                            )
                              return null;
                            if (diffFilterVal === "unique" && !isMissingMeasure)
                              return null;

                            return (
                              <li
                                key={idx}
                                className="measure-item"
                                style={{
                                  border: `2px ${
                                    getSeverityInfo(measure.score).border
                                  } ${getSeverityInfo(measure.score).color}`,
                                  backgroundColor: "#fff",
                                }}
                              >
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
                                            mkey(pf.name, measure.name)
                                          )?.score
                                            ? "diff-field"
                                            : ""
                                        }
                                      >
                                        {measure.score.toFixed(4)} out of 1.
                                      </span>
                                    </strong>
                                    <Delta
                                      here={
                                        typeof measure?.score === "number"
                                          ? measure.score
                                          : null
                                      }
                                      peer={
                                        diffHints?.measurePeerValues?.get(
                                          mkey(pf.name, measure.name)
                                        ) ?? null
                                      }
                                    />
                                  </li>
                                  <li>
                                    <strong>Interpreted Score: </strong>
                                    <span>
                                      {(measure.score * 100).toFixed(2)}% better
                                      than the benchmark set.
                                    </span>
                                  </li>
                                  <li>
                                    Weight: The measure contributed a{" "}
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
                                    to the final product factor score.
                                    <Delta
                                      here={
                                        typeof measure?.weight === "number"
                                          ? measure.weight
                                          : null
                                      }
                                      peer={
                                        diffHints?.measurePeerWeights?.get(
                                          mkey(pf.name, measure.name)
                                        ) ?? null
                                      }
                                    />
                                  </li>
                                  <li>
                                    <div style={{ marginTop: 6 }}>
                                      <span
                                        className="density-link"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => togglePlotLocal(id)}
                                        onKeyDown={(e) =>
                                          e.key === "Enter"
                                            ? togglePlotLocal(id)
                                            : null
                                        }
                                        aria-expanded={!!expandedPlots[id]}
                                        aria-controls={`density-${id}`}
                                        style={{
                                          textDecoration: "underline",
                                          cursor: "pointer",
                                          marginRight: 16,
                                        }}
                                      >
                                        {expandedPlots[id]
                                          ? "Hide Plots"
                                          : "Show Plots"}
                                      </span>
                                    </div>

                                    <Collapse
                                      in={!!expandedPlots[id]}
                                      timeout={0}
                                      unmountOnExit
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
                                      <div
                                        className="densityPlot"
                                        id={`cdf-${id}`}
                                      >
                                        <ProbabilityCDF
                                          thresholds={thresholds}
                                          percentile={measure.score ?? 0}
                                          cweName={measure.name}
                                        />
                                      </div>
                                      <hr />
                                      <div>
                                        <strong>Top plot:</strong> Density of
                                        benchmark set with a horizontal line
                                        marking the area under the density curve
                                        that matches the measure score.{" "}
                                        <strong>Bottom plot:</strong> ECDF plot
                                        showing how much better the measure
                                        score is than the benchmark.
                                      </div>
                                    </Collapse>
                                  </li>
                                </ul>
                              </li>
                            );
                          })}
                      </ul>

                      {showMore && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            className="st-chip"
                            onClick={() =>
                              setVisibleByPF((v) => ({
                                ...v,
                                [pf.name]: Math.min(
                                  (v[pf.name] ?? INITIAL_MEASURES) +
                                    PAGE_MEASURES,
                                  allMeasures.length
                                ),
                              }))
                            }
                          >
                            Show {allMeasures.length - visibleCount} more
                          </button>
                        </div>
                      )}
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

  // --- Tab 2: Package Vulnerabilities (if any) else Diagnostics ---
  tabs.push({
    label: secondTabLabel,
    content: hasPackageVulns ? (
      <Box className="st-root">
        <h3 className="st-h3">{secondHeader}</h3>
        <hr className="st-divider st-divider--narrow" />

        {/* Filters ONLY when there are CVEs */}
        <div className="st-filters">
          <label className="st-filter">
            <span className="st-filter-label">Vulnerable Package</span>
            <Autocomplete
              sx={{ minWidth: 260 }}
              options={allPkgOptions}
              value={pkgFilter ?? "ALL"}
              onChange={(_, newValue) => {
                const v = (newValue ?? "ALL") as string;
                if (controlledPkgFilter === undefined) setPkgLocal(v);
                onPkgFilterChange?.(v);
              }}
              inputValue={pkgInput}
              onInputChange={(_, newInput) => setPkgInput(newInput)}
              getOptionLabel={(opt) => (opt === "ALL" ? "All packages" : opt)}
              filterOptions={pkgFilterOptions}
              clearOnBlur={false}
              autoSelect
              openOnFocus
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search packages…"
                  size="small"
                  className="st-filter-select"
                />
              )}
            />
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

          <label className="st-filter">
            <span className="st-filter-label">CWE lookup</span>
            <Autocomplete
              sx={{ minWidth: 260 }}
              options={allCweOptions}
              value={cweFilter}
              onChange={(_, v) => setCweLocal((v ?? "ALL") as string)}
              inputValue={cweInput}
              onInputChange={(_, v) => setCweInput(v)}
              getOptionLabel={(opt) => (opt === "ALL" ? "All CWEs" : opt)}
              filterOptions={cweFilterOptions}
              clearOnBlur={false}
              openOnFocus
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search CWEs…"
                  size="small"
                  className="st-filter-select"
                />
              )}
            />
          </label>

          <button
            className="st-filter-reset"
            onClick={() => {
              if (controlledPkgFilter === undefined) setPkgLocal("ALL");
              if (controlledFixedFilter === undefined) setFixedLocal("all");
              setPkgInput(""); // <= clear the search box
              onPkgFilterChange?.("ALL");
              onFixedFilterChange?.("all");
              setCweLocal("ALL");
              setCweInput("");
            }}
            title="Clear filters"
          >
            Reset
          </button>
        </div>

        <Box>
          {groupedCves.map((g) => {
            const byTool = g.byTool ?? [];
            return (
              <Box
                key={g.id}
                className="cve-card"
                style={{ position: "relative", marginLeft: "24px" }}
              >
                <h4 className="cve-title">{g.id}</h4>
                <strong>Related vulnerability ID:</strong> {g.alias || "None"}
                <ul className="cve-list">
                  <li>
                    <strong>Package name:</strong> {g.vulnSource || "—"}
                  </li>
                  <li>
                    <strong>Vulnerable Package Version:</strong>{" "}
                    {g.vulnSourceVersion || "—"}
                  </li>
                  <li>
                    <strong>Fixed Status:</strong>{" "}
                    {normalizeFixed(g.fixed ?? "").trim() || "Not fixed"}
                  </li>
                  {g.fixedVersion && (
                    <li>
                      <strong>Fixed Package Version(s):</strong>{" "}
                      {g.fixedVersion}
                    </li>
                  )}
                  <li>
                    <strong>Description:</strong> {g.description || "—"}
                  </li>
                  {g.cwePillars?.length ? (
                    <li>
                      <strong>Associated Product Factors:</strong>{" "}
                      {g.cwePillars.map(cleanAssocLabel).join(", ")}
                    </li>
                  ) : null}
                  {g.cweMeasures?.length ? (
                    <li>
                      <strong>Associated Measure(s):</strong>{" "}
                      {g.cweMeasures.map(cleanAssocLabel).join(", ")}
                    </li>
                  ) : null}
                  <li>
                    <strong>Finding Identified From: </strong>{" "}
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
    ) : (
      <Box className="st-root">
        <h3 className="st-h3">{secondHeader}</h3>
        <hr className="st-divider st-divider--narrow" />
        <Box>
          {nonCveDiagnostics.length === 0 ? (
            <div style={{ opacity: 0.7 }}>
              No diagnostics available for this aspect.
            </div>
          ) : (
            nonCveDiagnostics.map((d) => (
              <Box
                key={d.id}
                className="cve-card"
                style={{ position: "relative", marginLeft: "24px" }}
              >
                <h4 className="cve-title">{d.name}</h4>
                <ul className="cve-list">
                  <li>
                    <strong>Tool:</strong> {d.toolName || "—"}
                  </li>
                  <li>
                    <strong>Score Reported by Tool:</strong>{" "}
                    {typeof d.value === "number" ? d.value.toFixed(4) : "—"}
                  </li>
                  <li>
                    <strong>Associated Product factor(s):</strong>{" "}
                    {d.productFactors.join(", ")}
                  </li>
                  <li>
                    <strong>Associated Measure(s):</strong>{" "}
                    {d.measures.join(", ")}
                  </li>
                  {d.description && (
                    <li>
                      <strong>Description:</strong> {d.description}
                    </li>
                  )}
                </ul>
              </Box>
            ))
          )}
        </Box>
      </Box>
    ),
  });

  // --- Tab 3: Lines of Code Vulnerabilities (placeholder) ---
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

  // controlled/uncontrolled tab selection
  const [localTab, setLocalTab] = useState<SecTabName>("PF");
  const tabName: SecTabName = controlledTab ?? localTab;
  const nameToIndex = (name: SecTabName) =>
    name === "PF" ? 0 : name === "VULN_OR_DIAG" ? 1 : 2;
  const indexToName = (i: number): SecTabName =>
    i === 0 ? "PF" : i === 1 ? "VULN_OR_DIAG" : "Lines of Code";

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
