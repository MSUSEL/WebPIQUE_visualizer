// create project and load file dialog box
import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseTQIQAScores } from "../Utilities/TQIQAScoreParser";
import type { ProjectFileScore, AspectItem } from "./ProjectFileLoad";

const MAX_FILES = 12;
const GENERIC_SCHEMA_MSG =
  "This file doesn’t match the supported schema. Please refer to the documentation.";

const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);
const validateSchema = (root: any) => {
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

export default function CreateProjectDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, files: ProjectFileScore[]) => void;
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<ProjectFileScore[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFiles = () => inputRef.current?.click();

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const picked = Array.from(fileList);
    if (picked.length > MAX_FILES) {
      alert(`Please select at most ${MAX_FILES} files.`);
      return;
    }

    const out: ProjectFileScore[] = [];
    for (const f of picked) {
      if (!f.name.toLowerCase().endsWith(".json")) {
        alert("Only JSON files are allowed.");
        return;
      }
      let json: any;
      try {
        json = JSON.parse(await f.text());
      } catch {
        alert("Invalid JSON file.");
        return;
      }
      if (!validateSchema(json)) {
        alert(GENERIC_SCHEMA_MSG);
        return;
      }
      const parsed: any = parseTQIQAScores(json);
      const tqi: number | null =
        parsed?.tqi ??
        parsed?.tqiScore ??
        parsed?.scores?.tqi ??
        parsed?.scores?.tqiScore ??
        null;
      const aspects = normalizeAspects(
        parsed?.aspects ?? parsed?.scores?.aspects ?? []
      );
      out.push({
        id: crypto.randomUUID(),
        fileName: f.name,
        fileDateISO: new Date(f.lastModified).toISOString(),
        tqi,
        aspects,
      });
    }
    setFiles(out);
  }

  function commit() {
    if (!name.trim() || files.length === 0) return;
    onCreate(name.trim(), files);
    setName("");
    setFiles([]);
    onClose();
  }

  if (!open) return null;

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
    padding: 16,
    width: 520,
    maxWidth: "92vw",
    boxShadow: "0 12px 32px rgba(0,0,0,.2)",
  };

  return createPortal(
    <div className="modal-mask" style={maskStyle} onClick={onClose}>
      <div
        className="modal"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Create Project</h3>

        <label className="block">
          <span>Project name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Project 1"
          />
        </label>

        <div className="mt-2">
          <button className="btn" onClick={pickFiles}>
            Select up to 12 files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
          />
          {files.length > 0 && (
            <ul className="mt-2">
              {files.map((f) => (
                <li key={f.id}>{f.fileName}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="btn"
            disabled={!name.trim() || files.length === 0}
            onClick={commit}
          >
            Create
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
