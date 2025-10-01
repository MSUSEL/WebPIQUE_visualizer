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
  const maskStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const panelStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 10,
    padding: 20,
    width: 560,
    maxWidth: "92vw",
    boxShadow: "0 12px 32px rgba(0,0,0,.2)",
  };
  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  };
  const dropZoneStyle: React.CSSProperties = {
    marginTop: 8,
    border: "2px dashed #c7c7c7",
    height: 90,
    borderRadius: 10,
    padding: 26,
    textAlign: "center" as const,
    userSelect: "none" as const,
  };

  const content = (
    <div className="wpq-modal-mask" style={maskStyle} onClick={onClose}>
      <div
        className="wpq-modal-panel"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={{ margin: 0 }}>Create Project</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Name input */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>
            Project name
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Project 1"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              outline: "none",
            }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn"
              onClick={() => inputRef.current?.click()}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#f7f7f7",
                cursor: "pointer",
              }}
            >
              Browse files
            </button>
            <div style={{ opacity: 0.75, fontSize: 12 }}>{fileCountLabel}</div>
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
            style={dropZoneStyle}
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
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                <span>Files loading</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "#eee",
                  overflow: "hidden",
                }}
              >
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
            <ul style={{ marginTop: 12, paddingLeft: 18 }}>
              {files.map((f) => (
                <li
                  key={f.id}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span style={{ flex: 1 }}>{f.fileName}</span>
                  <button
                    onClick={() => removeFile(f.id)}
                    aria-label={`Remove ${f.fileName}`}
                    title="Remove"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#f7f7f7",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={!name.trim() || files.length === 0}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #0d6efd",
              background:
                !name.trim() || files.length === 0 ? "#9bbcf9" : "#0d6efd",
              color: "#fff",
              cursor:
                !name.trim() || files.length === 0 ? "not-allowed" : "pointer",
            }}
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
