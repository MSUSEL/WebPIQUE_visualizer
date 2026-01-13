// create project and load file dialog box
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LZString from "lz-string"; // NEW: for compressed storage
import type { ProjectFileScore, AspectItem } from "./ProjectFileLoad";

const MAX_FILES = 12;

// --- small helpers ----------------------------------------------------------
const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);

// accept a few shapes; adjust if your schema is stricter
const validateLikelySchema = (root: any) => {
  if (!isObj(root)) return false;
  // accept if it has "factors" or "measures" or something that looks like a score object
  if (isObj(root.factors) || isObj(root.measures)) return true;
  if (isObj(root.scores)) return true;
  return false;
};

const normalizeAspects = (raw: any): AspectItem[] => {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((a: any) => {
    if (Array.isArray(a))
      return { name: String(a[0] ?? ""), value: Number(a[1] ?? NaN) };
    if (a && typeof a === "object") {
      const name = a.name ?? a.aspect ?? a.id ?? "";
      const value = a.value ?? a.score ?? a.val ?? NaN;
      return { name: String(name), value: Number(value) };
    }
    if (typeof a === "string") return { name: a, value: NaN };
    return { name: "", value: Number(a) };
  });
};

// ---------------------------------------------------------------------------

export default function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  defaultName,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, files: ProjectFileScore[]) => void;
  defaultName?: string;
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<ProjectFileScore[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // always reseed name on open; clear when closed so the default increments every time
  useEffect(() => {
    if (open) setName(defaultName ?? "Project 1");
    else {
      setName("");
      setFiles([]); // clear any staged files when closing
    }
  }, [open, defaultName]);

  const fileCountLabel = useMemo(
    () => `${files.length} / ${MAX_FILES} file${files.length === 1 ? "" : "s"}`,
    [files.length]
  );

  // core loader: validates, parses, caps at 12, and de-dupes by fileName
  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;

    // Start loading immediately so the bar can mount even if the import is slow
    setLoading(true);
    setProgress(0);
    // Give React a frame to paint the bar before doing any heavy work
    await new Promise(requestAnimationFrame);

    let parseTQIQAScores: any;
    try {
      ({ parseTQIQAScores } = await import("../../Utilities/TQIQAScoreParser"));
    } catch (e) {
      console.error("Failed to load TQI/QA parser", e);
      alert("Unable to load the score parser module. Please try again.");
      setLoading(false);
      return;
    }

    const incoming = Array.from(fileList);
    const startCount = files.length;
    const roomLeft = Math.max(0, MAX_FILES - startCount);
    if (incoming.length > roomLeft) {
      alert(
        `You can add up to ${MAX_FILES} files per project. Only the first ${roomLeft} will be added.`
      );
    }
    const trimmed = incoming.slice(0, roomLeft);

    const next: ProjectFileScore[] = [...files];

    try {
      const total = trimmed.length || 1;
      let processed = 0;

      for (const f of trimmed) {
        if (!f.name.toLowerCase().endsWith(".json")) {
          alert(`Only JSON files are allowed. Skipped: ${f.name}`);
          continue;
        }

        let json: any;
        try {
          json = JSON.parse(await f.text());
        } catch {
          alert(`Invalid JSON: ${f.name}`);
          continue;
        }

        if (!validateLikelySchema(json)) {
          alert(
            `"${f.name}" doesn’t match the supported schema. Please refer to the documentation.`
          );
          continue;
        }

        // --- Light parser for top plot ---
        const fileMillis = f.lastModified;
        const id = `${f.name}-${fileMillis}`;
        const rawKey = `raw:${id}`;

        // light parser only
        let parsed: any;
        try {
          parsed = parseTQIQAScores(json);
        } catch (err) {
          console.error("parseTQIQAScores error", err);
          alert(`Could not parse scores from ${f.name}`);
          continue;
        }
        const tqi: number | null =
          parsed?.tqi ??
          parsed?.tqiScore ??
          parsed?.scores?.tqi ??
          parsed?.scores?.tqiScore ??
          null;

        const aspects = normalizeAspects(
          parsed?.aspects ?? parsed?.scores?.aspects ?? []
        );

        // write compressed raw once
        try {
          const txt = JSON.stringify(json);
          const comp = LZString.compressToUTF16(txt);
          localStorage.setItem(rawKey, comp);
        } catch (e) {
          console.warn("Failed to persist compressed raw for", f.name, e);
        }

        // create/update entry
        const entry: ProjectFileScore = {
          id,
          rawKey,
          fileName: f.name,
          fileDateISO: new Date(fileMillis).toISOString(),
          tqi,
          aspects,
          needsRaw: false,
        };
        const idx = next.findIndex((x) => x.fileName === f.name);
        if (idx >= 0) next[idx] = entry;
        else next.push(entry);

        // ---- progress & yield so the bar paints ----
        processed += 1;
        setProgress(processed / total);
        await new Promise(requestAnimationFrame);
      }

      setFiles(next);
    } finally {
      setLoading(false);
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((x) => x.id !== id));
  }

  function handleContinue() {
    const n = name.trim();
    if (!n || files.length === 0) return;
    onCreate(n, files);
    onClose();
  }

  if (!open) return null;

  // --- styles kept inline to avoid external CSS collisions ---
  const content = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.35)]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] rounded-[10px] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0">Create Project</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer text-[18px] leading-none"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Name input */}
        <label className="mb-3 block">
          <div className="mb-1.5 text-[12px] opacity-80">
            Project name
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Project 1"
            className="w-full rounded-lg border border-[#ddd] px-2.5 py-2 outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleContinue();
              }
            }}
          />
        </label>

        {/* File controls */}
        <div>
          <div className="flex items-center gap-3">
            <button
              className="cursor-pointer rounded-lg border border-[#ddd] bg-[#f7f7f7] px-3 py-2"
              onClick={() => inputRef.current?.click()}
            >
              Browse files
            </button>
            <div className="text-[12px] opacity-75">{fileCountLabel}</div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div
            className="mt-2 h-[90px] select-none rounded-[10px] border-2 border-dashed border-[#c7c7c7] p-[26px] text-center"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
          >
            Drag & drop up to {MAX_FILES} JSON files here
          </div>

          {/* Loading bar */}
          {loading && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] opacity-80">
                <span>Files loading</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#eee]">
                <div
                  style={{
                    width: `${Math.max(2, progress * 100)}%`, // keep a small sliver visible at 0%
                    height: "100%",
                    background: "#0d6efd",
                    transition: "width .2s linear",
                  }}
                />
              </div>
            </div>
          )}

          {/* Selected files list */}
          {files.length > 0 && (
            <ul className="mt-3 list-disc pl-[18px]">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <span className="flex-1">{f.fileName}</span>
                  <button
                    onClick={() => removeFile(f.id)}
                    aria-label={`Remove ${f.fileName}`}
                    title="Remove"
                    className="cursor-pointer text-[16px] leading-none"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-[#ddd] bg-[#f7f7f7] px-3.5 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={!name.trim() || files.length === 0}
            className={`rounded-lg border px-3.5 py-2 text-white ${
              !name.trim() || files.length === 0
                ? "cursor-not-allowed border-[#0d6efd] bg-[#9bbcf9]"
                : "cursor-pointer border-[#0d6efd] bg-[#0d6efd]"
            }`}
            title={
              !name.trim()
                ? "Enter a project name"
                : files.length === 0
                  ? "Add at least one file"
                  : "Create project"
            }
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );

  // safe portal target
  const portalTarget =
    typeof document !== "undefined" && document.body ? document.body : null;

  return portalTarget ? createPortal(content, portalTarget) : content;
}
