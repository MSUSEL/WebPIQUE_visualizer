// side-by-side compare with synced panes - mostly unique to webpique
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useLocation, Navigate } from "react-router-dom";
import SplitPane, { Pane } from "split-pane-react";
import { ScrollSync, ScrollSyncPane } from "react-scroll-sync";
import { Switch, FormControlLabel } from "@mui/material";

import SingleFileComponent from "./SingleFileComponent";
import { parsePIQUEJSON } from "../../Utilities/DataParser";
import { buildDiffHints, DiffHints } from "../../Utilities/fileDiff";

// Jotai to prevent rerender on click
import { Provider, createStore } from "jotai";
import { aspectAtom, securityTabAtom } from "../../state/visualAtoms";

type UploadPayload = { filename: string; data: any };

const SASH_W = 8;
type DiffFilter = "all" | "differing" | "unique";

type CompareProps = {
  file1?: UploadPayload;
  file2?: UploadPayload;
  embedded?: boolean;
  initialSizes?: number[];
};

// key used by HamburgerMenu hard navigation
const COMPARE_PAYLOAD_KEY = "wp_compare_payload";
const COMPARE_PAYLOAD_SESSION_KEY = "wp_compare_payload_session";
const IDB_NAME = "wp_payload_db";
const IDB_STORE = "payloads";
const IDB_COMPARE_KEY = "compare";
const IDB_COMPARE_PENDING_KEY = "wp_compare_pending_idb";

const Compare: React.FC<CompareProps> = (props) => {
  const { state } = useLocation() as {
    state?: { file1?: UploadPayload; file2?: UploadPayload };
  };
  const [idbPayload, setIdbPayload] = useState<
    { file1?: UploadPayload; file2?: UploadPayload } | undefined
  >(undefined);
  const [idbLoaded, setIdbLoaded] = useState(false);
  const [pendingIdb, setPendingIdb] = useState(() => {
    try {
      return sessionStorage.getItem(IDB_COMPARE_PENDING_KEY) === "1";
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

  const readComparePayload = () =>
    openPayloadDb().then(
      (db) =>
        new Promise<{ file1?: UploadPayload; file2?: UploadPayload } | undefined>(
          (resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readonly");
            tx.onerror = () => reject(tx.error);
            const req = tx.objectStore(IDB_STORE).get(IDB_COMPARE_KEY);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          }
        )
    );

  useEffect(() => {
    let canceled = false;
    readComparePayload()
      .then((payload) => {
        if (!canceled && payload) {
          setIdbPayload(payload);
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
      sessionStorage.removeItem(IDB_COMPARE_PENDING_KEY);
    } catch {
      /* ignore */
    }
  }, [pendingIdb, idbLoaded]);

  // 1) prefer props (embedded usage)
  // 2) fallback to router state
  // 3) fallback to localStorage payload (hard navigation)
  let file1: UploadPayload | undefined = props.file1 ?? state?.file1;
  let file2: UploadPayload | undefined = props.file2 ?? state?.file2;

  if (!file1 || !file2) {
    const cached = (globalThis as any).__wpComparePayload as
      | { file1?: UploadPayload; file2?: UploadPayload }
      | undefined;
    if (cached?.file1) file1 = cached.file1;
    if (cached?.file2) file2 = cached.file2;
  }

  if (!file1 || !file2) {
    if (pendingIdb) {
      if (idbPayload?.file1 && idbPayload?.file2) {
        file1 = idbPayload.file1;
        file2 = idbPayload.file2;
      }
    } else {
      try {
        const sessionRaw = sessionStorage.getItem(COMPARE_PAYLOAD_SESSION_KEY);
        if (sessionRaw) {
          const parsed = JSON.parse(sessionRaw) as {
            file1?: UploadPayload;
            file2?: UploadPayload;
          };
          if (!file1 && parsed.file1) file1 = parsed.file1;
          if (!file2 && parsed.file2) file2 = parsed.file2;
        }
      } catch (err) {
        console.error("Error reading compare payload from sessionStorage", err);
      }
    }
  }

  if (!file1 || !file2) {
    if (!pendingIdb) {
      try {
        const raw = localStorage.getItem(COMPARE_PAYLOAD_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            file1?: UploadPayload;
            file2?: UploadPayload;
          };
          if (!file1 && parsed.file1) file1 = parsed.file1;
          if (!file2 && parsed.file2) file2 = parsed.file2;
        }
      } catch (err) {
        console.error("Error reading compare payload from localStorage", err);
      }
    }
  }

  if (!file1 || !file2) {
    if (idbPayload?.file1 && idbPayload?.file2) {
      file1 = idbPayload.file1;
      file2 = idbPayload.file2;
    }
  }

  const sizesInit = props.initialSizes ?? [50, 50];

  const file1Name = file1?.filename ?? "File 1";
  const file2Name = file2?.filename ?? "File 2";

  const formatCompareFileName = (name: string, maxBase = 20) => {
    const safe = String(name ?? "");
    if (!safe) return safe;
    const lower = safe.toLowerCase();
    const hasJson = lower.endsWith(".json");
    const base = hasJson ? safe.slice(0, -5) : safe;
    if (base.length <= maxBase) return safe;
    const trimmed = base.slice(0, maxBase);
    return hasJson ? `${trimmed}...json` : `${trimmed}...`;
  };

  const displayFile1Name = formatCompareFileName(file1Name);
  const displayFile2Name = formatCompareFileName(file2Name);

  // parse once per file (keep both scores + relational for CVE/diagnostic scoping)
  const parsed1 = useMemo(
    () => (file1 ? parsePIQUEJSON((file1 as any).data ?? file1) : null),
    [file1]
  );
  const parsed2 = useMemo(
    () => (file2 ? parsePIQUEJSON((file2 as any).data ?? file2) : null),
    [file2]
  );

  const scores1 = parsed1?.scores;
  const scores2 = parsed2?.scores;

  // DataParser has varied slightly over time; tolerate common property names.
  const relational1: any =
    (parsed1 as any)?.relational ?? (parsed1 as any)?.relationalExtract ?? null;
  const relational2: any =
    (parsed2 as any)?.relational ?? (parsed2 as any)?.relationalExtract ?? null;

  // build diff hints (directional)
  const leftHints: DiffHints = useMemo(
    () => buildDiffHints(scores1, scores2, relational1, relational2),
    [scores1, scores2, relational1, relational2]
  );
  const rightHints: DiffHints = useMemo(
    () => buildDiffHints(scores2, scores1, relational2, relational1),
    [scores1, scores2, relational1, relational2]
  );

  // ---------- helpers for per-aspect counts ----------

  const unionFiltered = useCallback(
    <T,>(
      a: Iterable<T>,
      b: Iterable<T>,
      predicate: (value: T) => boolean
    ): Set<T> => {
      const out = new Set<T>();
      for (const v of a) if (predicate(v)) out.add(v);
      for (const v of b) if (predicate(v)) out.add(v);
      return out;
    },
    []
  );

  const getAspectPFNames = useCallback(
    (scores: any, aspectName: string | null): string[] => {
      if (!scores || !aspectName) return [];
      const byAspect = (scores?.productFactorsByAspect ?? {}) as Record<
        string,
        any[]
      >;
      let list = (byAspect?.[aspectName] ?? []) as any[];

      // fallback for "Security" to legacy cweProductFactors, like ProductFactorTabs
      if (list.length === 0 && /security/i.test(aspectName || "")) {
        list = (scores?.cweProductFactors ?? []) as any[];
      }

      return list
        .map((pf) => pf?.name)
        .filter(
          (name: any): name is string => typeof name === "string" && !!name
        );
    },
    []
  );

  const getAspectPFNameSet = useCallback(
    (scoresLeft: any, scoresRight: any, aspectName: string | null) => {
      const set = new Set<string>();
      for (const name of getAspectPFNames(scoresLeft, aspectName))
        set.add(name);
      for (const name of getAspectPFNames(scoresRight, aspectName))
        set.add(name);
      return set;
    },
    [getAspectPFNames]
  );

  // IMPORTANT: scope CVE/diagnostic IDs using relational graph (same logic as FindingsTab)
  const getAspectDiagIdSet = useCallback(
    (
      scoresLeft: any,
      scoresRight: any,
      relLeft: any,
      relRight: any,
      aspectName: string | null
    ) => {
      const out = new Set<string>();
      if (!aspectName) return out;

      const norm = (v: any) => String(v ?? "").trim();

      // build PF id/name set for the ACTIVE aspect (mirrors ProductFactorTabs)
      const aspectPfIdSet = new Set<string>();
      const addPfIdsFromScores = (scores: any) => {
        if (!scores) return;
        const byAspect = (scores?.productFactorsByAspect ?? {}) as Record<
          string,
          any[]
        >;
        let list = (byAspect?.[aspectName] ?? []) as any[];
        if (list.length === 0 && /security/i.test(aspectName || "")) {
          list = (scores?.cweProductFactors ?? []) as any[];
        }
        for (const pf of list ?? []) {
          const id = pf?.id != null ? norm(pf.id) : "";
          const name = pf?.name != null ? norm(pf.name) : "";
          if (id) aspectPfIdSet.add(id);
          if (name) aspectPfIdSet.add(name);
        }
      };
      addPfIdsFromScores(scoresLeft);
      addPfIdsFromScores(scoresRight);

      if (aspectPfIdSet.size === 0) return out;

      const addFromRelational = (rel: any) => {
        if (!rel) return;

        // diagnosticId -> measureIds
        const diagToMeasures = new Map<string, string[]>();
        (rel.measureDiagnostics ?? []).forEach((e: any) => {
          const diagId = norm(e?.diagnosticId);
          const measureId = norm(e?.measureId);
          if (!diagId || !measureId) return;
          const arr = diagToMeasures.get(diagId) ?? [];
          arr.push(measureId);
          diagToMeasures.set(diagId, arr);
        });

        // measureId -> pfIds
        const measureToPfs = new Map<string, string[]>();
        (rel.pfMeasures ?? []).forEach((e: any) => {
          const pfId = norm(e?.pfId);
          const measureId = norm(e?.measureId);
          if (!pfId || !measureId) return;
          const arr = measureToPfs.get(measureId) ?? [];
          arr.push(pfId);
          measureToPfs.set(measureId, arr);
        });

        const diagTouchesAspect = (diagIdRaw: any): boolean => {
          const diagId = norm(diagIdRaw);
          if (!diagId) return false;
          const measureIds = diagToMeasures.get(diagId) ?? [];
          for (const mid of measureIds) {
            const pfIds = measureToPfs.get(mid) ?? [];
            for (const pfId of pfIds) {
              if (aspectPfIdSet.has(pfId)) return true;
            }
          }
          return false;
        };

        // include CVEs/GHSAs/etc stored as findings
        // Findings are keyed by the vulnerability id (e.g., CVE-2024-4067),
        // but the relational graph that connects them to Measures/PFs is via
        // finding.diagnosticId -> measureDiagnostics(diagnosticId -> measureId).
        (rel.findings ?? []).forEach((f: any) => {
          const findingId = norm(f?.id ?? f?.cveId ?? f?.name);
          const diagId = norm(f?.diagnosticId);
          if (!findingId || !diagId) return;
          if (diagTouchesAspect(diagId)) out.add(findingId);
        });

        // include tool diagnostics if they are separate objects
        // Here, the diagnostic id itself is what links to measures.
        (rel.diagnostics ?? []).forEach((d: any) => {
          const diagId = norm(d?.id ?? d?.diagnosticId);
          if (!diagId) return;
          if (diagTouchesAspect(diagId)) out.add(diagId);
        });
      };

      addFromRelational(relLeft);
      addFromRelational(relRight);

      return out;
    },
    []
  );

  // compare-only UI state
  const [cweFilter, setCweFilter] = useState<DiffFilter>("all");
  const [cveFilter, setCveFilter] = useState<DiffFilter>("all");
  const [sizes, setSizes] = useState<number[]>(sizesInit);
  const [syncScroll, setSyncScroll] = useState(true);

  // one shared Jotai store so both panes mirror atom changes
  const sharedStore = useMemo(() => createStore(), []);

  // local state to force re-render when the active aspect changes in the Jotai store
  const [aspectVersion, setAspectVersion] = useState(0);

  useEffect(() => {
    const unsub = sharedStore.sub(aspectAtom, () => {
      setAspectVersion((v) => v + 1);
    });
    return unsub;
  }, [sharedStore]);

  const activeAspect = sharedStore.get(aspectAtom) as string | null;

  // legend counts - scoped to ACTIVE Quality Aspect
  const cweDiffCount = useMemo(() => {
    if (!activeAspect) return 0;

    const pfNames = getAspectPFNameSet(scores1, scores2, activeAspect);
    if (pfNames.size === 0) return 0;

    const diffsPF = unionFiltered(
      leftHints.differingPFs,
      rightHints.differingPFs,
      (name) => pfNames.has(String(name))
    );

    const diffsMeasures = unionFiltered(
      leftHints.differingMeasures,
      rightHints.differingMeasures,
      (key) => {
        const pfName = String(key).split("|", 1)[0];
        return pfNames.has(pfName);
      }
    );

    return diffsPF.size + diffsMeasures.size;
  }, [
    leftHints,
    rightHints,
    scores1,
    scores2,
    activeAspect,
    aspectVersion,
    getAspectPFNameSet,
    unionFiltered,
  ]);

  const cweUniqueCount = useMemo(() => {
    if (!activeAspect) return 0;

    const pfNames = getAspectPFNameSet(scores1, scores2, activeAspect);
    if (pfNames.size === 0) return 0;

    const uniquePFs = unionFiltered(
      leftHints.missingPFs,
      rightHints.missingPFs,
      (name) => pfNames.has(String(name))
    );

    const uniqueMeasures = unionFiltered(
      leftHints.missingMeasures,
      rightHints.missingMeasures,
      (key) => {
        const pfName = String(key).split("|", 1)[0];
        return pfNames.has(pfName);
      }
    );

    return uniquePFs.size + uniqueMeasures.size;
  }, [
    leftHints,
    rightHints,
    scores1,
    scores2,
    activeAspect,
    aspectVersion,
    getAspectPFNameSet,
    unionFiltered,
  ]);

  const cveDiffCount = useMemo(() => {
    if (!activeAspect) return 0;

    const aspectDiagIds = getAspectDiagIdSet(
      scores1,
      scores2,
      relational1,
      relational2,
      activeAspect
    );
    if (aspectDiagIds.size === 0) return 0;

    const diffs = unionFiltered(
      leftHints.differingCVEs,
      rightHints.differingCVEs,
      (id) => aspectDiagIds.has(String(id ?? "").trim())
    );

    return diffs.size;
  }, [
    leftHints,
    rightHints,
    scores1,
    scores2,
    relational1,
    relational2,
    activeAspect,
    aspectVersion,
    getAspectDiagIdSet,
    unionFiltered,
  ]);

  const cveUniqueCount = useMemo(() => {
    if (!activeAspect) return 0;

    const aspectDiagIds = getAspectDiagIdSet(
      scores1,
      scores2,
      relational1,
      relational2,
      activeAspect
    );
    if (aspectDiagIds.size === 0) return 0;

    const uniques = unionFiltered(
      leftHints.missingCVEs,
      rightHints.missingCVEs,
      (id) => aspectDiagIds.has(String(id ?? "").trim())
    );

    return uniques.size;
  }, [
    leftHints,
    rightHints,
    scores1,
    scores2,
    relational1,
    relational2,
    activeAspect,
    aspectVersion,
    getAspectDiagIdSet,
    unionFiltered,
  ]);

  // legend actions: set atoms directly in both panes; compare only updates diffFilter
  const activate = useCallback(
    (tab: "CWE" | "CVE", filter: DiffFilter) => {
      const mapped = tab === "CWE" ? "PF" : "VULN_OR_DIAG";
      sharedStore.set(securityTabAtom, mapped);

      if (tab === "CWE") {
        setCweFilter((prev) => (prev === filter ? "all" : filter));
        setCveFilter("all"); // deactivate CVE chips
      } else {
        setCveFilter((prev) => (prev === filter ? "all" : filter));
        setCweFilter("all"); // deactivate CWE chips
      }
    },
    [sharedStore]
  );

  const activeTab = sharedStore.get(securityTabAtom); // "PF" or "VULN_OR_DIAG"

  const pfLabel =
    typeof activeAspect === "string" &&
    /security/i.test(activeAspect) &&
    cweDiffCount + cweUniqueCount > 0 &&
    true
      ? "CWEs"
      : "Product Factors";

  const isPackageVulnMode =
    // if the aspect has any CVE/GHSA ids scoped to it, treat as package vulnerabilities
    cveDiffCount + cveUniqueCount > 0;

  const diagLabel = isPackageVulnMode
    ? "Package Vulnerabilities"
    : "Diagnostic Findings";

  const effectiveDiffFilter =
    activeTab === "VULN_OR_DIAG" ? cveFilter : cweFilter;

  const sashRender = (_i: number, active: boolean) => (
    <div
      className={`relative flex h-[80%] w-2 cursor-col-resize items-center justify-center rounded-full bg-[#75aedd] ${
        active ? "bg-[#005a9e]" : "hover:bg-[#005a9e]"
      }`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes"
    >
      <span className="absolute left-1/2 top-[45%] h-1 w-1 -translate-x-1/2 rounded-full bg-white" />
      <span className="absolute left-1/2 top-[47%] h-1 w-1 -translate-x-1/2 rounded-full bg-white" />
      <span className="absolute left-1/2 top-[49%] h-1 w-1 -translate-x-1/2 rounded-full bg-white" />
    </div>
  );

  const hasFiles = !!file1 && !!file2;

  if (pendingIdb && !idbLoaded && !hasFiles) {
    const loadingRootClass = props.embedded
      ? "flex h-full flex-col"
      : "flex min-h-[calc(100vh-185px)] flex-col";
    const loadingMainClass = props.embedded
      ? "flex flex-1 min-h-0 flex-col items-stretch px-0"
      : "mt-2 flex flex-1 min-h-0 flex-col items-stretch px-0";
    return (
      <div className={loadingRootClass}>
        <main className={loadingMainClass}>
          <p className="mt-8 text-center">
            <strong>Loading files...</strong>
          </p>
        </main>
      </div>
    );
  }

  if (!hasFiles) {
    return <Navigate to="/" replace />;
  }

  const rootClass = props.embedded
    ? "flex h-full flex-col"
    : "flex min-h-[calc(100vh-185px)] flex-col";
  const mainClass = props.embedded
    ? "flex flex-1 min-h-0 flex-col items-stretch px-0"
    : "mt-2 flex flex-1 min-h-0 flex-col items-stretch px-0";
  const rootStyle = props.embedded
    ? undefined
    : { height: "calc(100vh - 185px)" };
  const paneStyle = props.embedded
    ? { height: "100%" }
    : { height: "100%" };

  return (
    <div className={rootClass} style={rootStyle}>
      <main
        className={mainClass}
        style={{ height: "100%" }}
      >
        <div
          className="grid items-center overflow-hidden border-b border-[#e5e7eb] bg-white px-3 py-[15px] text-[18px] font-semibold"
          style={{
            gridTemplateColumns: `${sizes[0]}fr ${SASH_W}px ${sizes[1]}fr`,
          }}
        >
          <div className="min-w-0 truncate text-center">
            <strong>File Name:</strong>&nbsp;
            <span title={file1Name} className="truncate">
              {displayFile1Name}
            </span>
          </div>
          <div aria-hidden="true" />
          <div className="min-w-0 truncate text-center">
            <strong>File Name:</strong>&nbsp;
            <span title={file2Name} className="truncate">
              {displayFile2Name}
            </span>
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

        {/* legend/filters */}
        {activeAspect && (
          <div className="mx-3 grid gap-1.5 bg-[rgb(230,227,227)] pb-1 text-center text-[16px]">
            <div className="flex flex-nowrap items-center justify-center gap-2 overflow-x-auto max-[900px]:flex-wrap max-[900px]:overflow-visible">
              <span
                className={`inline-flex flex-none items-center whitespace-nowrap rounded-lg border border-[rgba(217,48,37,0.35)] bg-[rgba(217,48,37,0.08)] px-3 py-1.5 text-center ${
                  cweFilter === "differing"
                    ? "border-2 border-black bg-[lightgrey] text-black shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                    : "hover:border-black hover:bg-[lightgrey] hover:text-black"
                } cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#666] focus-visible:outline-offset-2`}
                onClick={() => activate("CWE", "differing")}
              >
                🚩 Differing {pfLabel}{" "}
                <span className="ml-4 rounded-full border-2 border-[lightgrey] bg-[lightgrey] px-1.5">
                  {cweDiffCount}
                </span>
              </span>
              <span
                className={`inline-flex flex-none items-center whitespace-nowrap rounded-lg border border-[rgba(227,116,0,0.4)] bg-[rgba(227,116,0,0.1)] px-3 py-1.5 text-center ${
                  cweFilter === "unique"
                    ? "border-2 border-black bg-[lightgrey] text-black shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                    : "hover:border-black hover:bg-[lightgrey] hover:text-black"
                } cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#666] focus-visible:outline-offset-2`}
                onClick={() => activate("CWE", "unique")}
              >
                ‼️ Unique {pfLabel}{" "}
                <span className="ml-4 rounded-full border-2 border-[lightgrey] bg-[lightgrey] px-1.5">
                  {cweUniqueCount}
                </span>
              </span>
              <span
                className={`inline-flex flex-none items-center whitespace-nowrap rounded-lg border border-[rgba(217,48,37,0.35)] bg-[rgba(217,48,37,0.08)] px-3 py-1.5 text-center ${
                  cveFilter === "differing"
                    ? "border-2 border-black bg-[lightgrey] text-black shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                    : "hover:border-black hover:bg-[lightgrey] hover:text-black"
                } cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#666] focus-visible:outline-offset-2`}
                onClick={() => activate("CVE", "differing")}
              >
                🚩 Differing {diagLabel}{" "}
                <span className="ml-4 rounded-full border-2 border-[lightgrey] bg-[lightgrey] px-1.5">
                  {cveDiffCount}
                </span>
              </span>
              <span
                className={`inline-flex flex-none items-center whitespace-nowrap rounded-lg border border-[rgba(227,116,0,0.4)] bg-[rgba(227,116,0,0.1)] px-3 py-1.5 text-center ${
                  cveFilter === "unique"
                    ? "border-2 border-black bg-[lightgrey] text-black shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                    : "hover:border-black hover:bg-[lightgrey] hover:text-black"
                } cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#666] focus-visible:outline-offset-2`}
                onClick={() => activate("CVE", "unique")}
              >
                ‼️ Unique {diagLabel}{" "}
                <span className="ml-4 rounded-full border-2 border-[lightgrey] bg-[lightgrey] px-1.5">
                  {cveUniqueCount}
                </span>
              </span>
              <span
                className="ml-2 cursor-pointer rounded-lg border border-[rgb(155,154,154)] px-2.5 py-1.5 text-center hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#666] focus-visible:outline-offset-2"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setCweFilter("all");
                  setCveFilter("all");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setCweFilter("all");
                    setCveFilter("all");
                  }
                }}
                title="Show all"
              >
                Reset
              </span>
            </div>
            <div className="text-sm">
              🚩: present in both files but fields differ. ‼️: present in only
              one file.
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0" style={paneStyle}>
          <ScrollSync>
            <div className="h-full" style={{ height: "100%" }}>
              <SplitPane
                split="vertical"
                sizes={sizes}
                onChange={setSizes}
                sashRender={sashRender}
                className="h-full"
              >
            {/* LEFT */}
            <Pane minSize={260}>
              <Provider store={sharedStore}>
                {syncScroll ? (
                  <ScrollSyncPane>
                    <div className="h-full overflow-auto">
                      <SingleFileComponent
                        jsonData={file1}
                        diffHints={leftHints}
                        diffFilter={effectiveDiffFilter}
                        compareMode
                        embedded={props.embedded}
                      />
                    </div>
                  </ScrollSyncPane>
                ) : (
                  <div className="h-full overflow-auto">
                    <SingleFileComponent
                      jsonData={file1}
                      diffHints={leftHints}
                      diffFilter={effectiveDiffFilter}
                      compareMode
                      embedded={props.embedded}
                    />
                  </div>
                )}
              </Provider>
            </Pane>

            {/* RIGHT */}
            <Pane minSize={260}>
              <Provider store={sharedStore}>
                {syncScroll ? (
                  <ScrollSyncPane>
                    <div className="h-full overflow-auto">
                      <SingleFileComponent
                        jsonData={file2}
                        diffHints={rightHints}
                        diffFilter={effectiveDiffFilter}
                        compareMode
                        embedded={props.embedded}
                      />
                    </div>
                  </ScrollSyncPane>
                ) : (
                  <div className="h-full overflow-auto">
                    <SingleFileComponent
                      jsonData={file2}
                      diffHints={rightHints}
                      diffFilter={effectiveDiffFilter}
                      compareMode
                      embedded={props.embedded}
                    />
                  </div>
                )}
              </Provider>
            </Pane>
              </SplitPane>
            </div>
          </ScrollSync>
        </div>
      </main>
    </div>
  );
};

export default React.memo(Compare);
