import React, { useEffect, useMemo, useRef, useState } from "react";
// Assume your parser exports a default function that returns { tqi, aspects }
import { parseTQIQAScores } from "../Utilities/TQIQAScoreParser";

export type AspectItem = { name: string; value: number };

export type ProjectFileScore = {
  id: string;
  fileName: string;
  fileDateISO: string;
  tqi: number | null;
  aspects: AspectItem[];
};

const MAX_FILES = 12;
const GENERIC_SCHEMA_MSG =
  "This file doesn’t match the supported schema. Please refer to the documentation.";

function validateSchema(root: any): boolean {
  const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);
  if (!isObj(root)) return false;
  const hasFactors = isObj((root as any).factors);
  const hasMeasures = isObj((root as any).measures);
  if (!hasFactors && !hasMeasures) return false;
  if (hasFactors) {
    const fa = (root as any).factors;
    if (
      !(isObj(fa.product_factors) || isObj(fa.quality_aspects) || isObj(fa.tqi))
    ) {
      return false;
    }
  }
  return true;
}

export default function ProjectFileLoad({
  projectId,
  onScores,
}: {
  projectId: string | null;
  onScores: (projectId: string, scores: ProjectFileScore[]) => void;
}) {
  const [scores, setScores] = useState<ProjectFileScore[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // load any previously saved files for this project
  useEffect(() => {
    if (!projectId) return;
    const saved = localStorage.getItem(`wp_project_files:${projectId}`);
    if (saved) setScores(JSON.parse(saved));
  }, [projectId]);

  // persist whenever scores change
  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(
      `wp_project_files:${projectId}`,
      JSON.stringify(scores)
    );
    onScores(projectId, scores);
  }, [projectId, scores, onScores]);

  const handleChoose = () => inputRef.current?.click();

  function normalizeAspects(raw: any): AspectItem[] {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((a: any) => {
      // handle common variants: {name, value} | {name, score} | [name, value] | string/number
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
  }

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
        // ---- TQI & QA extraction (adapt to your parser’s API) ----
        const out: any = parseTQIQAScores(json); // or your function name

        // accept several shapes: {tqi} / {tqiScore} / {scores: {tqi/tqiScore, aspects}}
        const tqi: number | null = (out?.tqi ??
          out?.tqiScore ??
          out?.scores?.tqi ??
          out?.scores?.tqiScore ??
          null) as number | null;

        const aspects = normalizeAspects(
          out?.aspects ?? out?.scores?.aspects ?? []
        );
        parsed.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          fileDateISO: new Date(file.lastModified).toISOString(), // browser timestamp
          tqi,
          aspects,
        });
      }
      // Keep only 12 newest by name or date? Keep input order for now:
      setScores(parsed.slice(0, MAX_FILES));
    } catch (e) {
      console.error(e);
      alert("An unexpected error occurred while loading files.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section>
      <header className="st-section-hdr">
        <h2>TQI & Quality Aspect Score Tracker</h2>
        <div>
          <button className="btn" onClick={handleChoose} disabled={!projectId}>
            Load up to 12 files
          </button>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        className="file-box"
        style={{
          border: "1px solid var(--muted-border, #ccc)",
          borderRadius: 8,
          padding: 12,
          maxWidth: 360,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Available Files to Visualize or Compare
        </div>
        {scores.length === 0 ? (
          <div className="muted">No files loaded.</div>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
            {scores.map((s) => (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "2px 0",
                }}
              >
                <input type="checkbox" aria-label={`Select ${s.fileName}`} />
                <span
                  title={`TQI: ${s.tqi ?? "n/a"} • Date: ${new Date(
                    s.fileDateISO
                  ).toLocaleString()}`}
                >
                  {s.fileName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
