// project file loader; compresses raw json files and uncompresses on render when needed
// project file loader; compresses raw json files and uncompresses on render when needed
import { useEffect, useMemo, useRef, useState } from "react";
import LZString from "lz-string";
import { parseTQIQAScores } from "../../Utilities/TQIQAScoreParser";
import "../../styles/ProjectLoader.css";

export type AspectItem = { name: string; value: number };

export type ProjectFileScore = {
  id: string;
  fileName: string;
  fileDateISO: string; // lastModified ISO
  tqi: number | null;
  aspects: AspectItem[];
  rawKey?: string;
  raw?: any;
  needsRaw?: boolean;
};

export type ViewMode = "single" | "compare";

const MAX_FILES = 12;
const GENERIC_SCHEMA_MSG =
  "This file doesn’t match the supported schema. Please refer to the documentation.";

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);

function validateSchema(root: any): boolean {
  if (!isObj(root)) return false;
  const hasFactors = isObj(root.factors);
  const hasMeasures = isObj(root.measures);
  if (!hasFactors && !hasMeasures) return false;
  if (hasFactors) {
    const fa = root.factors;
    if (
      !(isObj(fa.product_factors) || isObj(fa.quality_aspects) || isObj(fa.tqi))
    )
      return false;
  }
  return true;
}

/* compressed raw helpers (UTF16-friendly for localStorage) */
function saveCompressedRawViaKey(rawKey: string, json: any) {
  try {
    const txt = JSON.stringify(json);
    const comp = LZString.compressToUTF16(txt);
    localStorage.setItem(rawKey, comp);
  } catch {
    /* ignore */
  }
}
function loadCompressedRawViaKey(rawKey?: string): any | undefined {
  if (!rawKey) return undefined;
  try {
    const comp = localStorage.getItem(rawKey);
    if (!comp) return undefined;
    const txt = LZString.decompressFromUTF16(comp);
    if (!txt) return undefined;
    return JSON.parse(txt);
  } catch {
    return undefined;
  }
}

/* upload payload shape used by the viewers */
export type UploadPayload = { filename: string; data: any };

export default function ProjectFileLoad({
  projectId,
  onScores,
  onSelectionChange,
  viewMode: controlledMode,
  onViewModeChange,
  onViewerPayload,
}: {
  projectId: string | null;
  onScores: (projectId: string, scores: ProjectFileScore[]) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (m: ViewMode) => void;
  onViewerPayload?: (
    v:
      | { mode: "single"; file?: UploadPayload }
      | { mode: "compare"; file1?: UploadPayload; file2?: UploadPayload },
    selectedIds: string[]
  ) => void;
}) {
  const [scores, setScores] = useState<ProjectFileScore[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const localMode = useState<ViewMode>("single");
  const mode: ViewMode = controlledMode ?? localMode[0];
  const setLocalMode = localMode[1];

  /* HYDRATE + MIGRATE */
  useEffect(() => {
    if (!projectId) return;
    const saved = localStorage.getItem(`wp_project_files:${projectId}`);
    if (saved) {
      type Legacy = ProjectFileScore & {
        raw?: unknown;
        rawKey?: string;
        needsRaw?: boolean;
      };
      const list = JSON.parse(saved) as Legacy[];

      const migrated: ProjectFileScore[] = list.map((s) => {
        let rawKey = s.rawKey; // keep if present
        if (s.raw !== undefined) {
          const candidateKey = `raw:${s.id}`;
          try {
            saveCompressedRawViaKey(candidateKey, s.raw);
          } catch {}
          rawKey = candidateKey;
          const { raw, ...rest } = s as any;
          s = rest;
        }
        if (!rawKey) {
          const candidateKey = `raw:${s.id}`;
          if (localStorage.getItem(candidateKey)) {
            rawKey = candidateKey;
          }
        }
        const needsRaw = !rawKey || !localStorage.getItem(rawKey);

        return {
          ...s,
          rawKey,
          needsRaw,
        };
      });

      // sort and persist back (without legacy inline raw)
      migrated.sort(
        (a, b) =>
          new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
      );

      setScores(migrated);
      localStorage.setItem(
        `wp_project_files:${projectId}`,
        JSON.stringify(migrated)
      );
    } else {
      setScores([]);
    }

    setSelected(new Set());
    setHydrated(true);
  }, [projectId]);

  /* BUBBLE UP SCORES TO PARENT */
  useEffect(() => {
    if (projectId && hydrated) onScores(projectId, scores);
  }, [projectId, hydrated, scores, onScores]);

  /* SELECTION -> VIEWER PAYLOAD (inflate via rawKey) */
  useEffect(() => {
    const ids = Array.from(selected);
    onSelectionChange?.(ids);

    const build = (id?: string) => {
      const row = scores.find((s) => s.id === id);
      if (!row) return undefined;

      const fileMillis = Date.parse(row.fileDateISO);
      const candidates = [
        row.rawKey,
        `raw:${row.id}`,
        Number.isFinite(fileMillis)
          ? `raw:${row.fileName}-${fileMillis}`
          : undefined,
      ].filter(Boolean) as string[];

      let data: any | undefined;
      let usedKey: string | undefined;

      for (const key of candidates) {
        const comp = localStorage.getItem(key);
        if (!comp) continue;
        const txt = LZString.decompressFromUTF16(comp);
        if (!txt) continue;
        try {
          data = JSON.parse(txt);
          usedKey = key;
          break;
        } catch {}
      }

      if (!data) return undefined;
      return { filename: row.fileName, data };
    };

    if (mode === "single") {
      onViewerPayload?.({ mode: "single", file: build(ids[0]) }, ids);
    } else {
      onViewerPayload?.(
        { mode: "compare", file1: build(ids[0]), file2: build(ids[1]) },
        ids
      );
    }
  }, [selected, scores, mode, onSelectionChange, onViewerPayload]);

  /* IMPORT: write compressed immediately and persist rawKey */
  async function handleFiles(fileList: FileList | null) {
    if (!projectId || !fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      alert(`Please select at most ${MAX_FILES} files.`);
      return;
    }

    try {
      const parsed: ProjectFileScore[] = [];

      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".json")) {
          alert("Only JSON files are allowed.");
          return;
        }
        const text = await file.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          alert("Invalid JSON file.");
          return;
        }
        if (!validateSchema(json)) {
          alert(GENERIC_SCHEMA_MSG);
          return;
        }

        const out: any = parseTQIQAScores(json);
        const tqi =
          toNum(out?.tqi) ??
          toNum(out?.tqiScore) ??
          toNum(out?.scores?.tqi) ??
          toNum(out?.scores?.tqiScore) ??
          null;

        const aspects: AspectItem[] = Array.isArray(out?.aspects)
          ? out.aspects.map((a: any) => {
              if (Array.isArray(a))
                return { name: String(a[0] ?? ""), value: Number(a[1] ?? NaN) };
              if (a && typeof a === "object")
                return {
                  name: String(a.name ?? a.aspect ?? a.id ?? ""),
                  value: Number(a.value ?? a.score ?? a.val ?? NaN),
                };
              if (typeof a === "string") return { name: a, value: NaN };
              return { name: "", value: Number(a) };
            })
          : [];

        const id = `${file.name}-${file.lastModified}`;
        const rawKey = `raw:${id}`;

        // write compressed raw immediately
        saveCompressedRawViaKey(rawKey, json);

        parsed.push({
          id,
          rawKey,
          fileName: file.name,
          fileDateISO: new Date(file.lastModified).toISOString(),
          tqi,
          aspects,
          needsRaw: false,
        } as ProjectFileScore);
      }

      parsed.sort(
        (a, b) =>
          new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
      );

      setScores(parsed.slice(0, MAX_FILES));
      setSelected(new Set()); // clear selection after load
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /* toggle with selection cap */
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (mode === "single") {
          next.clear();
          next.add(id);
        } else {
          if (next.size >= 2) next.delete(Array.from(next)[0]);
          next.add(id);
        }
      }
      return next;
    });
  }

  const twoCol = scores.length > 6;
  const sorted = useMemo(() => {
    const copy = [...scores];
    copy.sort(
      (a, b) =>
        new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
    );
    return copy;
  }, [scores]);

  return (
    <section className="fileload-section">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="file-box">
        <div className="file-box__hdr">
          <h3 className="file-box__title">
            Available Files to Visualize or Compare
          </h3>

          <div className="file-box__actions">
            <button
              type="button"
              className={`btn btn-light ${
                mode === "single" ? "is-active" : ""
              }`}
              onClick={() =>
                onViewModeChange
                  ? onViewModeChange("single")
                  : setLocalMode("single")
              }
            >
              Single File
            </button>
            <button
              type="button"
              className={`btn btn-light ${
                mode === "compare" ? "is-active" : ""
              }`}
              onClick={() =>
                onViewModeChange
                  ? onViewModeChange("compare")
                  : setLocalMode("compare")
              }
            >
              Compare Two Files
            </button>
          </div>

          {/* NEW: a short hint for the active mode */}
          <div className="muted" style={{ marginTop: 8 }}>
            {mode === "single"
              ? "Select one file to view file information."
              : "Two file comparison is currently inactive while we finish a fix. Please select 'Compare' from the menu to compare two files."}{" "}
            {/*"Select two files to view a comparison between file information. */}
          </div>
        </div>

        <hr />

        {sorted.length === 0 ? (
          <div className="muted">No files loaded.</div>
        ) : (
          <ul className={`file-list ${twoCol ? "two-col" : ""}`}>
            {sorted.map((s) => {
              const isSel = selected.has(s.id);
              const base = s.fileName.replace(/\.json$/i, "");
              const label =
                twoCol && base.length > 30 ? base.slice(0, 30) + "…" : base;

              return (
                <li
                  key={s.id}
                  className={`file-row ${isSel ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(s.id)}
                    aria-label={`Select ${s.fileName}`}
                  />
                  <span
                    className="file-name"
                    title={`${s.fileName}\n${new Date(
                      s.fileDateISO
                    ).toLocaleString()}`}
                  >
                    {label}
                  </span>
                  {s.needsRaw && (
                    <span
                      title="Compressed data missing — re-import this file once."
                      style={{ marginLeft: 6, color: "#b45309" }}
                    >
                      (re-import)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
