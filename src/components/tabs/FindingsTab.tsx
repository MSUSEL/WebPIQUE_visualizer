// FindingTab.tsx
// Contains ALL logic/UI for the "Package Vulnerabilities" OR "Diagnostic Findings" tab,
// preserving the same rules and behaviors from the original ProductFactorTabs.tsx.

import React, { useMemo, useState } from "react";
import { Box, Tooltip } from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Collapse from "@mui/material/Collapse";
import CVEScoreMiniChart from "../plotting/CVEChart";
import { RelationalExtract } from "../../Utilities/DataParser";
import { DiffHints } from "../../Utilities/fileDiff";

// ---------- helpers (identical behavior to original) ----------
const cleanAssocLabel = (s?: string) => {
  const txt = (s ?? "").trim();
  if (!txt) return "";
  const cwe = /CWE-[\w-]+/i.exec(txt);
  if (cwe) return cwe[0];
  return txt
    .replace(/^(Product[_\s-]*Factor|Pillar)\s*/i, "")
    .replace(/\s*(Measure|Pillar)\s*$/i, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, " ")
    .trim();
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

const parseDiagnosticName = (raw: string) => {
  const name = String(raw ?? "").trim();
  if (!name) return { baseName: "", tool: "" };
  const match = /^(.*)\s+Diagnostic\s+(.+)$/i.exec(name);
  if (match) {
    return { baseName: match[1].trim() || name, tool: match[2].trim() };
  }
  return { baseName: name, tool: "" };
};

const formatToolList = (tools: Iterable<string>) => {
  const out = Array.from(
    new Set(
      Array.from(tools ?? [])
        .map((t) => String(t ?? "").trim())
        .filter(Boolean)
    )
  );
  out.sort((a, b) => a.localeCompare(b));
  return out.join(", ");
};

// diff/unique badges
type FlagKind = "diff" | "unique" | null;
const cveKey = (id: string) => String(id ?? "");
const flagForCVE = (id: string, hints?: DiffHints): FlagKind => {
  if (!hints) return null;
  const key = cveKey(id);
  return hints.missingCVEs?.has(key)
    ? "unique"
    : hints.differingCVEs?.has(key)
      ? "diff"
      : null;
};

const DiffBadge: React.FC<{ kind: FlagKind }> = ({ kind }) =>
  !kind ? null : (
    <span
      className="absolute left-[-2.5rem] top-2 text-[1.5rem] leading-none drop-shadow-[0_0_1px_rgba(0,0,0,0.25)]"
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

const DiffBadgeInline: React.FC<{ kind: FlagKind }> = ({ kind }) =>
  !kind ? null : (
    <span
      className="ml-1 inline-block text-[1.1rem] leading-none drop-shadow-[0_0_1px_rgba(0,0,0,0.25)]"
      title={
        kind === "diff" ? "Differs from the other file" : "Only in this file"
      }
      aria-label={
        kind === "diff" ? "Differs from the other file" : "Only in this file"
      }
    >
      {kind === "diff" ? "dYsc" : "Г?мЛ,?"}
    </span>
  );

const flagForDiagIds = (ids: string[], hints?: DiffHints): FlagKind => {
  if (!hints || ids.length === 0) return null;
  if (ids.some((id) => hints.missingCVEs?.has(id))) return "unique";
  if (ids.some((id) => hints.differingCVEs?.has(id))) return "diff";
  return null;
};

const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

const flagForDiagMeasure = (
  pfNames: string[],
  measureName: string,
  hints?: DiffHints
): FlagKind => {
  if (!hints) return null;
  let hasDiff = false;
  let hasUnique = false;
  for (const pfName of pfNames) {
    const key = mkey(pfName, measureName);
    if (hints.differingMeasures?.has(key)) hasDiff = true;
    if (hints.missingMeasures?.has(key)) hasUnique = true;
    if (hasDiff) break;
  }
  return hasDiff ? "diff" : hasUnique ? "unique" : null;
};

// ---------- types ----------
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

type DiagCard = {
  id: string;
  name: string;
  diagIds: string[];
  description?: string;
  tools: string[];
  toolScores: { tool: string; score: number }[];
  value?: number;
  measures: string[];
  productFactors: string[];
};

type Props = {
  // needed inputs
  aspectName: string;
  relational?: RelationalExtract;
  aspectPFs: any[];
  aspectPfIdSet: Set<string>;

  // compare/diff
  diffHints?: DiffHints;
  diffFilter?: "all" | "differing" | "unique";

  // (optional) externally-controlled filters for CVEs
  controlledPkgFilter?: string;
  onPkgFilterChange?: (v: string) => void;
  controlledFixedFilter?: "all" | "fixed" | "notfixed";
  onFixedFilterChange?: (v: "all" | "fixed" | "notfixed") => void;
};

const FindingTab: React.FC<Props> = ({
  relational,
  aspectPFs,
  aspectPfIdSet,
  diffHints,
  diffFilter,
  controlledPkgFilter,
  onPkgFilterChange,
  controlledFixedFilter,
  onFixedFilterChange,
}) => {
  // ---------- CVE/GHSA for THIS aspect only ----------
  // state for vulnerable package, fixed status, and cwe filters
  const [pkgLocal, setPkgLocal] = useState<string>("ALL");
  const pkgFilter = controlledPkgFilter ?? pkgLocal;

  const [fixedLocal, setFixedLocal] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );
  const fixedFilter = controlledFixedFilter ?? fixedLocal;

  const [pkgInput, setPkgInput] = useState("");
  const [cweLocal, setCweLocal] = useState<string>("ALL");
  const cweFilter = cweLocal;
  const [cweInput, setCweInput] = useState("");

  const matchesPkg = (vulnSource?: string, filter = pkgFilter) =>
    filter === "ALL" || (vulnSource ?? "").trim() === filter;

  const matchesFixed = (fixed: any, filter = fixedFilter) => {
    const fixedNorm = normalizeFixed(fixed);
    return (
      filter === "all" ||
      (filter === "fixed" && fixedNorm === "Fixed") ||
      (filter === "notfixed" && fixedNorm !== "Fixed")
    );
  };

  const matchesCwe = (g: GroupedCVE, filter = cweFilter) => {
    if (filter === "ALL") return true;
    const labels = [...(g.cwePillars ?? []), ...(g.cweMeasures ?? [])]
      .map(cleanAssocLabel)
      .filter(Boolean);
    return labels.includes(filter);
  };

  const pkgFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All packages" : opt),
    ignoreAccents: true,
    trim: true,
  });
  const filterInputSx = {
    "& .MuiInputBase-root": {
      height: 32,
      fontSize: "14px",
    },
    "& .MuiInputBase-input": {
      padding: "0 8px",
    },
  };

  const baseGroupedCves = useMemo<GroupedCVE[]>(() => {
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
        const mName = measureNameById.get(mid) ?? "";
        const mLabel = cleanAssocLabel(mName);
        if (mLabel) measureNamesInAspect.add(mLabel);

        for (const pfId of pfs) {
          if (!aspectPfIdSet.has(pfId)) continue;
          const pfName = pfNameById.get(pfId) ?? "";
          const pfLabel = cleanAssocLabel(pfName);
          if (pfLabel) pfNamesInAspect.add(pfLabel);
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
          if (!existing.has(key)) (g.byTool ?? (g.byTool = [])).push(t);
        }
        (g.raw ?? (g.raw = [])).push(f);

        for (const code of pfNamesInAspect)
          if (!g.cwePillars!.includes(code)) g.cwePillars!.push(code);
        for (const code of measureNamesInAspect)
          if (!g.cweMeasures!.includes(code)) g.cweMeasures!.push(code);
      }
    }

    return Array.from(groupedById.values());
  }, [relational, aspectPfIdSet]);

  const groupedCves = useMemo<GroupedCVE[]>(
    () =>
      baseGroupedCves.filter(
        (g) =>
          matchesPkg(g.vulnSource) &&
          matchesFixed(g.fixed) &&
          matchesCwe(g)
      ),
    [baseGroupedCves, pkgFilter, fixedFilter, cweFilter]
  );

  const packageOptions = useMemo(() => {
    const set = new Set<string>();
    baseGroupedCves.forEach((g) => {
      if (!matchesFixed(g.fixed, fixedFilter)) return;
      if (!matchesCwe(g, cweFilter)) return;
      const name = (g?.vulnSource ?? "").trim();
      if (name) set.add(name);
    });
    if (pkgFilter !== "ALL") set.add(pkgFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseGroupedCves, fixedFilter, cweFilter, pkgFilter]);

  const allPkgOptions = useMemo(
    () => ["ALL", ...packageOptions],
    [packageOptions]
  );

  const cweOptions = useMemo(() => {
    const set = new Set<string>();
    baseGroupedCves.forEach((g) => {
      if (!matchesPkg(g.vulnSource, pkgFilter)) return;
      if (!matchesFixed(g.fixed, fixedFilter)) return;
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
  }, [baseGroupedCves, pkgFilter, fixedFilter]);

  const availableFixedFilters = useMemo(() => {
    let hasFixed = false;
    let hasNotFixed = false;
    baseGroupedCves.forEach((g) => {
      if (!matchesPkg(g.vulnSource, pkgFilter)) return;
      if (!matchesCwe(g, cweFilter)) return;
      if (normalizeFixed(g.fixed) === "Fixed") hasFixed = true;
      else hasNotFixed = true;
    });
    return { hasFixed, hasNotFixed };
  }, [baseGroupedCves, pkgFilter, cweFilter]);

  React.useEffect(() => {
    if (cweFilter === "ALL") return;
    if (cweOptions.includes(cweFilter)) return;
    setCweLocal("ALL");
    setCweInput("");
  }, [cweFilter, cweOptions]);

  React.useEffect(() => {
    if (fixedFilter === "all") return;
    const ok =
      (fixedFilter === "fixed" && availableFixedFilters.hasFixed) ||
      (fixedFilter === "notfixed" && availableFixedFilters.hasNotFixed);
    if (ok) return;
    if (controlledFixedFilter === undefined) setFixedLocal("all");
    onFixedFilterChange?.("all");
  }, [
    fixedFilter,
    availableFixedFilters,
    controlledFixedFilter,
    onFixedFilterChange,
  ]);

  // Associated PF and measure hover descriptions
  const pfDescByLabel = useMemo(() => {
    const map = new Map<string, string>();
    (relational?.productFactors ?? []).forEach((pf) => {
      const label = cleanAssocLabel(pf.name);
      if (label && pf.description) map.set(label, pf.description);
    });
    return map;
  }, [relational]);

  const measureDescByLabel = useMemo(() => {
    const map = new Map<string, string>();
    (relational?.measures ?? []).forEach((m) => {
      const label = cleanAssocLabel(m.name);
      if (label && m.description) map.set(label, m.description);
    });
    return map;
  }, [relational]);

  const allCweOptions = useMemo(() => ["ALL", ...cweOptions], [cweOptions]);

  const cweFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All CWEs" : opt),
    ignoreAccents: true,
    trim: true,
  });

  // apply legend diff filter and alignment+bucket sort for CVEs
  const visibleCves = useMemo(() => {
    const base = (() => {
      const mode = diffFilter ?? "all";
      if (!diffHints || mode === "all") return groupedCves;
      if (mode === "differing")
        return groupedCves.filter((g) => diffHints.differingCVEs?.has(g.id));
      return groupedCves.filter((g) => diffHints.missingCVEs?.has(g.id));
    })();

    if (diffHints) {
      const rank = (g: { id: string }) => {
        const d = diffHints.differingCVEs?.has(g.id);
        const u = diffHints.missingCVEs?.has(g.id);
        return d ? 0 : u ? 2 : 1; // differing -> common -> unique
      };
      return [...base].sort(
        (a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id))
      );
    }

    return base;
  }, [groupedCves, diffHints, diffFilter]);

  // ---------- Non-CVE Diagnostics for aspect ----------
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
      const name = String(pf?.name ?? "");
      const id = String(pf?.id ?? pf?.name ?? "");
      if (id) pfNameById.set(id, name || id);
      (pf?.__ids ?? []).forEach((pid: string) => {
        const key = String(pid ?? "");
        if (key) pfNameById.set(key, name || key);
      });
    });

    const diagHasFindings = new Set<string>();
    (relational.findings ?? []).forEach((f) =>
      diagHasFindings.add(f.diagnosticId)
    );

    const cardsByName = new Map<
      string,
      {
        card: DiagCard;
        toolSet: Set<string>;
        toolScoreMap: Map<string, number | undefined>;
        measureSet: Set<string>;
        pfSet: Set<string>;
      }
    >();

    for (const [diagId, measureIdsSet] of diagToMeasures.entries()) {
      const diagRow = diagsById.get(diagId);
      const rawName = String(diagRow?.name ?? diagId).trim();
      const parsed = parseDiagnosticName(rawName);
      const diagName = parsed.baseName;
      if (!diagName) continue;

      if (isVulnId(diagId) || isVulnId(diagName)) continue; // CVE/GHSA handled elsewhere
      if (diagHasFindings.has(diagId)) continue;

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

      const key = diagName.toLowerCase();
      const toolLabel =
        String(diagRow?.toolName ?? "").trim() ||
        parsed.tool ||
        "";

      let entry = cardsByName.get(key);
      if (!entry) {
        entry = {
          card: {
            id: diagName,
            name: diagName,
            diagIds: [],
            description: diagRow?.description,
            value: diagRow?.value,
            tools: [],
            toolScores: [],
            measures: [],
            productFactors: [],
          },
          toolSet: new Set<string>(),
          toolScoreMap: new Map<string, number | undefined>(),
          measureSet: new Set<string>(),
          pfSet: new Set<string>(),
        };
        cardsByName.set(key, entry);
      }

      if (toolLabel) {
        entry.toolSet.add(toolLabel);
        entry.toolScoreMap.set(
          toolLabel,
          typeof diagRow?.value === "number" ? diagRow.value : undefined
        );
      }
      entry.card.diagIds.push(diagId);
      pfNames.forEach((pf) => entry!.pfSet.add(pf));
      mNames.forEach((m) => entry!.measureSet.add(m));

      if (!entry.card.description && diagRow?.description)
        entry.card.description = diagRow.description;
      if (typeof entry.card.value !== "number" && typeof diagRow?.value === "number")
        entry.card.value = diagRow.value;
    }

    const cards = Array.from(cardsByName.values()).map((v) => {
      v.card.diagIds = Array.from(new Set(v.card.diagIds));
      v.card.tools = Array.from(v.toolSet).sort((a, b) => a.localeCompare(b));
      v.card.toolScores = Array.from(v.toolScoreMap.entries())
        .filter((entry): entry is [string, number] => {
          const score = entry[1];
          return typeof score === "number" && Number.isFinite(score);
        })
        .map(([tool, score]) => ({ tool, score }));
      v.card.measures = Array.from(v.measureSet).sort((a, b) => a.localeCompare(b));
      v.card.productFactors = Array.from(v.pfSet).sort((a, b) => a.localeCompare(b));
      return v.card;
    });

    const applyDiagDiff = (card: DiagCard) => {
      if (!diffHints) return true;
      const mode = diffFilter ?? "all";
      if (mode === "all") return true;
      const hasDiff = card.diagIds.some((id) => diffHints.differingCVEs?.has(id));
      const hasUnique = card.diagIds.some((id) => diffHints.missingCVEs?.has(id));
      return mode === "differing" ? hasDiff : hasUnique;
    };

    const filtered = cards.filter(applyDiagDiff);
    if (diffHints) {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [relational, aspectPFs, aspectPfIdSet, diffHints, diffFilter]);

  // ---------- Tab label/header logic (same behavior) ----------
  const hasPackageVulns = baseGroupedCves.length > 0;
  const secondTabLabel = hasPackageVulns
    ? "Package Vulnerabilities"
    : "Diagnostic Findings";
  const secondHeader = hasPackageVulns
    ? `# of package vulnerabilities: ${groupedCves.length}`
    : `# of diagnostic findings: ${nonCveDiagnostics.length}`;

  // ---------- Render ----------
  if (hasPackageVulns) {
    return (
      <Box className="px-4 py-2 text-[15px]">
        <h3 className="mb-2 font-semibold text-[26px]">{secondHeader}</h3>

        {/* Filters ONLY when there are CVEs */}
        <div className="ml-[18px] flex max-w-[calc(100%-18px)] flex-wrap items-end gap-2 pb-3">
          <label className="flex flex-col gap-1">
            <span className="text-[15px] text-[#555]">Vulnerable Package</span>
            <Autocomplete
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
              sx={{ width: 180 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search packages..."
                  size="small"
                  sx={filterInputSx}
                />
              )}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[15px] text-[#555]">Fixed status</span>
            <select
              className="h-[32px] w-[180px] rounded-md border border-[#ccc] px-2 text-[14px]"
              value={fixedFilter}
              onChange={(e) => {
                const v = e.target.value as "all" | "fixed" | "notfixed";
                if (controlledFixedFilter === undefined) setFixedLocal(v);
                onFixedFilterChange?.(v);
              }}
            >
              <option value="all">All</option>
              <option value="fixed" disabled={!availableFixedFilters.hasFixed}>
                Fixed
              </option>
              <option
                value="notfixed"
                disabled={!availableFixedFilters.hasNotFixed}
              >
                Not fixed
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[15px] text-[#555]">CWE lookup</span>
            <Autocomplete
              options={allCweOptions}
              value={cweFilter}
              onChange={(_, v) => setCweLocal((v ?? "ALL") as string)}
              inputValue={cweInput}
              onInputChange={(_, v) => setCweInput(v)}
              getOptionLabel={(opt) => (opt === "ALL" ? "All CWEs" : opt)}
              filterOptions={cweFilterOptions}
              clearOnBlur={false}
              openOnFocus
              sx={{ width: 180 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search CWEs..."
                  size="small"
                  sx={filterInputSx}
                />
              )}
            />
          </label>

          <button
            className="h-[32px] rounded-md border border-[#bbb] bg-[#f5f5f5] px-2.5 text-[14px] hover:bg-black hover:text-white"
            onClick={() => {
              if (controlledPkgFilter === undefined) setPkgLocal("ALL");
              if (controlledFixedFilter === undefined) setFixedLocal("all");
              setPkgInput("");
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
          {visibleCves.map((g) => {
            const byTool = g.byTool ?? [];
            const cveDiff = diffHints?.cveFieldDiffs?.get(g.id);

            const toolsStr = formatToolList(
              (g.byTool ?? []).map((t: any) => t.tool)
            );

            const fixedStr =
              normalizeFixed(g.fixed ?? "").trim() || "Not fixed";

            return (
              <Box key={g.id} className="relative mt-2 ml-[24px] rounded-lg border border-[grey] p-3 text-[16px]">
                <DiffBadge kind={flagForCVE(g.id, diffHints)} />
                <h4 className="m-0 text-[22px]"><strong>{g.id}</strong></h4>
                <strong>Related vulnerability ID:</strong> {g.alias || "None"}
                <ul className="m-0 list-disc pl-5 pr-20">
                  <li>
                    <strong>Package name:</strong>{" "}
                    <span
                      className={
                        cveDiff?.pkg
                          ? "rounded-[2px] bg-[#e49797] px-0.5"
                          : ""
                      }
                    >
                      {g.vulnSource || "--"}
                    </span>
                  </li>
                  <li>
                    <strong>Vulnerable Package Version:</strong>{" "}
                    <span
                      className={
                        cveDiff?.vulnVer
                          ? "rounded-[2px] bg-[#e49797] px-0.5"
                          : ""
                      }
                    >
                      {g.vulnSourceVersion || "--"}
                    </span>
                  </li>
                  <li>
                    <strong>Fixed Status:</strong>{" "}
                    <span
                      className={
                        cveDiff?.fixed
                          ? "rounded-[2px] bg-[#e49797] px-0.5"
                          : ""
                      }
                    >
                      {fixedStr}
                    </span>
                  </li>
                  {g.fixedVersion && (
                    <li>
                      <strong>Fixed Package Version(s):</strong>{" "}
                      <span
                        className={
                          cveDiff?.fixedVer
                            ? "rounded-[2px] bg-[#e49797] px-0.5"
                            : ""
                        }
                      >
                        {g.fixedVersion}
                      </span>
                    </li>
                  )}
                  <li>
                    <strong>Description:</strong> {g.description || "--"}
                  </li>
                  {(() => {
                    const pillars = g.cwePillars ?? [];
                    if (!pillars.length) return null;

                    return (
                      <li>
                        <strong>Associated Product Factors:</strong>{" "}
                        {pillars.map((pf, idx) => {
                          const label = cleanAssocLabel(pf);
                          const desc = pfDescByLabel.get(label);
                          return (
                            <span key={idx}>
                              {desc ? (
                                <Tooltip
                                  title={desc}
                                  arrow
                                  placement="top"
                                  slotProps={{
                                    tooltip: {
                                      sx: {
                                        fontSize: "1rem",
                                        backgroundColor: "black",
                                      },
                                    },
                                  }}
                                >
                                  <span className="cursor-help underline decoration-dotted">
                                    {label}
                                  </span>
                                </Tooltip>
                              ) : (
                                label
                              )}
                              {idx < pillars.length - 1 ? ", " : ""}
                            </span>
                          );
                        })}
                      </li>
                    );
                  })()}

                  {(() => {
                    const measures = g.cweMeasures ?? [];
                    if (!measures.length) return null;

                    return (
                      <li>
                        <strong>Associated Measure(s):</strong>{" "}
                        {measures.map((m, idx) => {
                          const label = cleanAssocLabel(m);
                          const desc = measureDescByLabel.get(label);
                          return (
                            <span key={idx}>
                              {desc ? (
                                <Tooltip
                                  title={desc}
                                  arrow
                                  placement="top"
                                  slotProps={{
                                    tooltip: {
                                      sx: {
                                        fontSize: "1rem",
                                        backgroundColor: "black",
                                      },
                                    },
                                  }}
                                >
                                  <span className="cursor-help underline decoration-dotted">
                                    {label}
                                  </span>
                                </Tooltip>
                              ) : (
                                label
                              )}
                              {idx < measures.length - 1 ? ", " : ""}
                            </span>
                          );
                        })}
                      </li>
                    );
                  })()}

                  <li>
                    <strong>Findings from Tool(s): </strong>{" "}
                    <span
                      className={
                        cveDiff?.byTool
                          ? "rounded-[2px] bg-[#e49797] px-0.5"
                          : ""
                      }
                    >
                      {toolsStr || "--"}
                    </span>
                  </li>
                  <li>
                    <div className="mt-2">
                      <strong>CVE Score(s) by Tool:</strong>
                      <CVEScoreMiniChart byTool={byTool} />
                    </div>
                  </li>
                </ul>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // Diagnostics view (no CVEs)
  return (
    <Box className="px-4 py-2 text-[15px]">
      <h3 className="mb-2 font-semibold text-[26px]">{secondHeader}</h3>

      <Box>
        {nonCveDiagnostics.length === 0 ? (
          <div className="opacity-70">
            No diagnostics available for this aspect.
          </div>
        ) : (
          nonCveDiagnostics.map((d) => (
            <Box
              key={d.id}
              className="relative mt-2 ml-[24px] rounded-lg border border-[grey] p-3 text-[16px]"
            >
              <DiffBadge kind={flagForDiagIds(d.diagIds, diffHints)} />
              <h4 className="m-0 text-[22px]"><strong>{d.name}</strong></h4>
              <ul className="m-0 list-disc pl-5 pr-20">
                <li>
                  <strong>Findings from Tool(s):</strong>{" "}
                  {formatToolList(d.tools) || "--"}
                </li>
                <li>
                  <strong>Associated Product factor(s):</strong>{" "}
                  {d.productFactors.map((pf, idx) => {
                    const label = cleanAssocLabel(pf);
                    const desc = pfDescByLabel.get(label);
                    return (
                      <span key={idx}>
                        {desc ? (
                          <Tooltip
                            title={desc}
                            arrow
                            placement="top"
                            slotProps={{
                              tooltip: {
                                sx: {
                                  fontSize: "1rem",
                                  backgroundColor: "black",
                                },
                              },
                            }}
                          >
                            <span className="cursor-help underline decoration-dotted">
                              {label}
                            </span>
                          </Tooltip>
                        ) : (
                          label
                        )}
                        {idx < d.productFactors.length - 1 ? ", " : ""}
                      </span>
                    );
                  })}
                </li>

                <li>
                  <strong>Associated Measure(s):</strong>{" "}
                  {d.measures.map((m, idx) => {
                    const label = cleanAssocLabel(m);
                    const desc = measureDescByLabel.get(label);
                    const flag = flagForDiagMeasure(d.productFactors, m, diffHints);
                    return (
                      <span key={idx}>
                        {desc ? (
                          <Tooltip
                            title={desc}
                            arrow
                            placement="top"
                            slotProps={{
                              tooltip: {
                                sx: {
                                  fontSize: "1rem",
                                  backgroundColor: "black",
                                },
                              },
                            }}
                          >
                            <span className="cursor-help underline decoration-dotted">
                              {label}
                            </span>
                          </Tooltip>
                        ) : (
                          label
                        )}
                        <DiffBadgeInline kind={flag} />
                        {idx < d.measures.length - 1 ? ", " : ""}
                      </span>
                    );
                  })}
                </li>

                {d.description && (
                  <li>
                    <strong>Description:</strong> {d.description}
                  </li>
                )}
                <li>
                  {d.toolScores.length > 0 && (
                    <div className="mt-2">
                      <strong>Score(s) by Tool:</strong>
                      <CVEScoreMiniChart byTool={d.toolScores} />
                    </div>
                  )}
                </li>
              </ul>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

export default FindingTab;
