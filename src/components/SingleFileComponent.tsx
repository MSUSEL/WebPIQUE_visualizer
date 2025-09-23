//Page to display single PIQIUE output file (page 2)
import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import ScoreGauges from "./ScoreGauges";
import ProductFactorTabs from "./ProductFactorTabs";
import { parsePIQUEJSON } from "../Utilities/DataParser";
import { DiffHints } from "../Utilities/fileDiff";
import { RelationalExtract } from "../Utilities/DataParser";

type Props = {
  jsonData?: any;
  diffHints?: DiffHints;
  controlledAspect?: string | null;
  onAspectChange?: (v: string | null) => void;
  controlledMeasure?: string | null;
  onMeasureChange?: (key: string | null) => void;

  // keep old names for backwards-compat:
  controlledSecurityTab?: "CWE" | "CVE" | "Lines of Code";
  onSecurityTabChange?: (v: "CWE" | "CVE" | "Lines of Code") => void;

  controlledCWEBucket?: "all" | "critical" | "severe" | "moderate";
  onCWEBucketChange?: (v: "all" | "critical" | "severe" | "moderate") => void;

  controlledPackageFilter?: string;
  onPackageFilterChange?: (v: string) => void;
  controlledFixedFilter?: "all" | "fixed" | "notfixed";
  onFixedFilterChange?: (v: "all" | "fixed" | "notfixed") => void;
  controlledExpandedPlots?: Record<string, boolean>;
  onTogglePlot?: (key: string) => void;
  diffFilter?: "all" | "differing" | "unique";
  relational?: RelationalExtract;
};

const SingleFileVisualizer: React.FC<Props> = (props) => {
  const location = useLocation();
  const jsonDataInput =
    (props.jsonData && (props.jsonData.data ?? props.jsonData)) ??
    location.state?.jsonData;
  const [localAspect, setLocalAspect] = useState<string | null>(null);

  const { scores, relational } = parsePIQUEJSON(jsonDataInput);

  // selected aspect: controlled or local
  const selectedAspect = props.controlledAspect ?? localAspect;

  const handleAspectClick = (aspect: string | null) => {
    if (props.controlledAspect === undefined) setLocalAspect(aspect);
    props.onAspectChange?.(aspect);
  };

  // --- map legacy "Security tab" names to new ProductFactorTabs names ---
  type SecTabName = "PF" | "VULN_OR_DIAG" | "Lines of Code";
  const mapIn = (t?: "CWE" | "CVE" | "Lines of Code"): SecTabName | undefined =>
    t === "CWE" ? "PF" : t === "CVE" ? "VULN_OR_DIAG" : t;

  const mapOut = (t: SecTabName): "CWE" | "CVE" | "Lines of Code" =>
    t === "PF" ? "CWE" : t === "VULN_OR_DIAG" ? "CVE" : "Lines of Code";

  const handleTabChange = (t: SecTabName) => {
    props.onSecurityTabChange?.(mapOut(t));
  };

  return (
    <div className="app-container">
      <main className="main-content">
        <ScoreGauges scores={scores} onAspectClick={handleAspectClick} />

        {selectedAspect ? (
          <ProductFactorTabs
            aspectName={selectedAspect}
            scores={scores}
            diffHints={props.diffHints}
            diffFilter={props.diffFilter}
            controlledTab={mapIn(props.controlledSecurityTab)}
            onTabChange={handleTabChange}
            controlledMeasures={props.controlledMeasure}
            onMeausreChange={props.onMeasureChange}
            controlledBucket={props.controlledCWEBucket}
            onBucketChange={props.onCWEBucketChange}
            controlledPkgFilter={props.controlledPackageFilter}
            onPkgFilterChange={props.onPackageFilterChange}
            controlledFixedFilter={props.controlledFixedFilter}
            onFixedFilterChange={props.onFixedFilterChange}
            controlledExpandedPlots={props.controlledExpandedPlots}
            onTogglePlot={props.onTogglePlot}
            relational={relational}
          />
        ) : (
          <p style={{ textAlign: "center", marginTop: "2rem" }}>
            <strong>
              Click on a Quality Aspect above to view more information.
            </strong>
          </p>
        )}
      </main>
    </div>
  );
};

export default SingleFileVisualizer;
