// page to display single PIQIUE output file (page 2)
import React, { useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import ScoreGauges from "../plotting/ScoreGauges";
import ProductFactorTabs from "../tabs/ProductFactorTabs";
import { parsePIQUEJSON, RelationalExtract } from "../../Utilities/DataParser";
import { DiffHints } from "../../Utilities/fileDiff";

// Jotai
import { useAtomValue, useSetAtom } from "jotai";
import {
  aspectAtom,
  securityTabAtom,
  measureAtom,
  openPlotsAtom,
  packageFilterAtom,
  cweBucketAtom,
  fixedFilterAtom,
  SecTabName,
} from "../../state/visualAtoms";

type Props = {
  jsonData?: any;
  diffHints?: DiffHints;
  diffFilter?: "all" | "differing" | "unique";

  // back-compatable controlled props...if omitted, atoms control the UI.
  controlledAspect?: string | null;
  onAspectChange?: (v: string | null) => void;

  controlledMeasure?: string | null;
  onMeasureChange?: (key: string | null) => void;

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

  relational?: RelationalExtract;
};

const SingleFileVisualizer: React.FC<Props> = (props) => {
  const location = useLocation();
  const jsonDataInput =
    (props.jsonData && (props.jsonData.data ?? props.jsonData)) ??
    location.state?.jsonData;

  // parse once per input
  const parsed = useMemo(() => parsePIQUEJSON(jsonDataInput), [jsonDataInput]);
  const { scores, relational } = parsed;

  // ------- atoms (readers & writers) -------
  const aspect = useAtomValue(aspectAtom);
  const secTab = useAtomValue(securityTabAtom);
  const measure = useAtomValue(measureAtom);
  const openPlots = useAtomValue(openPlotsAtom);
  const pkgFilter = useAtomValue(packageFilterAtom);
  const cweBucket = useAtomValue(cweBucketAtom);
  const fixedFilter = useAtomValue(fixedFilterAtom);

  const setAspect = useSetAtom(aspectAtom);
  const setSecTab = useSetAtom(securityTabAtom);
  const setMeasure = useSetAtom(measureAtom);
  const setOpenPlots = useSetAtom(openPlotsAtom);
  const setPkgFilter = useSetAtom(packageFilterAtom);
  const setCweBucket = useSetAtom(cweBucketAtom);
  const setFixedFilter = useSetAtom(fixedFilterAtom);

  // ------- controlled-prop fallbacks -------
  const selectedAspect = props.controlledAspect ?? aspect;
  const selectedMeasure = props.controlledMeasure ?? measure;
  const selectedBucket = props.controlledCWEBucket ?? cweBucket;
  const selectedPkg = props.controlledPackageFilter ?? pkgFilter;
  const selectedFixed = props.controlledFixedFilter ?? fixedFilter;
  const selectedPlots = props.controlledExpandedPlots ?? openPlots;

  const mapIn = (t?: "CWE" | "CVE" | "Lines of Code"): SecTabName | undefined =>
    t === "CWE" ? "PF" : t === "CVE" ? "VULN_OR_DIAG" : t;
  const mapOut = (t: SecTabName): "CWE" | "CVE" | "Lines of Code" =>
    t === "PF" ? "CWE" : t === "VULN_OR_DIAG" ? "CVE" : "Lines of Code";

  const selectedTab = mapIn(props.controlledSecurityTab) ?? secTab;

  // ------- handlers (write atoms unless controlled) -------
  const handleAspectClick = useCallback(
    (a: string | null) => {
      if (props.controlledAspect === undefined) setAspect(a);
      props.onAspectChange?.(a);
    },
    [props.controlledAspect, props.onAspectChange, setAspect]
  );

  const handleTabChange = useCallback(
    (t: SecTabName) => {
      if (props.controlledSecurityTab === undefined) setSecTab(t);
      props.onSecurityTabChange?.(mapOut(t));
    },
    [props.controlledSecurityTab, setSecTab, props.onSecurityTabChange]
  );

  const handleMeasureChange = useCallback(
    (m: string | null) => {
      if (props.controlledMeasure === undefined) setMeasure(m);
      props.onMeasureChange?.(m);
    },
    [props.controlledMeasure, setMeasure, props.onMeasureChange]
  );

  const handleBucketChange = useCallback(
    (b: "all" | "critical" | "severe" | "moderate") => {
      if (props.controlledCWEBucket === undefined) setCweBucket(b);
      props.onCWEBucketChange?.(b);
    },
    [props.controlledCWEBucket, setCweBucket, props.onCWEBucketChange]
  );

  const handlePkgFilterChange = useCallback(
    (v: string) => {
      if (props.controlledPackageFilter === undefined) setPkgFilter(v);
      props.onPackageFilterChange?.(v);
    },
    [props.controlledPackageFilter, setPkgFilter, props.onPackageFilterChange]
  );

  const handleFixedFilterChange = useCallback(
    (v: "all" | "fixed" | "notfixed") => {
      if (props.controlledFixedFilter === undefined) setFixedFilter(v);
      props.onFixedFilterChange?.(v);
    },
    [props.controlledFixedFilter, setFixedFilter, props.onFixedFilterChange]
  );

  const handleTogglePlot = useCallback(
    (key: string) => {
      if (!props.onTogglePlot) {
        const next = { ...selectedPlots, [key]: !selectedPlots[key] };
        setOpenPlots(next);
      } else {
        props.onTogglePlot(key);
      }
    },
    [props.onTogglePlot, selectedPlots, setOpenPlots]
  );

  return (
    <div className="app-container">
      <main className="main-content">
        <ScoreGauges
          scores={scores}
          onAspectClick={handleAspectClick}
          selectedAspect={selectedAspect}
        />

        {selectedAspect ? (
          <ProductFactorTabs
            aspectName={selectedAspect}
            scores={scores}
            relational={relational}
            diffHints={props.diffHints}
            diffFilter={props.diffFilter}
            controlledTab={selectedTab}
            onTabChange={handleTabChange}
            controlledMeasures={selectedMeasure}
            onMeausreChange={handleMeasureChange}
            controlledBucket={selectedBucket}
            onBucketChange={handleBucketChange}
            controlledPkgFilter={selectedPkg}
            onPkgFilterChange={handlePkgFilterChange}
            controlledFixedFilter={selectedFixed}
            onFixedFilterChange={handleFixedFilterChange}
            controlledExpandedPlots={selectedPlots}
            onTogglePlot={handleTogglePlot}
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

export default React.memo(SingleFileVisualizer);
