// MeasuresDropdown.tsx
import React from "react";
import { Collapse } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import "../../styles/SecurityTabs.css";

import ProbabilityDensity from "../plotting/ProbabilityDensity";
import ProbabilityCDF from "../plotting/ProbabilityCDF";
import { DiffHints } from "../../Utilities/fileDiff";

type FlagKind = "diff" | "unique" | null;

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

const normMeasureName = (s: any) =>
  String(s ?? "")
    .trim()
    .replace(/\s*Measure\s*$/i, "") // strip trailing “Measure”
    .replace(/\s+/g, " ");

const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

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

const firstThresholdsLen = (measures: any[]): number => {
  for (const m of measures ?? []) {
    const th: any = (m as any)?.thresholds ?? (m as any)?.threshold;
    if (Array.isArray(th) && th.length) return th.length;
  }
  return 0;
};

export type MeasuresDropdownProps = {
  pfName: string;
  measures: any[];

  isExpanded: boolean;
  onToggleExpand: () => void;

  visibleCount: number;
  onShowMore: () => void;

  diffFilter: "all" | "differing" | "unique";
  diffHints?: DiffHints;

  expandedPlots: Record<string, boolean>;
  onTogglePlot: (key: string) => void;

  pfBenchmarkSize?: number | null;
  pfPeerBenchmarkSize?: number | null;
  pfBenchmarkSizeIsDiff?: boolean;
};

const MeasuresDropdown: React.FC<MeasuresDropdownProps> = ({
  pfName,
  measures,
  isExpanded,
  onToggleExpand,
  visibleCount,
  onShowMore,
  diffFilter,
  diffHints,
  expandedPlots,
  onTogglePlot,
  pfBenchmarkSize,
  pfPeerBenchmarkSize,
  pfBenchmarkSizeIsDiff,
}) => {
  const showMore = isExpanded && visibleCount < (measures?.length ?? 0);

  const benchHere =
    typeof pfBenchmarkSize === "number"
      ? pfBenchmarkSize
      : firstThresholdsLen(measures);

  return (
    <li>
      <div style={{ marginTop: 6, marginBottom: 2 }}>
        <strong>Benchmark size: </strong>
        <span className={pfBenchmarkSizeIsDiff ? "diff-field" : ""}>
          {benchHere}
        </span>
        <Delta here={benchHere} peer={pfPeerBenchmarkSize ?? null} places={0} />
      </div>

      <div className="measure-toggle" onClick={onToggleExpand}>
        <strong>Measures</strong> (n = {measures.length})<strong>:</strong>
        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </div>

      {isExpanded && measures.length > 0 && (
        <div className="measure-list">
          <ul>
            {measures
              .slice(0, visibleCount)
              .map((measure: any, idx: number) => {
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
                const mSev = getSeverityInfo(Number(measure.score ?? 0));
                const plotKey = key;

                return (
                  <li
                    key={`${key}-${idx}`}
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
                      <span className="icon">{mSev.icon}</span>
                      <span className="label">{mSev.label}</span>
                    </div>
                    <strong>
                      {String(measure.name ?? "").replace(" Measure", "")}:
                    </strong>{" "}
                    {measure.description}
                    <ul>
                      <li>
                        <strong>
                          Score:{" "}
                          <span
                            className={
                              mDiff?.score && !isMissing ? "diff-field" : ""
                            }
                          >
                            {Number(measure.score ?? 0).toFixed(4)} out of 1.
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
                          {(Number(measure.score ?? 0) * 100).toFixed(2)}%
                          better than the benchmark set.
                        </span>
                      </li>

                      <li>
                        <strong>Weight:</strong> The measure contributed a{" "}
                        <strong>
                          <span
                            className={
                              mDiff?.weight && !isMissing ? "diff-field" : ""
                            }
                          >
                            {Number(measure.weight ?? 0).toFixed(4)}
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
                            onClick={() => onTogglePlot(plotKey)}
                            onKeyDown={(e) =>
                              e.key === "Enter" ? onTogglePlot(plotKey) : null
                            }
                            aria-expanded={!!expandedPlots[plotKey]}
                            aria-controls={`density-${plotKey}`}
                            style={{
                              textDecoration: "underline",
                              cursor: "pointer",
                              marginRight: 16,
                            }}
                          >
                            {expandedPlots[plotKey]
                              ? "Hide Plots"
                              : "Show Plots"}
                          </span>
                        </div>

                        <Collapse
                          in={!!expandedPlots[plotKey]}
                          timeout={0}
                          unmountOnExit
                        >
                          <div
                            className="densityPlot"
                            id={`density-${plotKey}`}
                          >
                            <ProbabilityDensity
                              thresholds={thresholds}
                              score={Number(measure.score ?? 0)}
                              cweName={String(measure.name ?? "")}
                            />
                          </div>

                          <div className="densityPlot" id={`cdf-${plotKey}`}>
                            <ProbabilityCDF
                              thresholds={thresholds}
                              percentile={Number(measure.score ?? 0)}
                              cweName={String(measure.name ?? "")}
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

          {showMore && (
            <div style={{ marginTop: 8 }}>
              <button className="st-chip" onClick={onShowMore}>
                Show {measures.length - visibleCount} more
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
};

export default MeasuresDropdown;
