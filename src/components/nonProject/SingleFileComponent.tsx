// page to display single PIQIUE output file (page 2)
import React, { useMemo, useCallback, useEffect, useState } from "react";
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
  compareMode?: boolean;
  embedded?: boolean;

  // back-compatable controlled props...if omitted, atoms control the UI.
  controlledAspect?: string | null;
  onAspectChange?: (v: string | null) => void;

  controlledMeasure?: string | null;
  onMeasureChange?: (key: string | null) => void;

  controlledSecurityTab?: "CWE" | "CVE";
  onSecurityTabChange?: (v: "CWE" | "CVE") => void;

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

// key used by HamburgerMenu hard navigation
const SINGLE_PAYLOAD_KEY = "wp_single_payload";
const IDB_NAME = "wp_payload_db";
const IDB_STORE = "payloads";
const IDB_SINGLE_KEY = "single";
const IDB_SINGLE_PENDING_KEY = "wp_single_pending_idb";

const SingleFileVisualizer: React.FC<Props> = (props) => {
  const location = useLocation();
  const [idbPayload, setIdbPayload] = useState<any>(undefined);
  const [idbLoaded, setIdbLoaded] = useState(false);
  const [pendingIdb, setPendingIdb] = useState(() => {
    try {
      return sessionStorage.getItem(IDB_SINGLE_PENDING_KEY) === "1";
    } catch {
      return false;
    }
  });

  const openPayloadDb = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const readSinglePayload = () =>
    openPayloadDb().then(
      (db) =>
        new Promise<any>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readonly");
          tx.onerror = () => reject(tx.error);
          const req = tx.objectStore(IDB_STORE).get(IDB_SINGLE_KEY);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    );

  useEffect(() => {
    let canceled = false;
    readSinglePayload()
      .then((payload) => {
        if (!canceled && payload) {
          setIdbPayload(payload?.data ?? payload);
        }
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!canceled) setIdbLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingIdb || !idbLoaded) return;
    setPendingIdb(false);
    try {
      sessionStorage.removeItem(IDB_SINGLE_PENDING_KEY);
    } catch {
      /* ignore */
    }
  }, [pendingIdb, idbLoaded]);

  // 1) props.jsonData (supports embedded usage & Compare)
  // 2) router state from /visualizer navigation
  // 3) localStorage payload from hard navigation / menu upload
  // 4) global payload fallback
  let jsonDataInput =
    (props.jsonData && (props.jsonData.data ?? props.jsonData)) ?? undefined;

  if (!jsonDataInput) {
    jsonDataInput = (location.state as any)?.jsonData;
  }

  if (!jsonDataInput) {
    if (pendingIdb && idbPayload) {
      jsonDataInput = idbPayload;
    }
  }

  if (!jsonDataInput) {
    try {
      const raw = localStorage.getItem(SINGLE_PAYLOAD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        jsonDataInput = parsed?.data ?? parsed;
      }
    } catch (err) {
      console.error("Error reading single-file payload from localStorage", err);
    }
  }

  if (!jsonDataInput) {
    const cached = (globalThis as any).__wpSinglePayload as
      | { data?: any }
      | undefined;
    if (cached?.data) jsonDataInput = cached.data;
  }

  if (!jsonDataInput) {
    if (idbPayload) jsonDataInput = idbPayload;
  }

  const parsed = useMemo(
    () => (jsonDataInput ? parsePIQUEJSON(jsonDataInput) : null),
    [jsonDataInput]
  );

  const { scores, relational } = parsed ?? { scores: undefined, relational: undefined };

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

  const mapIn = (t?: "CWE" | "CVE"): SecTabName | undefined =>
    t === "CWE" ? "PF" : t === "CVE" ? "VULN_OR_DIAG" : undefined;
  const mapOut = (t: SecTabName): "CWE" | "CVE" =>
    t === "PF" ? "CWE" : "CVE";

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

  if (pendingIdb && !idbLoaded) {
    const loadingRootClass = props.embedded
      ? "flex h-full flex-col"
      : "flex flex-1 min-h-0 flex-col";
    const loadingMainClass = "flex flex-1 flex-col items-stretch px-0 pt-0";
    return (
      <div className={loadingRootClass}>
        <main className={loadingMainClass}>
          <p className="mt-8 text-center">
            <strong>Loading file...</strong>
          </p>
        </main>
      </div>
    );
  }

  if (!jsonDataInput) {
    if (!idbLoaded) {
      const loadingRootClass = props.embedded
        ? "flex h-full flex-col"
        : "flex flex-1 min-h-0 flex-col";
      const loadingMainClass = "flex flex-1 flex-col items-stretch px-0 pt-0";
      return (
        <div className={loadingRootClass}>
          <main className={loadingMainClass}>
            <p className="mt-8 text-center">
              <strong>Loading file...</strong>
            </p>
          </main>
        </div>
      );
    }
    const emptyRootClass = props.embedded
      ? "flex h-full flex-col"
      : "flex flex-1 min-h-0 flex-col";
    const emptyMainClass = "flex flex-1 flex-col items-stretch px-0 pt-0";
    return (
      <div className={emptyRootClass}>
        <main className={emptyMainClass}>
          <p className="mt-8 text-center">
            <strong>
              No file loaded. Use the menu to upload a PIQUE JSON file.
            </strong>
          </p>
        </main>
      </div>
    );
  }

  const rootClass = props.embedded
    ? "flex h-full flex-col"
    : "flex flex-1 min-h-0 flex-col";
  const mainClass = "flex flex-1 flex-col items-stretch px-0 pt-0";

  return (
    <div className={rootClass}>
      <main className={mainClass}>
        <ScoreGauges
          scores={scores}
          onAspectClick={handleAspectClick}
          selectedAspect={selectedAspect}
          className={props.compareMode && props.embedded ? "mt-0" : undefined}
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
          <p className="mt-8 text-center">
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
