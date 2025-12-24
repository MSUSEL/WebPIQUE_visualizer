// FindingTab.tsx
// Contains ALL logic/UI for the "Package Vulnerabilities" OR "Diagnostics" tab,
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
  description?: string;
  toolName?: string;
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

    return Array.from(groupedById.values()).filter((g) => {
      const basePass = cveMatches({ vulnSource: g.vulnSource, fixed: g.fixed });
      if (!basePass) return false;

      if (cweFilter === "ALL") return true;
      const labels = [...(g.cwePillars ?? []), ...(g.cweMeasures ?? [])]
        .map(cleanAssocLabel)
        .filter(Boolean);
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

    if (diffHints) {
      cards.sort((a, b) => a.name.localeCompare(b.name));
    }
    return cards;
  }, [relational, aspectPFs, aspectPfIdSet, diffHints]);

  // ---------- Tab label/header logic (same behavior) ----------
  const hasPackageVulns = groupedCves.length > 0;
  const secondTabLabel = hasPackageVulns
    ? "Package Vulnerabilities"
    : "Diagnostics";
  const secondHeader = hasPackageVulns
    ? `# of package vulnerabilities: ${groupedCves.length}`
    : `# of findings: ${nonCveDiagnostics.length}`;

  // ---------- Render ----------
  if (hasPackageVulns) {
    return (
      <Box className="st-root">
        <h3 className="st-h3">{secondHeader}</h3>
        <hr className="st-divider st-divider--narrow" />

        {/* Filters ONLY when there are CVEs */}
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

            const toolsStr = (g.byTool ?? []).length
              ? Array.from(new Set(g.byTool.map((t: any) => t.tool))).join(", ")
              : "—";

            const fixedStr =
              normalizeFixed(g.fixed ?? "").trim() || "Not fixed";

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
                                  <span className="hover-underline">
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
                                  <span className="hover-underline">
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
                    <strong>Finding Identified From: </strong>{" "}
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
  }

  // Diagnostics view (no CVEs)
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
              {/* diagnostics don't have explicit diff/unique tracking; add later if you extend DiffHints */}
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
                            <span className="hover-underline">{label}</span>
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
                            <span className="hover-underline">{label}</span>
                          </Tooltip>
                        ) : (
                          label
                        )}
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
              </ul>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

export default FindingTab;
