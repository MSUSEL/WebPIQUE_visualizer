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
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const mode: ViewMode = controlledMode ?? localMode[0];
  const setLocalMode = localMode[1];
  const canAddMore = scores.length < MAX_FILES;

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
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    // how many more files can this project hold?
    const roomLeft = MAX_FILES - scores.length;
    if (roomLeft <= 0) {
      alert(`This project already has the maximum of ${MAX_FILES} files.`);
      return;
    }
    if (incoming.length > roomLeft) {
      alert(
        `You can add at most ${roomLeft} more file(s) to this project. Only the first ${roomLeft} will be added.`
      );
    }
    const files = incoming.slice(0, roomLeft);

    try {
      // start from existing scores instead of replacing them
      const next: ProjectFileScore[] = [...scores];

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

        const entry: ProjectFileScore = {
          id,
          rawKey,
          fileName: file.name,
          fileDateISO: new Date(file.lastModified).toISOString(),
          tqi,
          aspects,
          needsRaw: false,
        };

        // if a file with the same name already exists in this project, replace it;
        // otherwise append as a new file
        const existingIdx = next.findIndex((s) => s.fileName === file.name);
        if (existingIdx >= 0) next[existingIdx] = entry;
        else next.push(entry);
      }

      next.sort(
        (a, b) =>
          new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
      );

      setScores(next);
      setSelected(new Set()); // clear selection after load
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleReplaceFile(fileList: FileList | null) {
    if (!projectId || !fileList || !replaceTargetId) return;
    const file = Array.from(fileList)[0];
    if (!file) return;

    try {
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

      setScores((prev) => {
        const idx = prev.findIndex((s) => s.id === replaceTargetId);
        if (idx < 0) return prev;

        const old = prev[idx];
        const rawKey = old.rawKey ?? `raw:${old.id}`;

        // overwrite compressed raw for this row
        saveCompressedRawViaKey(rawKey, json);

        const updated: ProjectFileScore = {
          ...old,
          fileName: file.name,
          fileDateISO: new Date(file.lastModified).toISOString(),
          tqi,
          aspects,
          rawKey,
          needsRaw: false,
        };

        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    } finally {
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
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

  function removeFile(id: string) {
    setScores((prev) => prev.filter((s) => s.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
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
      {/* Hidden inputs for add + replace */}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => handleReplaceFile(e.target.files)}
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

          <div className="muted" style={{ marginTop: 8 }}>
            {mode === "single"
              ? "Select one file to view file information."
              : "Select two files to compare their file information."}
          </div>
        </div>

        <hr />

        {/* Add File button row */}
        <div className="file-box__add-row">
          <button
            type="button"
            className={`add-file-btn ${canAddMore ? "can-add" : "cannot-add"}`}
            disabled={!canAddMore}
            onClick={() => {
              if (!canAddMore) return;
              inputRef.current?.click();
            }}
          >
            + Add File
          </button>
          {!canAddMore && (
            <span className="muted" style={{ marginLeft: 8 }}>
              Maximum of {MAX_FILES} files per project.
            </span>
          )}
        </div>

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

                  {/* CHANGE (pencil) */}
                  <button
                    type="button"
                    className="icon-button"
                    title="Change this file"
                    aria-label={`Change ${s.fileName}`}
                    onClick={() => {
                      setReplaceTargetId(s.id);
                      replaceInputRef.current?.click();
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    ✎
                  </button>

                  {/* REMOVE (X) */}
                  <button
                    type="button"
                    onClick={() => removeFile(s.id)}
                    aria-label={`Remove ${s.fileName} from project`}
                    title="Remove file from project"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
