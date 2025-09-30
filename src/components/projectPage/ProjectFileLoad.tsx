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
  /* raw parsed JSON, used by Single/Compare viewers (inflated on demand) */
  raw?: any;
};

export type ViewMode = "single" | "compare";

const MAX_FILES = 12;
const GENERIC_SCHEMA_MSG =
  "This file doesn’t match the supported schema. Please refer to the documentation.";

/* small helpers */
const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);

/* quick input-schema sanity check (same shape you already accept) */
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
function saveCompressedRaw(id: string, json: any) {
  try {
    const txt = JSON.stringify(json);
    const comp = LZString.compressToUTF16(txt);
    localStorage.setItem(`raw:${id}`, comp);
  } catch {
    /* ignore */
  }
}
function loadCompressedRaw(id: string): any | undefined {
  try {
    const comp = localStorage.getItem(`raw:${id}`);
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
  /* notify parent with viewer payload + current selection */
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

  /* load any persisted files for this project, inflate raw if available */
  useEffect(() => {
    if (!projectId) return;
    const saved = localStorage.getItem(`wp_project_files:${projectId}`);
    if (saved) {
      const rawList = JSON.parse(saved) as ProjectFileScore[];

      const arr: ProjectFileScore[] = rawList.map((s) => {
        const maybeRaw = loadCompressedRaw(s.id);
        return maybeRaw ? { ...s, raw: maybeRaw } : s;
      });

      arr.sort(
        (a, b) =>
          new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
      );

      setScores(arr);
    } else {
      setScores([]);
    }
    setSelected(new Set());
    setHydrated(true);
  }, [projectId]);

  /* persist changes + notify parent with current file list; ensure compressed raw exists for items that carry raw in memory */
  useEffect(() => {
    if (!projectId || !hydrated) return;

    localStorage.setItem(
      `wp_project_files:${projectId}`,
      JSON.stringify(scores)
    );

    // make sure compressed copies exist when raw is present in memory
    for (const s of scores) {
      if (s.raw != null && !localStorage.getItem(`raw:${s.id}`)) {
        saveCompressedRaw(s.id, s.raw);
      }
    }

    onScores(projectId, scores);
  }, [projectId, scores, onScores, hydrated]);

  /* whenever selection changes, bubble up + resolve viewer payload (inflate raw on demand if missing) */
  useEffect(() => {
    const ids = Array.from(selected);
    onSelectionChange?.(ids);

    const ensureRaw = (id?: string): UploadPayload | undefined => {
      if (!id) return undefined;
      const idx = scores.findIndex((s) => s.id === id);
      if (idx < 0) return undefined;
      const row = scores[idx];

      // if missing raw in memory, inflate from compressed store now
      let raw = row.raw;
      if (raw == null) {
        raw = loadCompressedRaw(row.id);
        if (raw != null) {
          setScores((prev) => {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], raw };
            return copy;
          });
        }
      }
      if (raw == null) return undefined;
      return { filename: row.fileName, data: raw };
    };

    if (mode === "single") {
      const only = ids[0];
      onViewerPayload?.({ mode: "single", file: ensureRaw(only) }, ids);
    } else {
      const a = ids[0];
      const b = ids[1];
      onViewerPayload?.(
        { mode: "compare", file1: ensureRaw(a), file2: ensureRaw(b) },
        ids
      );
    }
  }, [selected, scores, mode, onSelectionChange, onViewerPayload]);

  /* handlers */
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

        // fast extract for plot
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

        const id = crypto.randomUUID();

        // write compressed raw immediately so future sessions can inflate it
        saveCompressedRaw(id, json);

        parsed.push({
          id,
          fileName: file.name,
          fileDateISO: new Date(file.lastModified).toISOString(),
          tqi,
          aspects,
          raw: json, // keep in-memory so viewers work right away
        });
      }

      parsed.sort(
        (a, b) =>
          new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
      );

      setScores(parsed.slice(0, MAX_FILES));
      setSelected(new Set()); // clear selection after (re)load
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /* toggle with selection cap (1 in single mode, 2 in compare mode) */
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (mode === "single") {
          next.clear();
          next.add(id);
        } else {
          if (next.size >= 2) {
            const first = Array.from(next)[0];
            next.delete(first);
          }
          next.add(id);
        }
      }
      return next;
    });
  }

  /* derived rendering bits */
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
