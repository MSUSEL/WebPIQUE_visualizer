// ProductFactorTabs.tsx
// Uses FindingsTab and MeasuresDropdown.

import React, { useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import SettingsIcon from "@mui/icons-material/Settings";
import MuiTabs, { TabItem } from "../tabs/Tabs";
import { RelationalExtract } from "../../Utilities/DataParser";
import { DiffHints } from "../../Utilities/fileDiff";

import FindingTab from "../tabs/FindingsTab";
import MeasuresDropdown from "../tabs/MeasuresDropdown";

type ScoresType = any;
type PF = any;
type Measure = any;

type SecTabName = "PF" | "VULN_OR_DIAG";
type ScoreBucket = "critical" | "severe" | "moderate";
type Bucket = "all" | ScoreBucket;

type ScoreThresholds = {
  criticalMax: number;
  severeMax: number;
};

// ------- helpers (unchanged) -------
const clamp = (val: number, min: number, max: number) =>
  Math.min(max, Math.max(min, val));

const formatThreshold = (val: number) => {
  const rounded = Number(val.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const bucketFor = (score: number, thresholds: ScoreThresholds): ScoreBucket =>
  score < thresholds.criticalMax
    ? "critical"
    : score < thresholds.severeMax
      ? "severe"
      : "moderate";

type SeverityInfo = {
  color: string;
  border: string;
  label: string;
  kind: ScoreBucket;
};
const getSeverityInfo = (
  score: number,
  thresholds: ScoreThresholds
): SeverityInfo =>
  score < thresholds.criticalMax
    ? {
      color: "#c5052fff",
      border: "solid",
      label: `Score < ${formatThreshold(thresholds.criticalMax)}`,
      kind: "critical",
    }
    : score < thresholds.severeMax
      ? {
        color: "rgb(240,228,066)",
        border: "dashed",
        label: `Score ${formatThreshold(
          thresholds.criticalMax
        )}-${formatThreshold(thresholds.severeMax)}`,
        kind: "severe",
      }
      : {
        color: "rgb(000,158,115)",
        border: "dotted",
        label: `Score >= ${formatThreshold(thresholds.severeMax)}`,
        kind: "moderate",
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

// de-dupe PFs within an aspect (keep a union of PF ids/names and measures)
const pfKey = (pf: any) =>
  String(pf?.name ?? pf?.id ?? "").toString().trim().toLowerCase();

const dedupePFs = <
  T extends {
    id?: string;
    name?: string;
    measures?: any[];
    description?: string;
    value?: number;
  }
>(
  list: T[]
): (T & { __ids?: string[] })[] => {
  const map = new Map<string, T & { __ids?: string[] }>();
  for (const pf of list ?? []) {
    const key = pfKey(pf);
    if (!key) continue;

    const existing = map.get(key);
    const ids = [
      String(pf?.id ?? "").trim(),
      String(pf?.name ?? "").trim(),
    ].filter(Boolean);

    if (!existing) {
      map.set(key, { ...pf, __ids: Array.from(new Set(ids)) });
      continue;
    }

    const nextIds = new Set([...(existing.__ids ?? []), ...ids]);
    existing.__ids = Array.from(nextIds);

    if (!existing.name && pf.name) existing.name = pf.name;
    if (!existing.description && (pf as any)?.description)
      (existing as any).description = (pf as any).description;

    if (typeof existing.value !== "number" && typeof (pf as any)?.value === "number")
      (existing as any).value = (pf as any).value;
    else if (
      typeof existing.value === "number" &&
      typeof (pf as any)?.value === "number"
    )
      (existing as any).value = Math.min(existing.value, (pf as any).value);

    const existingMeasures = Array.isArray((existing as any).measures)
      ? (existing as any).measures
      : [];
    const nextMeasures = Array.isArray((pf as any).measures)
      ? (pf as any).measures
      : [];
    if (nextMeasures.length) {
      (existing as any).measures = dedupeMeasuresForPF([
        ...existingMeasures,
        ...nextMeasures,
      ]);
    }
  }

  return Array.from(map.values());
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

const DiffBadge: React.FC<{ kind: FlagKind; className?: string }> = ({
  kind,
  className,
}) =>
  !kind ? null : (
    <span
      className={`absolute left-[-2rem] top-2 text-[1.5rem] leading-none drop-shadow-[0_0_1px_rgba(0,0,0,0.25)] ${className ?? ""
        }`}
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
      className={`ml-2 whitespace-nowrap font-semibold ${up ? "text-[#188038]" : "text-[#d93025]"
        }`}
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
    [
      String(pf?.id ?? ""),
      String(pf?.name ?? ""),
      ...(((pf as any)?.__ids ?? []) as string[]),
    ]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean) as string[]
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
      return dedupePFs((scores?.cweProductFactors ?? []) as PF[]);
    return dedupePFs(list);
  }, [scores, aspectName]);

  const aspectPfIdSet = useMemo(() => {
    const set = new Set<string>();
    aspectPFs.forEach((pf: any) => {
      if (pf?.id) set.add(String(pf.id));
      if (pf?.name) set.add(String(pf.name));
      (pf?.__ids ?? []).forEach((id: string) => {
        if (id) set.add(String(id));
      });
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

  const [scoreThresholds, setScoreThresholds] = useState<ScoreThresholds>({
    criticalMax: 0.6,
    severeMax: 0.8,
  });
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [thresholdInputs, setThresholdInputs] = useState(() => ({
    criticalMax: formatThreshold(0.6),
    severeMax: formatThreshold(0.8),
  }));
  const [activeThresholdInput, setActiveThresholdInput] = useState<
    keyof ScoreThresholds | null
  >(null);

  const updateThreshold = (key: keyof ScoreThresholds, rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    setScoreThresholds((prev) => {
      const next = {
        ...prev,
        [key]: clamp(rawValue, 0, 1),
      };

      if (next.criticalMax >= next.severeMax) {
        if (key === "criticalMax") {
          next.criticalMax = clamp(next.severeMax - 0.01, 0, 0.99);
        } else {
          next.severeMax = clamp(next.criticalMax + 0.01, 0.01, 1);
        }
      }

      return next;
    });
  };

  useEffect(() => {
    if (activeThresholdInput !== "criticalMax") {
      setThresholdInputs((prev) => ({
        ...prev,
        criticalMax: formatThreshold(scoreThresholds.criticalMax),
      }));
    }
    if (activeThresholdInput !== "severeMax") {
      setThresholdInputs((prev) => ({
        ...prev,
        severeMax: formatThreshold(scoreThresholds.severeMax),
      }));
    }
  }, [scoreThresholds, activeThresholdInput]);

  const onThresholdInputChange = (
    key: keyof ScoreThresholds,
    rawValue: string
  ) => {
    setThresholdInputs((prev) => ({ ...prev, [key]: rawValue }));
    if (rawValue === "" || rawValue === "-" || rawValue === "." || rawValue === "-.")
      return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    updateThreshold(key, parsed);
  };

  const onThresholdInputBlur = (key: keyof ScoreThresholds) => {
    setActiveThresholdInput(null);
    const rawValue = thresholdInputs[key];
    if (rawValue === "" || rawValue === "-" || rawValue === "." || rawValue === "-.")
      return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    updateThreshold(key, parsed);
  };

  const resetThresholds = () => {
    setScoreThresholds({
      criticalMax: 0.6,
      severeMax: 0.8,
    });
  };

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

  const counts = useMemo(() => {
    const tally = {
      critical: 0,
      severe: 0,
      moderate: 0,
      all: sortedPFs.length,
    };
    sortedPFs.forEach((pf: PF) => {
      if (pf?.value == null) return;
      tally[bucketFor(pf.value, scoreThresholds)] += 1;
    });
    return tally;
  }, [sortedPFs, scoreThresholds]);

  const [bucketLocal, setBucketLocal] = useState<Bucket>("all");
  const bucket = controlledBucket ?? bucketLocal;

  const pfDisplayName = (name?: string) =>
    String(name ?? "").replace("Product_Factor", "").trim();

  const [pfLookupLocal, setPfLookupLocal] = useState<string>("ALL");
  const pfLookupFilter = pfLookupLocal;
  const [pfLookupInput, setPfLookupInput] = useState("");

  const onChipClick = (next: Exclude<Bucket, "all">) => {
    const val: Bucket = bucket === next ? "all" : next;
    if (controlledBucket === undefined) setBucketLocal(val);
    onBucketChange?.(val);
  };

  const baseFilteredPFs = useMemo(() => {
    const base =
      bucket === "all"
        ? sortedPFs
        : sortedPFs.filter(
          (pf: PF) => bucketFor(pf.value, scoreThresholds) === bucket
        );

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
  }, [sortedPFs, bucket, diffHints, diffFilterVal, relational, scoreThresholds]);

  const matchesPfLookup = (pf: PF, filter = pfLookupFilter) =>
    filter === "ALL" || pfDisplayName(pf.name) === filter;

  const filteredPFs = useMemo(
    () => baseFilteredPFs.filter((pf: PF) => matchesPfLookup(pf)),
    [baseFilteredPFs, pfLookupFilter]
  );

  const pfLookupOptions = useMemo(() => {
    const set = new Set<string>();
    baseFilteredPFs.forEach((pf: PF) => {
      const label = pfDisplayName(pf.name);
      if (label) set.add(label);
    });
    if (pfLookupFilter !== "ALL") set.add(pfLookupFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseFilteredPFs, pfLookupFilter]);

  const allPfLookupOptions = useMemo(
    () => ["ALL", ...pfLookupOptions],
    [pfLookupOptions]
  );

  const filterInputSx = {
    "& .MuiInputBase-root": {
      height: 32,
      fontSize: "14px",
    },
    "& .MuiInputBase-input": {
      padding: "0 8px",
    },
  };

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
    ? `# of CWEs: ${filteredPFs.length ?? 0}`
    : `# of product factors: ${filteredPFs.length ?? 0}`;
  const pfLookupLabel = hasCWE ? "CWE lookup" : "Product Factor lookup";
  const pfAllLabel = hasCWE ? "All CWEs" : "All product factors";

  const lookupFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? pfAllLabel : opt),
    ignoreAccents: true,
    trim: true,
  });

  useEffect(() => {
    if (pfLookupFilter === "ALL") return;
    if (pfLookupOptions.includes(pfLookupFilter)) return;
    setPfLookupLocal("ALL");
    setPfLookupInput("");
  }, [pfLookupFilter, pfLookupOptions]);

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
      <Box className="px-4 py-2 text-[15px]">
        <h3 className="mb-2 font-semibold text-[26px]">{pfHeader}</h3>

        <div className="mb-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[15px] text-[#555]">{pfLookupLabel}</span>
            <Autocomplete
              options={allPfLookupOptions}
              value={pfLookupFilter}
              onChange={(_, v) => setPfLookupLocal((v ?? "ALL") as string)}
              inputValue={pfLookupInput}
              onInputChange={(_, v) => setPfLookupInput(v)}
              getOptionLabel={(opt) => (opt === "ALL" ? pfAllLabel : opt)}
              filterOptions={lookupFilterOptions}
              clearOnBlur={false}
              autoSelect
              openOnFocus
              sx={{ width: 220 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={`Search ${hasCWE ? "CWEs" : "product factors"}...`}
                  size="small"
                  sx={filterInputSx}
                />
              )}
            />
          </label>

          <button
            className="h-[32px] rounded-md border border-[#bbb] bg-[#f5f5f5] px-2.5 text-[14px] hover:bg-black hover:text-white"
            onClick={() => {
              setPfLookupLocal("ALL");
              setPfLookupInput("");
            }}
            title="Clear filters"
          >
            Reset
          </button>
        </div>

        <div className="my-1.5 flex flex-wrap items-center gap-2.5">
          <button
            className={`inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f5f5f5] px-2.5 py-1.5 text-[16px] leading-none text-[#222] transition hover:bg-black hover:text-white active:translate-y-[1px] ${bucket === "critical" ? "border-2 border-black bg-black text-white" : ""
              }`}
            onClick={() => onChipClick("critical")}
            aria-pressed={bucket === "critical"}
          >
            <span className="h-3 w-3 rounded-full bg-[#c5052f] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" />
            Score &lt; {formatThreshold(scoreThresholds.criticalMax)}{" "}
            <span className="ml-1 rounded-full bg-[rgba(0,0,0,0.08)] px-1.5 py-0.5 text-[12px]">
              {counts.critical}
            </span>
          </button>

          <button
            className={`inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f5f5f5] px-2.5 py-1.5 text-[16px] leading-none text-[#222] transition hover:bg-black hover:text-white active:translate-y-[1px] ${bucket === "severe" ? "border-2 border-black bg-black text-white" : ""
              }`}
            onClick={() => onChipClick("severe")}
            aria-pressed={bucket === "severe"}
          >
            <span className="h-3 w-3 rounded-full bg-[rgb(240,228,66)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" />
            Score {formatThreshold(scoreThresholds.criticalMax)}-
            {formatThreshold(scoreThresholds.severeMax)}{" "}
            <span className="ml-1 rounded-full bg-[rgba(0,0,0,0.08)] px-1.5 py-0.5 text-[12px]">
              {counts.severe}
            </span>
          </button>

          <button
            className={`inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f5f5f5] px-2.5 py-1.5 text-[16px] leading-none text-[#222] transition hover:bg-black hover:text-white active:translate-y-[1px] ${bucket === "moderate" ? "border-2 border-black bg-black text-white" : ""
              }`}
            onClick={() => onChipClick("moderate")}
            aria-pressed={bucket === "moderate"}
          >
            <span className="h-3 w-3 rounded-full bg-[rgb(0,158,115)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" />
            Score &gt;= {formatThreshold(scoreThresholds.severeMax)}{" "}
            <span className="ml-1 rounded-full bg-[rgba(0,0,0,0.08)] px-1.5 py-0.5 text-[12px]">
              {counts.moderate}
            </span>
          </button>

          <button
            className={`inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f0f0f0] px-2.5 py-1.5 text-[16px] leading-none text-[#222] transition hover:bg-black hover:text-white active:translate-y-[1px] ${bucket === "all" ? "border-2 border-black bg-black text-white" : ""
              }`}
            onClick={() => {
              if (controlledBucket === undefined) setBucketLocal("all");
              onBucketChange?.("all");
            }}
            aria-pressed={bucket === "all"}
            title="Clear filter"
          >
            All
            <span className="ml-1 rounded-full bg-[rgba(0,0,0,0.08)] px-1.5 py-0.5 text-[12px]">
              {counts.all}
            </span>
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f0f0f0] px-2.5 py-1.5 text-[16px] leading-none text-[#222] transition hover:bg-black hover:text-white active:translate-y-[1px] ${showThresholdSettings ? "border-2 border-black bg-black text-white" : ""
              }`}
            onClick={() => setShowThresholdSettings((prev) => !prev)}
            aria-pressed={showThresholdSettings}
          >
            <SettingsIcon className="mr-1 text-[6px] align-middle" /> Settings
          </button>
        </div>

        {showThresholdSettings && (
          <div
            className="my-1.5 flex flex-wrap items-center gap-3"
            aria-label="Score thresholds"
          >
            <label className="inline-flex items-center gap-2 text-[14px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#c5052f] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" />
                Low score (red) value
              </span>
              <input
                className="w-[90px] rounded-md border border-[#ccc] px-1.5 py-1 text-[14px]"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={thresholdInputs.criticalMax}
                onFocus={() => setActiveThresholdInput("criticalMax")}
                onBlur={() => onThresholdInputBlur("criticalMax")}
                onChange={(e) =>
                  onThresholdInputChange("criticalMax", e.target.value)
                }
              />
            </label>
            <label className="inline-flex items-center gap-2 text-[14px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[rgb(240,228,66)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" />
                Middle score (yellow) value
              </span>
              <input
                className="w-[90px] rounded-md border border-[#ccc] px-1.5 py-1 text-[14px]"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={thresholdInputs.severeMax}
                onFocus={() => setActiveThresholdInput("severeMax")}
                onBlur={() => onThresholdInputBlur("severeMax")}
                onChange={(e) =>
                  onThresholdInputChange("severeMax", e.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="rounded-md border border-[#bbb] bg-[#f5f5f5] px-2.5 py-1 text-[14px] hover:bg-black hover:text-white"
              onClick={resetThresholds}
            >
              Reset defaults
            </button>
          </div>
        )}

        {filteredPFs.map((pf: PF) => {
          const sev = getSeverityInfo(pf.value, scoreThresholds);
          const isExpanded = expandedKey === pf.name;
          const allMeasures = measuresByPF.get(pf.name) ?? [];
          const dotClass =
            sev.kind === "critical"
              ? "bg-[#c5052f]"
              : sev.kind === "severe"
                ? "bg-[rgb(240,228,66)]"
                : "bg-[rgb(0,158,115)]";

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
              className="relative mb-4 ml-[18px] rounded-lg bg-white p-3"
              style={{ border: `2px ${sev.border} ${sev.color}` }}
            >
              <div className="inline-flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] ${dotClass}`}
                  aria-hidden="true"
                />
                <span className="label">{sev.label}</span>
              </div>

              <h4 className="mb-2 text-[24px]">
                <strong>{pf.name.replace("Product_Factor", "")}</strong>
                <DiffBadge kind={pfBadge} />
              </h4>

              <ul className="m-0 list-disc pl-5">
                <li>
                  <strong className="inline-flex items-center gap-1.5">
                    Score:
                  </strong>{" "}
                  <span
                    className={
                      !diffHints?.missingPFs?.has(pf.name) &&
                        diffHints?.pfFieldDiffs.get(pf.name)?.value
                        ? "rounded-[2px] bg-[#e49797] px-0.5"
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
                              ? "rounded-[2px] bg-[#e49797] px-0.5"
                              : ""
                          }
                        >
                          {hereBench}
                        </span>
                        {pfDiff?.benchmarkSize ? (
                          <Delta here={hereBench} peer={peerBench} places={0} />
                        ) : null}
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
                    scoreThresholds={scoreThresholds}
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
    label: hasPackageVulns ? "Package Vulnerabilities" : "Diagnostic Findings",
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
