// CompareComponent.tsx — side-by-side compare with synced panes
import React, { useState, useEffect } from "react";
import { useLocation, Navigate } from "react-router-dom";
import SplitPane, { Pane } from "split-pane-react";
import { ScrollSync, ScrollSyncPane } from "react-scroll-sync";
import SingleFileComponent from "./SingleFileComponent";
import "split-pane-react/esm/themes/default.css";
import "../styles/CompareStyle.css";

type UploadPayload = { filename: string; data: any };

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

  // mirrored UI state across both panes
  const [selectedAspect, setSelectedAspect] = useState<string | null>("null");
  const [selectedSecurityTab, setSelectedSecurityTab] =
    useState<"CWE" | "CVE" | "Lines of Code">("CWE");

  //reset view when new file is loaded
  useEffect(() => {
    setSelectedAspect(null);
    setSelectedSecurityTab("CWE");
    setExpandedPF(null);
    setCweBucket("all");
    setPkgFilter("ALL");
    setFixedFilter("all");
  }, [file1?.filename, file2?.filename]);

  const [expandedPF, setExpandedPF] = useState<string | null>(null);
  const [cweBucket, setCweBucket] =
    useState<"all" | "critical" | "severe" | "moderate">("all");
  const [pkgFilter, setPkgFilter] = useState<string>("ALL");
  const [fixedFilter, setFixedFilter] =
    useState<"all" | "fixed" | "notfixed">("all");

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

  return (
    <div className="compare-app-container">
      <main className="compare-main-content" style={{ height: "calc(100vh - 140px)" }}>
        {/* Filenames row: left | sash | right */}
        <div
          className="compare-filenames"
          style={{ gridTemplateColumns: `${sizes[0]}fr ${SASH_W}px ${sizes[1]}fr` }}
        >
          <div className="name-left">
            <strong>File Name:</strong>&nbsp;{file1Name}
          </div>
          <div aria-hidden="true" />
          <div className="name-right">
            <strong>File Name:</strong>&nbsp;{file2Name}
          </div>
        </div>

        <ScrollSync>
          <SplitPane
            split="vertical"
            sizes={sizes}
            onChange={setSizes}
            sashRender={sashRender}
          >
            <Pane minSize={260}>
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
                <div className="pane-gap-right" style={{ height: "100%", overflow: "auto" }}>
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

