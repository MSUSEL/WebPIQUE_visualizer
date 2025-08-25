// theme to compare two files; used for ComparePage.tsx
import React, { useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import SingleFileComponent from "./SingleFileComponent";
import SplitPane, { Pane } from "split-pane-react"; // split panes for comparing two files
import "split-pane-react/esm/themes/default.css";
import { ScrollSync, ScrollSyncPane } from "react-scroll-sync"; //sync user scroll
import "../styles/CompareStyle.css";

const Compare: React.FC = () => {
  const { state } = useLocation() as {
    state?: {
      file1?: { filename: string; data: any };
      file2?: { filename: string; data: any };
    };
  };
  const file1 = state?.file1;
  const file2 = state?.file2;
  if (!file1 || !file2) return <Navigate to="/" replace />; // if user navigates directly without state, bounce to home

  // grab file names
  const file1Name = file1.filename ?? "File 1";
  const file2Name = file2.filename ?? "File 2";

  // shared (mirrored) UI state
  const [selectedAspect, setSelectedAspect] = useState<string | null>(
    "Security"
  );
  const [selectedSecurityTab, setSelectedSecurityTab] = useState<
    "CWE" | "CVE" | "Lines of Code"
  >("CWE");
  const [expandedPF, setExpandedPF] = useState<string | null>(null);

  // resizable pane sizes
  const [sizes, setSizes] = useState([50, 50]);

  // mirror CWE filters
  const [cweBucket, setCweBucket] = useState<
    "all" | "critical" | "severe" | "moderate"
  >("all");

  //mirror CVE filters
  const [pkgFilter, setPkgFilter] = useState<string>("ALL");
  const [fixedFilter, setFixedFilter] = useState<"all" | "fixed" | "notfixed">(
    "all"
  );

  const sashRender = (_index: number, active: boolean) => (
    <div
      className={`sashRenderDots ${active ? "is-active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes"
    >
      <span></span>
    </div>
  );

  const SASH_W = 8;

  // display file names above visulaizer
  // use state to mirror clicks in both panes
  return (
    <div className="compare-app-container">
      <main
        className="compare-main-content"
        style={{ height: "calc(100vh - 140px)" }}
      >
        <div
          className="compare-filenames"
          style={{
            // left | sash | right
            gridTemplateColumns: `${sizes[0]}fr ${SASH_W}px ${sizes[1]}fr`,
          }}
        >
          <div className="name-left">
            <strong>File Name: </strong> {file1Name}
          </div>
          <div aria-hidden="true" /> {/* spacer for the sash */}
          <div className="name-right">
            <strong>File Name: </strong> {file2Name}
          </div>
        </div>

        <ScrollSync>
          <SplitPane
            split="vertical"
            sizes={sizes}
            onChange={setSizes}
            sashRender={sashRender}
          >
            <Pane minSize={260} className="split-pane">
              <ScrollSyncPane>
                <div style={{ height: "100%", overflow: "auto" }}>
                  <SingleFileComponent
                    jsonData={file1}
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
                  />
                </div>
              </ScrollSyncPane>
            </Pane>
            <Pane minSize={260}>
              <ScrollSyncPane>
                <div
                  className="pane-gap-right"
                  style={{ height: "100%", overflow: "auto" }}
                >
                  <SingleFileComponent
                    jsonData={file2}
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
                  />
                </div>
              </ScrollSyncPane>
            </Pane>
          </SplitPane>
        </ScrollSync>
      </main>
    </div>
  );
};

export default Compare;
