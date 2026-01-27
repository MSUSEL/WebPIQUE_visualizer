// MeasuresDropdown.tsx
// Contains ALL "Measures" section UI + logic (expand/collapse, score/weight/plots),
// while preserving the exact <li> order within measure details.

import React, { useMemo, useState } from "react";
import { Collapse } from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ProbabilityDensity from "../plotting/ProbabilityDensity";
import ProbabilityCDF from "../plotting/ProbabilityCDF";
import { DiffHints } from "../../Utilities/fileDiff";

type ScoreBucket = "critical" | "severe" | "moderate";

type ScoreThresholds = {
  criticalMax: number;
  severeMax: number;
};

type SeverityInfo = {
  color: string;
  border: string;
  label: string;
  kind: ScoreBucket;
};

const formatThreshold = (val: number) => {
  const rounded = Number(val.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

// ---------- helpers (kept consistent with ProductFactorTabs) ----------
const getSeverityInfo = (
  score: number,
  thresholds: ScoreThresholds
): SeverityInfo =>
  score < thresholds.criticalMax
    ? {
      color: "#c5052fff",
      border: "solid",
      label: `Score < ${formatThreshold(thresholds.criticalMax)}`,
      kind: "critical" as const,
    }
    : score < thresholds.severeMax
      ? {
        color: "rgb(240,228,066)",
        border: "dashed",
        label: `Score ${formatThreshold(
          thresholds.criticalMax
        )}-${formatThreshold(thresholds.severeMax)}`,
        kind: "severe" as const,
      }
      : {
        color: "rgb(000,158,115)",
        border: "dotted",
        label: `Score >= ${formatThreshold(thresholds.severeMax)}`,
        kind: "moderate" as const,
      };

const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

type FlagKind = "diff" | "unique" | null;

const flagForMeasure = (
  pfName: string,
  mName: string,
  hints?: DiffHints
): FlagKind => {
  if (!hints) return null;
  const key = mkey(pfName, mName);
  return hints.missingMeasures?.has(key)
    ? "unique"
    : hints.differingMeasures?.has(key)
      ? "diff"
      : null;
};

const DiffBadge: React.FC<{ kind: FlagKind }> = ({ kind }) =>
  !kind ? null : (
    <span
      className="absolute left-[-3.5rem] top-2 text-[1.5rem] leading-none drop-shadow-[0_0_1px_rgba(0,0,0,0.25)]"
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

// ---------- types ----------
type Measure = {
  id?: string;
  name: string;
  description?: string;
  score: number;
  weight?: number;
  thresholds?: number[];
  threshold?: number[];
};

// ---------- props ----------
type Props = {
  pfName: string;
  measures: Measure[];

  // expand/collapse is controlled from ProductFactorTabs
  isExpanded: boolean;
  onToggleExpanded: () => void;

  // diff/unique + diffFilter behavior
  diffHints?: DiffHints;
  diffFilter?: "all" | "differing" | "unique";
  scoreThresholds: ScoreThresholds;

  // plot expansion (controlled/uncontrolled pattern preserved)
  expandedPlots: Record<string, boolean>;
  onTogglePlot: (key: string) => void;

  // paging for measures list
  visibleCount: number;
  onShowMore: () => void;
  hasMore: boolean;

  // these are used only to preserve the exact per-measure logic
  initialRenderKey?: string; // optional for testing/telemetry; not required
};

const MeasuresDropdown: React.FC<Props> = ({
  pfName,
  measures,
  isExpanded,
  onToggleExpanded,
  diffHints,
  diffFilter = "all",
  scoreThresholds,
  expandedPlots,
  onTogglePlot,
  visibleCount,
  onShowMore,
  hasMore,
}) => {
  const [measureLookupLocal, setMeasureLookupLocal] = useState<string>("ALL");
  const measureLookupFilter = measureLookupLocal;
  const [measureLookupInput, setMeasureLookupInput] = useState("");

  const filterInputSx = {
    "& .MuiInputBase-root": {
      height: 32,
      fontSize: "14px",
    },
    "& .MuiInputBase-input": {
      padding: "0 8px",
    },
  };

  const matchesMeasureLookup = (measure: Measure, filter = measureLookupFilter) =>
    filter === "ALL" || measure.name === filter;

  const matchesDiffFilter = (measure: Measure) => {
    if (!diffHints || diffFilter === "all") return true;
    const key = mkey(pfName, measure.name);
    if (diffFilter === "differing")
      return !!diffHints.differingMeasures?.has(key);
    return !!diffHints.missingMeasures?.has(key);
  };

  const renderedMeasures = useMemo(
    () => measures.slice(0, visibleCount),
    [measures, visibleCount]
  );

  const filteredMeasures = useMemo(
    () =>
      renderedMeasures.filter(
        (measure) => matchesDiffFilter(measure) && matchesMeasureLookup(measure)
      ),
    [renderedMeasures, diffFilter, diffHints, measureLookupFilter]
  );

  const measureOptions = useMemo(() => {
    const set = new Set<string>();
    measures.forEach((measure) => {
      if (!matchesDiffFilter(measure)) return;
      if (measure.name) set.add(measure.name);
    });
    if (measureLookupFilter !== "ALL") set.add(measureLookupFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [measures, diffFilter, diffHints, measureLookupFilter]);

  const allMeasureOptions = useMemo(
    () => ["ALL", ...measureOptions],
    [measureOptions]
  );

  const measureFilterOptions = createFilterOptions<string>({
    matchFrom: "any",
    stringify: (opt) => (opt === "ALL" ? "All measures" : opt),
    ignoreAccents: true,
    trim: true,
  });

  React.useEffect(() => {
    if (measureLookupFilter === "ALL") return;
    if (measureOptions.includes(measureLookupFilter)) return;
    setMeasureLookupLocal("ALL");
    setMeasureLookupInput("");
  }, [measureLookupFilter, measureOptions]);

  return (
    <>
      <div className="inline-flex cursor-pointer items-center select-none" onClick={onToggleExpanded}>
        <span className="mr-2">
          <strong>Measures</strong> (n = {measures.length})<strong>:</strong>
        </span>
        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </div>

      {isExpanded && measures.length > 0 && (
        <div className="px-3 py-2.5">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[15px] text-[#555]">Measure lookup</span>
              <Autocomplete
                options={allMeasureOptions}
                value={measureLookupFilter}
                onChange={(_, v) => setMeasureLookupLocal((v ?? "ALL") as string)}
                inputValue={measureLookupInput}
                onInputChange={(_, v) => setMeasureLookupInput(v)}
                getOptionLabel={(opt) => (opt === "ALL" ? "All measures" : opt)}
                filterOptions={measureFilterOptions}
                clearOnBlur={false}
                autoSelect
                openOnFocus
                sx={{ width: 240 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search measures..."
                    size="small"
                    sx={filterInputSx}
                  />
                )}
              />
            </label>
            <button
              className="h-[32px] rounded-md border border-[#bbb] bg-[#f5f5f5] px-2.5 text-[14px] hover:bg-black hover:text-white"
              onClick={() => {
                setMeasureLookupLocal("ALL");
                setMeasureLookupInput("");
              }}
              title="Clear filters"
            >
              Reset
            </button>
          </div>
          <ul>
            {filteredMeasures.map((measure: Measure, idx: number) => {
              const key = mkey(pfName, measure.name);
              const mDiff = diffHints?.measureFieldDiffs.get(key);
              const isMissing = diffHints?.missingMeasures?.has(key);

              const thresholds = (measure.thresholds ??
                measure.threshold ??
                []) as number[];
              const mSev = getSeverityInfo(measure.score, scoreThresholds);
              const id = key;

              return (
                <li
                  key={idx}
                  className="relative my-2 ml-7 rounded-md bg-white p-2.5 shadow-[0_1.5px_4px_rgba(0,0,0,0.12),0_0.5px_1px_rgba(0,0,0,0.06)]"
                  style={{
                    border: `2px ${mSev.border} ${mSev.color}`,
                  }}
                >
                  <DiffBadge
                    kind={flagForMeasure(pfName, measure.name, diffHints)}
                  />
                  <div className="inline-flex items-center gap-2">
                    <span
                      className={`inline-block h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] ${mSev.kind === "critical"
                        ? "bg-[#c5052f]"
                        : mSev.kind === "severe"
                          ? "bg-[rgb(240,228,66)]"
                          : "bg-[rgb(0,158,115)]"
                        }`}
                      aria-hidden="true"
                    />
                    <span className="label">{mSev.label}</span>
                  </div>
                  <div>
                    <strong>{measure.name.replace(" Measure", "")}:</strong>{" "}
                    {measure.description}
                  </div>
                  {/* DO NOT rearrange or change these <li> items */}
                  <ul>
                    <li>
                      <strong className="inline-flex items-center gap-1.5">
                        Score:{" "}
                        <span
                          className={
                            mDiff?.score && !isMissing
                              ? "rounded-[2px] bg-[#e49797] px-0.5"
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
                        peer={diffHints?.measurePeerValues?.get(key) ?? null}
                      />
                    </li>

                    <li>
                      <strong>Interpreted Score: </strong>
                      <span>
                        {(measure.score * 100).toFixed(2)}% better than the
                        benchmark set.
                      </span>
                    </li>

                    <li>
                      <strong>Weight: </strong> The measure contributed a weight of{" "}
                      <strong>
                        <span
                          className={
                            mDiff?.weight && !isMissing
                              ? "rounded-[2px] bg-[#e49797] px-0.5"
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
                        peer={diffHints?.measurePeerWeights?.get(key) ?? null}
                      />
                    </li>

                    <li>
                      <div className="mt-1.5">
                        <span
                          className="mr-4 cursor-pointer text-[#2f6fab] underline hover:opacity-80"
                          role="button"
                          tabIndex={0}
                          onClick={() => onTogglePlot(id)}
                          onKeyDown={(e) =>
                            e.key === "Enter" ? onTogglePlot(id) : null
                          }
                          aria-expanded={!!expandedPlots[id]}
                          aria-controls={`density-${id}`}
                        >
                          {expandedPlots[id] ? "Hide Plots" : "Show Plots"}
                        </span>
                      </div>

                      <Collapse
                        in={!!expandedPlots[id]}
                        timeout={0}
                        unmountOnExit
                      >
                        <div className="flex flex-wrap gap-4 pt-2">
                          <div className="w-[50%] min-w-0 overflow-hidden" id={`density-${id}`}>
                            <ProbabilityDensity
                              thresholds={thresholds}
                              score={measure.score ?? 0}
                              cweName={measure.name}
                            />
                          </div>

                          <div className="w-[50%] min-w-0 overflow-hidden" id={`cdf-${id}`}>
                            <ProbabilityCDF
                              thresholds={thresholds}
                              percentile={measure.score ?? 0}
                              cweName={measure.name}
                            />
                          </div>
                        </div>

                        <hr />
                        <div>
                          <strong>Top plot:</strong> Density of benchmark set
                          with a horizontal line marking the area under the
                          density curve that matches the measure score.{" "}
                          <strong>Bottom plot:</strong> ECDF plot showing how
                          much better the measure score is than the benchmark.
                        </div>
                      </Collapse>
                    </li>
                  </ul>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="mt-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f5f5f5] px-2.5 py-1.5 text-[16px] leading-none text-[#222] transition hover:bg-black hover:text-white active:translate-y-[1px]"
                onClick={onShowMore}
              >
                Show {Math.max(0, measures.length - visibleCount)} more
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default MeasuresDropdown;
