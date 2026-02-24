// create project and load file dialog box
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LZString from "lz-string";
import type { ProjectFileScore, AspectItem } from "./ProjectFileLoad";
import { fetchRecentRepoJsonFiles, type RepoProvider } from "../../Utilities/RepoAuto";
import type { RepoConnectionConfig } from "./ProjectSidebar";

const MAX_FILES = 12;

const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);

const validateLikelySchema = (root: any) => {
  if (!isObj(root)) return false;
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

export default function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  defaultName,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    files: ProjectFileScore[],
    repoConnection?: RepoConnectionConfig
  ) => void;
  defaultName?: string;
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<ProjectFileScore[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [repoPanelOpen, setRepoPanelOpen] = useState(false);
  const [repoProvider, setRepoProvider] = useState<RepoProvider>("gitlab");
  const [repoBaseUrl, setRepoBaseUrl] = useState("https://gitlab.com");
  const [repoPath, setRepoPath] = useState("");
  const [repoRef, setRepoRef] = useState("main");
  const [repoDir, setRepoDir] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [repoStatus, setRepoStatus] = useState("");
  const [repoConnected, setRepoConnected] = useState(false);

  useEffect(() => {
    if (open) setName(defaultName ?? "Project 1");
    else {
      setName("");
      setFiles([]);
      setRepoPanelOpen(false);
      setRepoProvider("gitlab");
      setRepoBaseUrl("https://gitlab.com");
      setRepoPath("");
      setRepoRef("main");
      setRepoDir("");
      setRepoToken("");
      setRepoStatus("");
      setRepoConnected(false);
    }
  }, [open, defaultName]);

  const fileCountLabel = useMemo(
    () => `${files.length} / ${MAX_FILES} file${files.length === 1 ? "" : "s"}`,
    [files.length]
  );

  async function upsertParsedEntries(
    entries: { fileName: string; fileMillis: number; json: any }[]
  ) {
    setLoading(true);
    setProgress(0);
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

    const roomLeft = Math.max(0, MAX_FILES - files.length);
    if (entries.length > roomLeft) {
      alert(
        `You can add up to ${MAX_FILES} files per project. Only the first ${roomLeft} will be added.`
      );
    }

    const trimmed = entries.slice(0, roomLeft);
    const next: ProjectFileScore[] = [...files];

    try {
      const total = trimmed.length || 1;
      let processed = 0;

      for (const item of trimmed) {
        if (!item.fileName.toLowerCase().endsWith(".json")) {
          alert(`Only JSON files are allowed. Skipped: ${item.fileName}`);
          processed += 1;
          setProgress(processed / total);
          await new Promise(requestAnimationFrame);
          continue;
        }

        if (!validateLikelySchema(item.json)) {
          alert(
            `"${item.fileName}" does not match the supported schema. Please refer to the documentation.`
          );
          processed += 1;
          setProgress(processed / total);
          await new Promise(requestAnimationFrame);
          continue;
        }

        const fileMillis = Number(item.fileMillis) || Date.now();
        const id = `${item.fileName}-${fileMillis}`;
        const rawKey = `raw:${id}`;

        let parsed: any;
        try {
          parsed = parseTQIQAScores(item.json);
        } catch (err) {
          console.error("parseTQIQAScores error", err);
          alert(`Could not parse scores from ${item.fileName}`);
          processed += 1;
          setProgress(processed / total);
          await new Promise(requestAnimationFrame);
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

        try {
          const txt = JSON.stringify(item.json);
          const comp = LZString.compressToUTF16(txt);
          localStorage.setItem(rawKey, comp);
        } catch (e) {
          console.warn("Failed to persist compressed raw for", item.fileName, e);
        }

        const entry: ProjectFileScore = {
          id,
          rawKey,
          fileName: item.fileName,
          fileDateISO: new Date(fileMillis).toISOString(),
          tqi,
          aspects,
          needsRaw: false,
        };

        const idx = next.findIndex((x) => x.fileName === item.fileName);
        if (idx >= 0) next[idx] = entry;
        else next.push(entry);

        processed += 1;
        setProgress(processed / total);
        await new Promise(requestAnimationFrame);
      }

      setFiles(next);
    } finally {
      setLoading(false);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const parsedEntries: { fileName: string; fileMillis: number; json: any }[] = [];

    for (const f of Array.from(fileList)) {
      if (!f.name.toLowerCase().endsWith(".json")) {
        alert(`Only JSON files are allowed. Skipped: ${f.name}`);
        continue;
      }
      try {
        parsedEntries.push({
          fileName: f.name,
          fileMillis: f.lastModified,
          json: JSON.parse(await f.text()),
        });
      } catch {
        alert(`Invalid JSON: ${f.name}`);
      }
    }

    await upsertParsedEntries(parsedEntries);
  }

  async function handleConnectRepo() {
    setRepoStatus("");

    try {
      setLoading(true);
      setProgress(0.02);
      await new Promise(requestAnimationFrame);
      const parsedEntries = await fetchRecentRepoJsonFiles({
        provider: repoProvider,
        repoPath,
        baseUrl: repoBaseUrl,
        ref: repoRef,
        dir: repoDir,
        token: repoToken,
        maxFiles: MAX_FILES,
        onProgress: setProgress,
      });

      setLoading(false);
      setProgress(0);

      await upsertParsedEntries(parsedEntries);
      setRepoStatus(
        `Fetched ${parsedEntries.length} file(s) from ${repoProvider}.`
      );
      setRepoConnected(true);
    } catch (e: any) {
      console.error(e);
      setLoading(false);
      setProgress(0);
      setRepoStatus(e?.message ?? "Failed to connect to repository.");
      alert(e?.message ?? "Failed to connect to repository.");
      setRepoConnected(false);
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((x) => x.id !== id));
  }

  function handleContinue() {
    const n = name.trim();
    if (!n || files.length === 0) return;
    const repoConnection: RepoConnectionConfig | undefined =
      repoConnected && repoPath.trim()
        ? {
            provider: repoProvider,
            baseUrl: repoBaseUrl.trim(),
            repoPath: repoPath.trim(),
            ref: repoRef.trim() || "main",
            dir: repoDir.trim(),
          }
        : undefined;
    onCreate(n, files, repoConnection);
    onClose();
  }

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.35)]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] rounded-[10px] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0">Create Project</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer text-[18px] leading-none"
            title="Close"
          >
            X
          </button>
        </div>

        <label className="mb-3 block">
          <div className="mb-1.5 text-[12px] opacity-80">Project name</div>
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

        <div>
          <div className="flex items-center gap-3">
            <button
              className="cursor-pointer rounded-lg border border-[#ddd] bg-[#f7f7f7] px-3 py-2"
              onClick={() => inputRef.current?.click()}
            >
              Browse files
            </button>
            <button
              className="cursor-pointer rounded-lg border border-[#ddd] bg-[#f7f7f7] px-3 py-2"
              onClick={() => setRepoPanelOpen((v) => !v)}
            >
              {repoPanelOpen ? "Hide Repo Connect" : "Connect to Repo"}
            </button>
            <div className="text-[12px] opacity-75">{fileCountLabel}</div>
          </div>

          {repoPanelOpen && (
            <div className="mt-3 rounded-lg border border-[#ddd] bg-[#fafafa] p-3">
              <div className="mb-2 text-[13px] font-semibold">
                Repository Source
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={repoProvider}
                    onChange={(e) => {
                      const next = e.target.value as "gitlab" | "github";
                      setRepoProvider(next);
                      setRepoConnected(false);
                      setRepoStatus("");
                      setRepoBaseUrl(
                        next === "gitlab"
                          ? "https://gitlab.com"
                          : "https://api.github.com"
                      );
                    }}
                    className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                  >
                    <option value="gitlab">GitLab</option>
                    <option value="github">GitHub</option>
                  </select>
                  <input
                    type="text"
                    value={repoBaseUrl}
                    onChange={(e) => {
                      setRepoBaseUrl(e.target.value);
                      setRepoConnected(false);
                      setRepoStatus("");
                    }}
                    placeholder={
                      repoProvider === "gitlab"
                        ? "GitLab base URL"
                        : "GitHub API base URL"
                    }
                    className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                  />
                </div>
                <input
                  type="text"
                  value={repoPath}
                  onChange={(e) => {
                    setRepoPath(e.target.value);
                    setRepoConnected(false);
                    setRepoStatus("");
                  }}
                  placeholder={
                    repoProvider === "gitlab"
                      ? "Repo path or URL (group/subgroup/project)"
                      : "Repo path or URL (owner/repo)"
                  }
                  className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={repoRef}
                    onChange={(e) => {
                      setRepoRef(e.target.value);
                      setRepoConnected(false);
                      setRepoStatus("");
                    }}
                    placeholder="Ref/branch (default: main)"
                    className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                  />
                  <input
                    type="text"
                    value={repoDir}
                    onChange={(e) => {
                      setRepoDir(e.target.value);
                      setRepoConnected(false);
                      setRepoStatus("");
                    }}
                    placeholder="Directory path (optional)"
                    className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                  />
                </div>
                <input
                  type="password"
                  value={repoToken}
                  onChange={(e) => {
                    setRepoToken(e.target.value);
                    setRepoConnected(false);
                    setRepoStatus("");
                  }}
                  placeholder={
                    repoProvider === "gitlab"
                      ? "GitLab private token (optional)"
                      : "GitHub token (optional, for private repos)"
                  }
                  className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="cursor-pointer rounded-lg border border-[#ddd] bg-white px-3 py-2 text-[13px]"
                  onClick={handleConnectRepo}
                >
                  Fetch Latest Files (up to 12)
                </button>
                {repoStatus ? (
                  <div className="text-[12px] text-[#555]">{repoStatus}</div>
                ) : null}
              </div>
            </div>
          )}

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

          {loading && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] opacity-80">
                <span>Files loading</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#eee]">
                <div
                  style={{
                    width: `${Math.max(2, progress * 100)}%`,
                    height: "100%",
                    background: "#0d6efd",
                    transition: "width .2s linear",
                  }}
                />
              </div>
            </div>
          )}

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
                    X
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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

  const portalTarget =
    typeof document !== "undefined" && document.body ? document.body : null;

  return portalTarget ? createPortal(content, portalTarget) : content;
}
