// side-by-side compare with synced panes - mostly unique to webpique
import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useLocation, Navigate } from "react-router-dom";
import SplitPane, { Pane } from "split-pane-react";
import { ScrollSync, ScrollSyncPane } from "react-scroll-sync";
import { Switch, FormControlLabel } from "@mui/material";
import "split-pane-react/esm/themes/default.css";
import "../../styles/CompareStyle.css";

import SingleFileComponent from "./SingleFileComponent";
import { parsePIQUEJSON } from "../../Utilities/DataParser";
import { buildDiffHints, DiffHints } from "../../Utilities/fileDiff";

// Jotai to prevent rerender on click
import { Provider, createStore } from "jotai";
import { aspectAtom, securityTabAtom } from "../../state/visualAtoms";

type UploadPayload = { filename: string; data: any };
type OneChild = React.ReactElement;

const SASH_W = 8;
type DiffFilter = "all" | "differing" | "unique";

type CompareProps = {
  file1?: UploadPayload;
  file2?: UploadPayload;
  embedded?: boolean;
  initialSizes?: number[];
};

const Compare: React.FC<CompareProps> = (props) => {
  const { state } = useLocation() as {
    state?: { file1?: UploadPayload; file2?: UploadPayload };
  };

  // prefer props, fallback to router state
  const file1 = props.file1 ?? state?.file1;
  const file2 = props.file2 ?? state?.file2;
  if (!file1 || !file2) return <Navigate to="/" replace />;

  const sizesInit = props.initialSizes ?? [50, 50];

  const file1Name = file1.filename ?? "File 1";
  const file2Name = file2.filename ?? "File 2";

  // parse once per file
  const scores1 = useMemo(
    () => parsePIQUEJSON((file1 as any).data ?? file1).scores,
    [file1]
  );
  const scores2 = useMemo(
    () => parsePIQUEJSON((file2 as any).data ?? file2).scores,
    [file2]
  );

  // build diff hints (directional)
  const leftHints: DiffHints = useMemo(
    () => buildDiffHints(scores1, scores2),
    [scores1, scores2]
  );
  const rightHints: DiffHints = useMemo(
    () => buildDiffHints(scores2, scores1),
    [scores1, scores2]
  );

  // ---------- helpers for per-aspect counts ----------

  // union with predicate (used to filter to active aspect)
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
      const byAspect = (scores?.productFactorsByAspect ??
        {}) as Record<string, any[]>;
      let list = (byAspect?.[aspectName] ?? []) as any[];

      // fallback for "Security" to legacy cweProductFactors, like ProductFactorTabs
      if (list.length === 0 && /security/i.test(aspectName || "")) {
        list = (scores?.cweProductFactors ?? []) as any[];
      }

      return list
        .map((pf) => pf?.name)
        .filter(
          (name: any): name is string =>
            typeof name === "string" && !!name
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

  const getAspectDiagIdSet = useCallback(
    (scoresLeft: any, scoresRight: any, aspectName: string | null) => {
      const out = new Set<string>();
      if (!aspectName) return out;

      const addFromScores = (scores: any) => {
        if (!scores) return;
        const byAspect = (scores?.productFactorsByAspect ??
          {}) as Record<string, any[]>;
        let list = (byAspect?.[aspectName] ?? []) as any[];

        // again, fallback to legacy Security-only CWEs if needed
        if (list.length === 0 && /security/i.test(aspectName || "")) {
          list = (scores?.cweProductFactors ?? []) as any[];
        }

        for (const pf of list ?? []) {
          // diagnostics may be under cves or a more generic diagnostics field
          const diags = (pf?.cves ?? pf?.diagnostics ?? []) as any[];
          for (const c of diags) {
            const id =
              c?.cveId ??
              c?.id ??
              c?.name ??
              c?.CVE ??
              c?.CVE_ID ??
              null;
            if (id) out.add(String(id));
          }
        }
      };

      addFromScores(scoresLeft);
      addFromScores(scoresRight);
      return out;
    },
    []
  );

  // compare-only UI state
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");
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

  // legend counts - now scoped to ACTIVE Quality Aspect
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
      activeAspect
    );
    if (aspectDiagIds.size === 0) return 0;

    const diffs = unionFiltered(
      leftHints.differingCVEs,
      rightHints.differingCVEs,
      (id) => aspectDiagIds.has(String(id))
    );

    return diffs.size;
  }, [
    leftHints,
    rightHints,
    scores1,
    scores2,
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
      activeAspect
    );
    if (aspectDiagIds.size === 0) return 0;

    const uniques = unionFiltered(
      leftHints.missingCVEs,
      rightHints.missingCVEs,
      (id) => aspectDiagIds.has(String(id))
    );

    return uniques.size;
  }, [
    leftHints,
    rightHints,
    scores1,
    scores2,
    activeAspect,
    aspectVersion,
    getAspectDiagIdSet,
    unionFiltered,
  ]);

  // legend actions: set atoms directly in both panes; compare only updates diffFilter
  const activate = useCallback(
    (tab: "CWE" | "CVE", filter: DiffFilter) => {
      const mapped = tab === "CWE" ? "PF" : "VULN_OR_DIAG";

      // Don't force the aspect to "Security" anymore.
      // Just ensure the underlying tab in the Security view is synced.
      sharedStore.set(securityTabAtom, mapped);

      setDiffFilter((prev) => (prev === filter ? "all" : filter));
    },
    [sharedStore]
  );

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

  const MaybeSyncPane = ({
    enabled,
    children,
  }: {
    enabled: boolean;
    children: OneChild;
  }) => (enabled ? <ScrollSyncPane>{children}</ScrollSyncPane> : children);

  return (
    <div className="compare-app-container">
      <main
        className="compare-main-content"
        style={{ height: props.embedded ? "100%" : "calc(100vh - 140px)" }}
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

        {/* legend/filters */}
        <div className="page-legend">
          <div className="legend-row">
            <span
              className="legend-chip legend-chip--diff"
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
              className="legend-chip legend-chip--unique"
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
              className="legend-chip legend-chip--diff"
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
              className="legend-chip legend-chip--unique"
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
              onClick={() => setDiffFilter("all")}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && setDiffFilter("all")
              }
              title="Show all"
            >
              All items
            </span>
          </div>
          <div className="legend-caption">
            🚩 present in both files but fields differ. ‼️ present in only one
            file.
          </div>
        </div>

        <ScrollSync>
          <SplitPane
            split="vertical"
            sizes={sizes}
            onChange={setSizes}
            sashRender={sashRender}
          >
            {/* LEFT */}
            <Pane minSize={260}>
              <Provider store={sharedStore}>
                {syncScroll ? (
                  <ScrollSyncPane>
                    <div style={{ height: "100%", overflow: "auto" }}>
                      <SingleFileComponent
                        jsonData={file1}
                        diffHints={leftHints}
                        diffFilter={diffFilter}
                      />
                    </div>
                  </ScrollSyncPane>
                ) : (
                  <div style={{ height: "100%", overflow: "auto" }}>
                    <SingleFileComponent
                      jsonData={file1}
                      diffHints={leftHints}
                      diffFilter={diffFilter}
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
                    <div style={{ height: "100%", overflow: "auto" }}>
                      <SingleFileComponent
                        jsonData={file2}
                        diffHints={rightHints}
                        diffFilter={diffFilter}
                      />
                    </div>
                  </ScrollSyncPane>
                ) : (
                  <div style={{ height: "100%", overflow: "auto" }}>
                    <SingleFileComponent
                      jsonData={file2}
                      diffHints={rightHints}
                      diffFilter={diffFilter}
                    />
                  </div>
                )}
              </Provider>
            </Pane>
          </SplitPane>
        </ScrollSync>
      </main>
    </div>
  );
};

export default React.memo(Compare);

