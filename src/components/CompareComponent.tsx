// CompareComponent.tsx — side-by-side compare with synced panes - mostly unique to webpique
import React, { useState, useEffect, useMemo } from "react";
import { useLocation, Navigate } from "react-router-dom";
import SplitPane, { Pane } from "split-pane-react";
import { ScrollSync, ScrollSyncPane } from "react-scroll-sync";
import { Switch, FormControlLabel } from "@mui/material";
import SingleFileComponent from "./SingleFileComponent";
import "split-pane-react/esm/themes/default.css";
import "../styles/CompareStyle.css";

import { parsePIQUEJSON } from "../Utilities/DataParser";
import { buildDiffHints, DiffHints } from "../Utilities/fileDiff";

type UploadPayload = { filename: string; data: any };
type OneChild = React.ReactElement;

const SASH_W = 8;

const Compare: React.FC = () => {
  const { state } = useLocation() as {
    state?: { file1?: UploadPayload; file2?: UploadPayload };
  };

  const file1 = state?.file1;
  const file2 = state?.file2;
  if (!file1 || !file2) return <Navigate to="/" replace />;

  const file1Name = file1.filename ?? "File 1";
  const file2Name = file2.filename ?? "File 2";

  // parse both files ONCE
  const scores1 = useMemo(
    () => parsePIQUEJSON((file1 as any).data ?? file1).scores,
    [file1]
  );
  const scores2 = useMemo(
    () => parsePIQUEJSON((file2 as any).data ?? file2).scores,
    [file2]
  );

  // diff hints (make them directional so each pane highlights what *differs vs the other*)
  const leftHints: DiffHints = useMemo(
    () => buildDiffHints(scores1, scores2),
    [scores1, scores2]
  );
  const rightHints: DiffHints = useMemo(
    () => buildDiffHints(scores2, scores1),
    [scores1, scores2]
  );

  // legend counts per pf or finding
  const union = <T,>(a: Iterable<T>, b: Iterable<T>) =>
    new Set<T>([...a, ...b]);

  // CWE
  const cweDiffCount = useMemo(() => {
    const pf = union(leftHints.differingPFs, rightHints.differingPFs).size;
    const ms = union(
      leftHints.differingMeasures,
      rightHints.differingMeasures
    ).size;
    return pf + ms;
  }, [leftHints, rightHints]);

  const cweUniqueCount = useMemo(() => {
    const pf = union(leftHints.missingPFs, rightHints.missingPFs).size;
    const ms = union(
      leftHints.missingMeasures,
      rightHints.missingMeasures
    ).size;
    return pf + ms;
  }, [leftHints, rightHints]);

  // package vulnerabilities
  const cveDiffCount = useMemo(() => {
    return union(leftHints.differingCVEs, rightHints.differingCVEs).size;
  }, [leftHints, rightHints]);

  const cveUniqueCount = useMemo(() => {
    return union(leftHints.missingCVEs, rightHints.missingCVEs).size;
  }, [leftHints, rightHints]);

  // mirrored UI state across both panes
  const [selectedAspect, setSelectedAspect] = useState<string | null>("null");
  const [selectedSecurityTab, setSelectedSecurityTab] = useState<
    "CWE" | "CVE" | "Lines of Code"
  >("CWE");

  // legend filter: "all", "differing", "unique"
  type DiffFilter = "all" | "differing" | "unique";
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");

  //reset view when new file is loaded
  useEffect(() => {
    setSelectedAspect(null);
    setSelectedSecurityTab("CWE");
    setExpandedPF(null);
    setCweBucket("all");
    setPkgFilter("ALL");
    setFixedFilter("all");
    setDiffFilter("all");
  }, [file1?.filename, file2?.filename]);

  const [expandedPF, setExpandedPF] = useState<string | null>(null);
  const [cweBucket, setCweBucket] = useState<
    "all" | "critical" | "severe" | "moderate"
  >("all");
  const [pkgFilter, setPkgFilter] = useState<string>("ALL");
  const [fixedFilter, setFixedFilter] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );

  const [sizes, setSizes] = useState<number[]>([50, 50]);

  const sashRender = (_i: number, active: boolean) => (
    <div
      className={`sashRenderDots ${active ? "is-active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes"
    >
      <span />
    </div>
  );

  // legend filter toggle
  const activate = (tab: "CWE" | "CVE", filter: DiffFilter) => {
    // always ensure the Security view is visible
    setSelectedAspect("Security");

    // toggle off if clicking the same chip again
    if (selectedSecurityTab === tab && diffFilter === filter) {
      setDiffFilter("all");
      return;
    }
    setSelectedSecurityTab(tab);
    setDiffFilter(filter);
  };

  // density plot sync
  const [openPlots, setOpenPlots] = useState<Record<string, boolean>>({});
  const syncTogglePlot = (key: string) =>
    setOpenPlots((prev) => ({ ...prev, [key]: !prev[key] }));

  // scroll sync on/off toggle
  const [syncScroll, setSyncScroll] = useState(true);

  interface MaybeSyncPaneProps {
    enabled: boolean;
    children: OneChild;
  }

  const MaybeSyncPane = ({
    enabled,
    children,
  }: MaybeSyncPaneProps): JSX.Element =>
    enabled ? <ScrollSyncPane>{children}</ScrollSyncPane> : children;

  return (
    <div className="compare-app-container">
      <main
        className="compare-main-content"
        style={{ height: "calc(100vh - 140px)" }}
      >
        <div
          className="compare-filenames"
          style={{
            gridTemplateColumns: `${sizes[0]}fr ${SASH_W}px ${sizes[1]}fr`,
          }}
        >
          <div className="name-left">
            <strong>File Name:</strong>&nbsp;{file1Name}
          </div>
          <div aria-hidden="true" />
          <div className="name-right">
            <strong>File Name:</strong>&nbsp;{file2Name}
            <FormControlLabel
              sx={{ ml: 1 }}
              control={
                <Switch
                  size="small"
                  checked={syncScroll}
                  onChange={(e) => setSyncScroll(e.target.checked)}
                  inputProps={{ "aria-label": "Toggle synchronized scrolling" }}
                />
              }
              label={syncScroll ? "Scroll sync: ON" : "Scroll sync: OFF"}
            />
          </div>
        </div>

        {/* legend filter */}
        {selectedAspect === "Security" && (
          <div className="page-legend">
            <div className="legend-row">
              <span
                className={`legend-chip legend-chip--diff ${selectedSecurityTab === "CWE" && diffFilter === "differing"
                    ? "is-active"
                    : ""
                  }`}
                role="button"
                tabIndex={0}
                onClick={() => activate("CWE", "differing")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  activate("CWE", "differing")
                }
              >
                🚩 Differing CWE items{" "}
                <span className="legend-count">{cweDiffCount}</span>
              </span>
              <span
                className={`legend-chip legend-chip--unique ${selectedSecurityTab === "CWE" && diffFilter === "unique"
                    ? "is-active"
                    : ""
                  }`}
                role="button"
                tabIndex={0}
                onClick={() => activate("CWE", "unique")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  activate("CWE", "unique")
                }
              >
                ‼️ Unique CWE items{" "}
                <span className="legend-count">{cweUniqueCount}</span>
              </span>
              <span
                className={`legend-chip legend-chip--diff ${selectedSecurityTab === "CVE" && diffFilter === "differing"
                    ? "is-active"
                    : ""
                  }`}
                role="button"
                tabIndex={0}
                onClick={() => activate("CVE", "differing")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  activate("CVE", "differing")
                }
              >
                🚩 Differing package vulnerabilities{" "}
                <span className="legend-count">{cveDiffCount}</span>
              </span>
              <span
                className={`legend-chip legend-chip--unique ${selectedSecurityTab === "CVE" && diffFilter === "unique"
                    ? "is-active"
                    : ""
                  }`}
                role="button"
                tabIndex={0}
                onClick={() => activate("CVE", "unique")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  activate("CVE", "unique")
                }
              >
                ‼️ Unique package vulnerabilities{" "}
                <span className="legend-count">{cveUniqueCount}</span>
              </span>
              <span
                className="legend-reset"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedAspect("Security");
                  setDiffFilter("all");
                }}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  (setSelectedAspect("Security"), setDiffFilter("all"))
                }
                title="Show all"
              >
                All items
              </span>
            </div>
            <div className="legend-caption">
              🚩 denotes item is present in both files but information differs
              (changed fields highlighted).
              <br />
              ‼️ denotes item is present in only one file (no sub-field
              highlights).
            </div>
          </div>
        )}

        <ScrollSync>
          <SplitPane
            split="vertical"
            sizes={sizes}
            onChange={setSizes}
            sashRender={sashRender}
          >
            <Pane minSize={260}>
              <MaybeSyncPane enabled={syncScroll}>
                <div style={{ height: "100%", overflow: "auto" }}>
                  <SingleFileComponent
                    jsonData={file1}
                    diffHints={leftHints}
                    diffFilter={diffFilter}
                    controlledAspect={selectedAspect}
                    onAspectChange={setSelectedAspect}
                    controlledSecurityTab={selectedSecurityTab}
                    onSecurityTabChange={setSelectedSecurityTab}
                    controlledMeasure={expandedPF}
                    onMeasureChange={setExpandedPF}
                    controlledCWEBucket={cweBucket}
                    onCWEBucketChange={setCweBucket}
                    controlledPackageFilter={pkgFilter}
                    onPackageFilterChange={setPkgFilter}
                    controlledFixedFilter={fixedFilter}
                    onFixedFilterChange={setFixedFilter}
                    controlledExpandedPlots={openPlots}
                    onTogglePlot={syncTogglePlot}
                  />
                </div>
              </MaybeSyncPane>
            </Pane>

            <Pane minSize={260}>
              <MaybeSyncPane enabled={syncScroll}>
                <div
                  className="pane-gap-right"
                  style={{ height: "100%", overflow: "auto" }}
                >
                  <SingleFileComponent
                    jsonData={file2}
                    diffHints={rightHints}
                    diffFilter={diffFilter}
                    controlledAspect={selectedAspect}
                    onAspectChange={setSelectedAspect}
                    controlledSecurityTab={selectedSecurityTab}
                    onSecurityTabChange={setSelectedSecurityTab}
                    controlledMeasure={expandedPF}
                    onMeasureChange={setExpandedPF}
                    controlledCWEBucket={cweBucket}
                    onCWEBucketChange={setCweBucket}
                    controlledPackageFilter={pkgFilter}
                    onPackageFilterChange={setPkgFilter}
                    controlledFixedFilter={fixedFilter}
                    onFixedFilterChange={setFixedFilter}
                    controlledExpandedPlots={openPlots}
                    onTogglePlot={syncTogglePlot}
                  />
                </div>
              </MaybeSyncPane>
            </Pane>
          </SplitPane>
        </ScrollSync>
      </main>
    </div>
  );
};

export default Compare;
