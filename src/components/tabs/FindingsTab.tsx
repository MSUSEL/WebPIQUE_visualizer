// FindingsTab.tsx
import React, { useMemo, useState } from "react";
import { Box } from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

import "../../styles/SecurityTabs.css";
import { RelationalExtract } from "../../Utilities/DataParser";
import { DiffHints } from "../../Utilities/fileDiff";
import CVEScoreMiniChart from "../plotting/CVEChart";

type ScoresType = any;

type AssocItem = { name: string; description?: string };

type Props = {
  aspectName: string;
  scores: ScoresType;
  relational?: RelationalExtract;

  diffHints?: DiffHints;
  diffFilter?: "all" | "differing" | "unique";

  controlledPkgFilter?: string;
  onPkgFilterChange?: (v: string) => void;

  controlledFixedFilter?: "all" | "fixed" | "notfixed";
  onFixedFilterChange?: (v: "all" | "fixed" | "notfixed") => void;

  controlledCweFilter?: string;
  onCweFilterChange?: (v: string) => void;
};

// CWE ID if present; otherwise strip boilerplate words
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

type GroupedCVE = {
  id: string;
  title?: string;
  alias?: string;
  description?: string;
  fixed?: any;
  vulnSource?: string;
  vulnSourceVersion?: string;
  fixedVersion?: string;
  cwePillars?: AssocItem[];
  cweMeasures?: AssocItem[];
  byTool: any[];
  raw: any[];
};

type DiagCard = {
  id: string; // grouped key (e.g., CWE-24)
  name: string; // display name (e.g., CWE-24)
  description?: string;
  findingsFrom?: string[]; // aggregated tool list
  value?: number; // optional representative score
  measures: AssocItem[];
  productFactors: AssocItem[];
};

// Keep ID normalization consistent with fileDiff.ts so badge/highlight lookups hit.
const normFindingId = (id: any): string => {
  const s = String(id ?? "").trim();
  if (!s) return "";
  return /^(?:CVE|GHSA)-/i.test(s) ? s.toUpperCase() : s;
};

const cveKey = (id: string) => normFindingId(id);

type FlagKind = "diff" | "unique" | null;

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

const FindingsTab: React.FC<Props> = ({
  aspectName,
  relational,

  diffHints,
  diffFilter,

  controlledPkgFilter,
  onPkgFilterChange,
  controlledFixedFilter,
  onFixedFilterChange,

  controlledCweFilter,
  onCweFilterChange,
}) => {
  // Local state (used only if uncontrolled)
  const [pkgLocal, setPkgLocal] = useState<string>("ALL");
  const [fixedLocal, setFixedLocal] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );
  const [cweLocal, setCweLocal] = useState<string>("ALL");

  const pkgFilter = controlledPkgFilter ?? pkgLocal;
  const fixedFilter = controlledFixedFilter ?? fixedLocal;
  const cweFilter = controlledCweFilter ?? cweLocal;

  const setCweFilter = (v: string) => {
    if (controlledCweFilter === undefined) setCweLocal(v);
    onCweFilterChange?.(v);
  };

  const [pkgInput, setPkgInput] = useState("");
  const [cweInput, setCweInput] = useState("");

  // PFs for aspect (for scoping findings)
  const aspectPfIdSet = useMemo(() => {
    const set = new Set<string>();
    if (!relational) return set;

    (relational.productFactors ?? []).forEach((pf) => {
      if (pf?.id) set.add(String(pf.id));
      if (pf?.name) set.add(String(pf.name));
    });

    return set;
  }, [relational]);

  // Filter helpers
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

  // Build CVE groups (UNFILTERED by pkg/fixed/CWE) so options lists stay stable
  const groupedCvesAll = useMemo<GroupedCVE[]>(() => {
    const groupedById = new Map<string, GroupedCVE>();
    if (!relational) return [];

    const pfById = new Map<string, any>();
    (relational.productFactors ?? []).forEach((p) => pfById.set(p.id, p));

    const measureById = new Map<string, any>();
    (relational.measures ?? []).forEach((m) => measureById.set(m.id, m));

    const diagToMeasures = new Map<string, string[]>();
    (relational.measureDiagnostics ?? []).forEach((e) => {
      const arr = diagToMeasures.get(e.diagnosticId) ?? [];
      arr.push(e.measureId);
      diagToMeasures.set(e.diagnosticId, arr);
    });

    const measureToPFs = new Map<string, string[]>();
    (relational.pfMeasures ?? []).forEach((e) => {
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
      const pfLabelsInAspect = new Map<string, string>();
      const measureLabelsInAspect = new Map<string, string>();

      for (const mid of measureIds) {
        const pfIds = measureToPFs.get(mid) ?? [];
        const anyInAspectHere = pfIds.some((pfId) => aspectPfIdSet.has(pfId));
        if (!anyInAspectHere) continue;

        inAspect = true;

        const mRow = measureById.get(mid);
        const mName = mRow?.name ?? "";
        const mLabel = cleanAssocLabel(mName);
        if (mLabel) measureLabelsInAspect.set(mLabel, mRow?.description ?? "");

        for (const pfId of pfIds) {
          if (!aspectPfIdSet.has(pfId)) continue;
          const pfRow = pfById.get(pfId);
          const pfName = pfRow?.name ?? "";
          const pfLabel = cleanAssocLabel(pfName);
          if (pfLabel) pfLabelsInAspect.set(pfLabel, pfRow?.description ?? "");
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
          fixed: f.fixed,
          vulnSource: (f.vulnSource ?? "").trim(),
          vulnSourceVersion: (f.vulnSourceVersion ?? "").trim(),
          fixedVersion: f.fixedVersion,
          byTool: (f.byTool ?? []).slice(),
          raw: [f],
          cwePillars: Array.from(pfLabelsInAspect.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, description]) => ({ name, description })),
          cweMeasures: Array.from(measureLabelsInAspect.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, description]) => ({ name, description })),
        };
        groupedById.set(id, g);
      } else {
        const existing = new Set(
          (g.byTool ?? []).map((t: any) => `${t.tool}|${t.score ?? ""}`)
        );
        for (const t of f.byTool ?? []) {
          const key = `${t.tool}|${t.score ?? ""}`;
          if (!existing.has(key)) g.byTool.push(t);
        }
        g.raw.push(f);

        for (const [name, description] of pfLabelsInAspect.entries()) {
          if (!g.cwePillars!.some((x) => x.name === name))
            g.cwePillars!.push({ name, description });
        }
        for (const [name, description] of measureLabelsInAspect.entries()) {
          if (!g.cweMeasures!.some((x) => x.name === name))
            g.cweMeasures!.push({ name, description });
        }
      }
    }

    return Array.from(groupedById.values());
  }, [relational, aspectPfIdSet]);

  // Build option lists from unfiltered data
  const packageOptions = useMemo(() => {
    const set = new Set<string>();
    groupedCvesAll.forEach((g) => {
      const name = (g?.vulnSource ?? "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupedCvesAll]);

  const allPkgOptions = useMemo(
    () => ["ALL", ...packageOptions],
    [packageOptions]
  );

  const cweOptions = useMemo(() => {
    const set = new Set<string>();
    groupedCvesAll.forEach((g) => {
      (g.cwePillars ?? []).forEach((it) => {
        const lab = cleanAssocLabel(it.name);
        if (lab) set.add(lab);
      });
      (g.cweMeasures ?? []).forEach((it) => {
        const lab = cleanAssocLabel(it.name);
        if (lab) set.add(lab);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupedCvesAll]);

  const allCweOptions = useMemo(() => ["ALL", ...cweOptions], [cweOptions]);

  // Apply pkg/fixed/CWE filters
  const groupedCvesFiltered = useMemo(() => {
    return groupedCvesAll.filter((g) => {
      const basePass = cveMatches({ vulnSource: g.vulnSource, fixed: g.fixed });
      if (!basePass) return false;

      if (cweFilter === "ALL") return true;
      const labels = [...(g.cwePillars ?? []), ...(g.cweMeasures ?? [])]
        .map((it) => cleanAssocLabel(it.name))
        .filter(Boolean);
      return labels.includes(cweFilter);
    });
  }, [groupedCvesAll, pkgFilter, fixedFilter, cweFilter]);

  // Apply legend diff filter to CVEs
  const filteredCves = useMemo(() => {
    const mode = diffFilter ?? "all";
    if (!diffHints || mode === "all") return groupedCvesFiltered;

    if (mode === "differing")
      return groupedCvesFiltered.filter((g) =>
        diffHints.differingCVEs?.has(normFindingId(g.id))
      );
    return groupedCvesFiltered.filter((g) =>
      diffHints.missingCVEs?.has(normFindingId(g.id))
    );
  }, [groupedCvesFiltered, diffHints, diffFilter]);

  // Non-CVE diagnostics (shown when there are no package vulns in this aspect)
  // Goal: one card per diagnostic type (e.g., CWE-24) and aggregate "Findings From" across tools.
  const nonCveDiagnostics = useMemo<DiagCard[]>(() => {
    if (!relational) return [];

    const measuresById = new Map<string, any>(
      (relational.measures ?? []).map((m) => [m.id, m])
    );
    const diagsById = new Map<string, any>(
      (relational.diagnostics ?? []).map((d) => [d.id, d])
    );

    const pfNameById = new Map<string, string>();
    (relational.productFactors ?? []).forEach((p) =>
      pfNameById.set(p.id, p.name)
    );

    const measureDescByName = new Map<string, string>();
    (relational.measures ?? []).forEach((m) => {
      if (m?.name) measureDescByName.set(m.name, m.description ?? "");
    });

    const pfDescByName = new Map<string, string>();
    (relational.productFactors ?? []).forEach((pf: any) => {
      if (pf?.name) pfDescByName.set(pf.name, pf.description ?? "");
    });

    const diagToMeasures = new Map<string, Set<string>>();
    (relational.measureDiagnostics ?? []).forEach((e) => {
      const s = diagToMeasures.get(e.diagnosticId) ?? new Set<string>();
      s.add(e.measureId);
      diagToMeasures.set(e.diagnosticId, s);
    });

    const measureToPFs = new Map<string, Set<string>>();
    (relational.pfMeasures ?? []).forEach((e) => {
      const s = measureToPFs.get(e.measureId) ?? new Set<string>();
      s.add(e.pfId);
      measureToPFs.set(e.measureId, s);
    });

    // If a diagnostic has a CVE/GHSA finding, it belongs to the Package Vulnerabilities view.
    const diagHasFindings = new Set<string>();
    (relational.findings ?? []).forEach((f) =>
      diagHasFindings.add(f.diagnosticId)
    );

    // Group cards by a stable CWE-like label (e.g., "CWE-24"), not by diagnostic id/tool.
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        description?: string;
        findingsFrom: Set<string>;
        value?: number;
        pfNames: Set<string>;
        mNames: Set<string>;
      }
    >();

    for (const [diagId, measureIdsSet] of diagToMeasures.entries()) {
      const diagRow = diagsById.get(diagId);
      const diagNameRaw = String(diagRow?.name ?? diagId);

      // Exclude vulnerability IDs and anything that already has findings (those go to package vulns)
      if (isVulnId(diagId) || isVulnId(diagNameRaw)) continue;
      if (diagHasFindings.has(diagId)) continue;

      // Convert names like "CWE-24 Diagnostic Grype" -> "CWE-24"
      const groupKey = cleanAssocLabel(diagNameRaw) || String(diagId);
      if (!groupKey) continue;

      const measureIds = Array.from(measureIdsSet);

      const pfNames = new Set<string>();
      const mNames = new Set<string>();

      for (const mid of measureIds) {
        const pfIds = Array.from(measureToPFs.get(mid) ?? []);
        const anyInAspect = pfIds.some((id) => aspectPfIdSet.has(id));
        if (!anyInAspect) continue;

        const m = measuresById.get(mid);
        if (m?.name) mNames.add(m.name);

        for (const pfId of pfIds) {
          if (!aspectPfIdSet.has(pfId)) continue;
          const nm = pfNameById.get(pfId) ?? String(pfId);
          pfNames.add(nm);
        }
      }

      // If nothing in this aspect, skip
      if (pfNames.size === 0) continue;

      const tool =
        String(diagRow?.toolName ?? "").trim() ||
        (diagNameRaw.match(/\b(Trivy|Grype|Snyk|OSV|Anchore)\b/i)?.[0] ?? "");

      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          id: groupKey,
          name: groupKey, // show only the CWE id (remove "Diagnostic" + tool)
          description: diagRow?.description,
          findingsFrom: new Set(tool ? [tool] : []),
          value: typeof diagRow?.value === "number" ? diagRow.value : undefined,
          pfNames,
          mNames,
        });
      } else {
        if (!existing.description && diagRow?.description)
          existing.description = diagRow.description;
        if (
          typeof existing.value !== "number" &&
          typeof diagRow?.value === "number"
        )
          existing.value = diagRow.value;

        if (tool) existing.findingsFrom.add(tool);
        for (const n of pfNames) existing.pfNames.add(n);
        for (const n of mNames) existing.mNames.add(n);
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        findingsFrom: Array.from(g.findingsFrom).sort((a, b) =>
          a.localeCompare(b)
        ),
        value: g.value,
        productFactors: Array.from(g.pfNames)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ name, description: pfDescByName.get(name) })),
        measures: Array.from(g.mNames)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ name, description: measureDescByName.get(name) })),
      }));
  }, [relational, aspectPfIdSet]);

  // Determine whether we’re in “package vulnerabilities” mode
  const hasPackageVulns = groupedCvesAll.length > 0;
  const secondHeader = hasPackageVulns
    ? `# of package vulnerabilities: ${groupedCvesAll.length}`
    : `# of diagnostics: ${nonCveDiagnostics.length}`;

  // Autocomplete filter configs
  const pkgFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All packages" : opt),
    ignoreAccents: true,
    trim: true,
  });

  const cweFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All CWEs" : opt),
    ignoreAccents: true,
    trim: true,
  });

  // ----- Render -----
  if (!hasPackageVulns) {
    return (
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
                className="cve-card card--with-badge"
                style={{ position: "relative", marginLeft: "24px" }}
              >
                <h4 className="cve-title">{d.name}</h4>
                <ul className="cve-list">
                  <li>
                    <strong>Findings From:</strong>{" "}
                    {d.findingsFrom?.length ? d.findingsFrom.join(", ") : "—"}
                  </li>
                  <li>
                    <strong>Score Reported by Tool:</strong>{" "}
                    {typeof d.value === "number" ? d.value.toFixed(4) : "—"}
                  </li>
                  <li>
                    <strong>Associated Product Factor(s):</strong>{" "}
                    {d.productFactors.map((pf, idx) => (
                      <span
                        key={pf.name + idx}
                        className="assoc-hover"
                        title={pf.description || "No description available"}
                      >
                        {cleanAssocLabel(pf.name)}
                        {idx < d.productFactors.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </li>
                  <li>
                    <strong>Associated Measure(s):</strong>{" "}
                    {d.measures.map((m, idx) => (
                      <span
                        key={m.name + idx}
                        className="assoc-hover"
                        title={m.description || "No description available"}
                      >
                        {cleanAssocLabel(m.name)}
                        {idx < d.measures.length - 1 ? ", " : ""}
                      </span>
                    ))}
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
    );
  }

  // Package vulnerabilities mode
  return (
    <Box className="st-root">
      <h3 className="st-h3">{secondHeader}</h3>
      <hr className="st-divider st-divider--narrow" />

      <div className="st-filters">
        <label className="st-filter">
          <span className="st-filter-label">Vulnerable Package</span>
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
            options={allCweOptions}
            value={cweFilter ?? "ALL"}
            onChange={(_, v) => setCweFilter((v ?? "ALL") as string)}
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
            if (controlledCweFilter === undefined) setCweLocal("ALL");

            setPkgInput("");
            setCweInput("");

            onPkgFilterChange?.("ALL");
            onFixedFilterChange?.("all");
            onCweFilterChange?.("ALL");
          }}
          title="Clear filters"
        >
          Reset
        </button>
      </div>

      <Box>
        {filteredCves.map((g) => {
          const byTool = g.byTool ?? [];
          const cveDiff = diffHints?.cveFieldDiffs?.get(normFindingId(g.id));

          const toolsStr = (g.byTool ?? []).length
            ? Array.from(new Set(g.byTool.map((t: any) => t.tool))).join(", ")
            : "—";

          const fixedStr = normalizeFixed(g.fixed ?? "").trim() || "Not fixed";

          return (
            <Box
              key={g.id}
              className="cve-card card--with-badge"
              style={{ position: "relative", marginLeft: "24px" }}
            >
              <DiffBadge kind={flagForCVE(g.id, diffHints)} />
              <h4 className="cve-title">{g.id}</h4>
              <strong>Related vulnerability ID:</strong> {g.alias || "None"}
              <ul className="cve-list">
                <li>
                  <strong>Package name:</strong>{" "}
                  <span className={cveDiff?.pkg ? "diff-field" : ""}>
                    {g.vulnSource || "—"}
                  </span>
                </li>

                <li>
                  <strong>Vulnerable Package Version:</strong>{" "}
                  <span className={cveDiff?.vulnVer ? "diff-field" : ""}>
                    {g.vulnSourceVersion || "—"}
                  </span>
                </li>

                <li>
                  <strong>Fixed Status:</strong>{" "}
                  <span className={cveDiff?.fixed ? "diff-field" : ""}>
                    {fixedStr}
                  </span>
                </li>

                {g.fixedVersion && (
                  <li>
                    <strong>Fixed Package Version(s):</strong>{" "}
                    <span className={cveDiff?.fixedVer ? "diff-field" : ""}>
                      {g.fixedVersion}
                    </span>
                  </li>
                )}

                <li>
                  <strong>Description:</strong> {g.description || "—"}
                </li>

                {g.cwePillars?.length ? (
                  <li>
                    <strong>Associated Product Factor(s):</strong>{" "}
                    {g.cwePillars.map((pf, idx) => (
                      <span
                        key={pf.name + idx}
                        className="assoc-hover"
                        title={pf.description || "No description available"}
                      >
                        {cleanAssocLabel(pf.name)}
                        {idx < g.cwePillars!.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </li>
                ) : null}

                {g.cweMeasures?.length ? (
                  <li>
                    <strong>Associated Measure(s):</strong>{" "}
                    {g.cweMeasures.map((m, idx) => (
                      <span
                        key={m.name + idx}
                        className="assoc-hover"
                        title={m.description || "No description available"}
                      >
                        {cleanAssocLabel(m.name)}
                        {idx < g.cweMeasures!.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </li>
                ) : null}

                <li>
                  <strong>Finding Identified From:</strong>{" "}
                  <span className={cveDiff?.byTool ? "diff-field" : ""}>
                    {toolsStr}
                  </span>
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
  );
};

export default FindingsTab;
