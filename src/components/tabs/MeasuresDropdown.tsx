// MeasuresDropdown.tsx
// Contains ALL "Measures" section UI + logic (expand/collapse, score/weight/plots),
// while preserving the exact <li> order within measure details.

import React, { useMemo } from "react";
import { Collapse } from "@mui/material";
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
  // pre-slice here so we do not rearrange <li> items; we only omit items by returning null
  const renderedMeasures = useMemo(
    () => measures.slice(0, visibleCount),
    [measures, visibleCount]
  );

  return (
    <>
      <div className="measure-toggle" onClick={onToggleExpanded}>
        <span className="measure-toggle-label">
          <strong>Measures</strong> (n = {measures.length})<strong>:</strong>
        </span>
        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </div>

      {isExpanded && measures.length > 0 && (
        <div className="measure-list">
          <ul>
            {renderedMeasures.map((measure: Measure, idx: number) => {
              const key = mkey(pfName, measure.name);
              const mDiff = diffHints?.measureFieldDiffs.get(key);
              const isMissing = diffHints?.missingMeasures?.has(key);

              if (
                diffFilter === "differing" &&
                !diffHints?.differingMeasures?.has(key)
              )
                return null;
              if (diffFilter === "unique" && !isMissing) return null;

              const thresholds = (measure.thresholds ??
                measure.threshold ??
                []) as number[];
              const mSev = getSeverityInfo(measure.score, scoreThresholds);
              const id = key;

              return (
                <li
                  key={idx}
                  className="measure-item card--with-badge"
                  style={{
                    border: `2px ${mSev.border} ${mSev.color}`,
                    backgroundColor: "#fff",
                  }}
                >
                  <DiffBadge
                    kind={flagForMeasure(pfName, measure.name, diffHints)}
                  />
                  <div className="severity-badge">
                    <span
                      className={`severity-dot severity-dot--${mSev.kind}`}
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
                      <strong className="score-marker">
                        Score:{" "}
                        <span
                          className={
                            mDiff?.score && !isMissing ? "diff-field" : ""
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
                      Weight: The measure contributed a weight of{" "}
                      <strong>
                        <span
                          className={
                            mDiff?.weight && !isMissing ? "diff-field" : ""
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
                      <div style={{ marginTop: 6 }}>
                        <span
                          className="density-link"
                          role="button"
                          tabIndex={0}
                          onClick={() => onTogglePlot(id)}
                          onKeyDown={(e) =>
                            e.key === "Enter" ? onTogglePlot(id) : null
                          }
                          aria-expanded={!!expandedPlots[id]}
                          aria-controls={`density-${id}`}
                          style={{
                            textDecoration: "underline",
                            cursor: "pointer",
                            marginRight: 16,
                          }}
                        >
                          {expandedPlots[id] ? "Hide Plots" : "Show Plots"}
                        </span>
                      </div>

                      <Collapse
                        in={!!expandedPlots[id]}
                        timeout={0}
                        unmountOnExit
                      >
                        <div className="densityPlot" id={`density-${id}`}>
                          <ProbabilityDensity
                            thresholds={thresholds}
                            score={measure.score ?? 0}
                            cweName={measure.name}
                          />
                        </div>

                        <div className="densityPlot" id={`cdf-${id}`}>
                          <ProbabilityCDF
                            thresholds={thresholds}
                            percentile={measure.score ?? 0}
                            cweName={measure.name}
                          />
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
            <div style={{ marginTop: 8 }}>
              <button className="st-chip" onClick={onShowMore}>
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
