// project page
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProjectSidebar, {
  Project,
} from "../components/projectPage/ProjectSidebar";
import ProjectFileLoad, {
  MAX_FILES,
  ProjectFileLoadHandle,
  ProjectFileScore,
  ViewMode,
} from "../components/projectPage/ProjectFileLoad";
import TQIQAPlot from "../components/plotting/TQIQAPlot";
import CreateProjectDialog from "../components/projectPage/CreateProjectDialog";
import ModalPopout from "../components/projectPage/ModalPopout";
import SingleFileComponent from "../components/nonProject/SingleFileComponent";
import CompareComponent from "../components/nonProject/CompareComponent";
import { fetchRecentRepoJsonFiles } from "../Utilities/RepoAuto";
import { parseTQIQAScores } from "../Utilities/TQIQAScoreParser";
import LZString from "lz-string";

// helper for compressed file load (wrapper we pass through)
type UploadPayload = { filename: string; data: any };
type ViewerPayload =
  | { mode: "single"; file?: UploadPayload }
  | { mode: "compare"; file1?: UploadPayload; file2?: UploadPayload };
const sameStringArray = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const sameUpload = (a?: UploadPayload, b?: UploadPayload) =>
  a?.filename === b?.filename && a?.data === b?.data;
const normalizeAspects = (raw: any) => {
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

// ----- localStorage keys -----
const PROJECTS_KEY = "wp_projects";
const PROJECT_FILES_PREFIX = "wp_project_files:";
const ACTIVE_PROJECT_KEY = "wp_active_project_id";

export default function ProjectView() {
  // ---------- core project state ----------
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [filesByProject, setFilesByProject] = useState<
    Record<string, ProjectFileScore[]>
  >({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectRefreshNonce, setProjectRefreshNonce] = useState(0);
  const [refreshStatus, setRefreshStatus] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);

  // selection for plot + viewers
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("single");

  // modal for visualized single or compare files, popout window
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ViewMode>("single");
  const fileLoadRef = useRef<ProjectFileLoadHandle | null>(null);

  // viewer payloads (from loader)
  const [singlePayload, setSinglePayload] = useState<
    UploadPayload | undefined
  >();
  const [comparePayload, setComparePayload] = useState<
    { file1?: UploadPayload; file2?: UploadPayload } | undefined
  >();

  // ---------- load projects + files from localStorage on mount ----------
  useEffect(() => {
    try {
      const storedProjects = localStorage.getItem(PROJECTS_KEY);
      if (storedProjects) {
        const parsedProjects: Project[] = (JSON.parse(storedProjects) as Project[]).map(
          (p: any) => {
            const rc = p?.repoConnection
              ? {
                  provider: p.repoConnection.provider,
                  baseUrl: p.repoConnection.baseUrl,
                  repoPath: p.repoConnection.repoPath,
                  ref: p.repoConnection.ref,
                  dir: p.repoConnection.dir,
                }
              : undefined;
            return { id: p.id, name: p.name, repoConnection: rc };
          }
        );
        setProjects(parsedProjects);

        // load files for each project
        const fileMap: Record<string, ProjectFileScore[]> = {};
        for (const proj of parsedProjects) {
          const raw = localStorage.getItem(`${PROJECT_FILES_PREFIX}${proj.id}`);
          if (raw) {
            try {
              fileMap[proj.id] = JSON.parse(raw) as ProjectFileScore[];
            } catch {
              // ignore bad/old data
            }
          }
        }
        setFilesByProject(fileMap);

        // restore active project if possible, otherwise default to first
        const storedActive = localStorage.getItem(ACTIVE_PROJECT_KEY) || null;
        if (storedActive && parsedProjects.some((p) => p.id === storedActive)) {
          setActiveProjectId(storedActive);
        } else if (parsedProjects.length > 0) {
          setActiveProjectId(parsedProjects[0].id);
        }
      }
    } catch {
      // if anything fails, fall back to empty state
      setProjects([]);
      setFilesByProject({});
      setActiveProjectId(null);
    } finally {
      setProjectsLoaded(true);
    }
  }, []);

  // ---------- persist projects list ----------
  useEffect(() => {
    if (!projectsLoaded) return;
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // ignore quota/serialization errors
    }
  }, [projects, projectsLoaded]);

  // ---------- persist files for each project ----------
  useEffect(() => {
    try {
      for (const [id, files] of Object.entries(filesByProject)) {
        localStorage.setItem(
          `${PROJECT_FILES_PREFIX}${id}`,
          JSON.stringify(files)
        );
      }
    } catch {
      // ignore quota/serialization errors
    }
  }, [filesByProject]);

  // ---------- persist active project id ----------
  useEffect(() => {
    try {
      if (activeProjectId) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
      } else {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
      }
    } catch {
      // ignore
    }
  }, [activeProjectId]);

  // reset selection when switching projects
  useEffect(() => {
    setSelectedIds([]);
  }, [activeProjectId]);

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    setProjectRefreshNonce((n) => n + 1);
    setRefreshStatus("");
  }, []);


  const activeFiles = useMemo(
    () => (activeProjectId ? filesByProject[activeProjectId] ?? [] : []),
    [activeProjectId, filesByProject]
  );
  const canAddMore = activeFiles.length < MAX_FILES;

  // ---------- project operations ----------

  function handleCreateProject(
    name: string,
    files: ProjectFileScore[],
    repoConnection?: Project["repoConnection"]
  ) {
    const id = crypto.randomUUID();
    const proj: Project = { id, name, repoConnection };
    const first12 = files.slice(0, 12);

    setProjects((prev) => {
      const next = [...prev, proj];
      try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setFilesByProject((prev) => ({ ...prev, [id]: first12 }));
    setActiveProjectId(id);
    setCreateOpen(false);

    try {
      localStorage.setItem(
        `${PROJECT_FILES_PREFIX}${id}`,
        JSON.stringify(first12)
      );
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!projectsLoaded || !activeProjectId) return;
    const activeProject = projects.find((p) => p.id === activeProjectId);
    const repoCfg = activeProject?.repoConnection;
    if (!repoCfg) return;

    let cancelled = false;
    (async () => {
      setRefreshStatus(`Refreshing files from ${repoCfg.provider}...`);
      const fetchEntries = async (token?: string) =>
        fetchRecentRepoJsonFiles({
          ...repoCfg,
          token,
          maxFiles: MAX_FILES,
        });

      try {
        let entries;
        try {
          entries = await fetchEntries();
        } catch (e: any) {
          const msg = String(e?.message ?? "");
          const authErr =
            /\((401|403)\)/.test(msg) ||
            (repoCfg.provider === "github" && /\(404\)/.test(msg));
          if (!authErr) throw e;

          const token =
            window.prompt(
              "This repository appears to require a personal access token. Enter token to refresh files:",
              ""
            ) ?? "";
          if (!token.trim()) throw e;
          entries = await fetchEntries(token.trim());
        }
        if (cancelled) return;

        const nextFiles: ProjectFileScore[] = [];
        for (const item of entries.slice(0, MAX_FILES)) {
          const parsed: any = parseTQIQAScores(item.json);
          const tqi: number | null =
            parsed?.tqi ??
            parsed?.tqiScore ??
            parsed?.scores?.tqi ??
            parsed?.scores?.tqiScore ??
            null;
          const aspects = normalizeAspects(
            parsed?.aspects ?? parsed?.scores?.aspects ?? []
          );
          const fileMillis = Number(item.fileMillis) || Date.now();
          const id = `${item.fileName}-${fileMillis}`;
          const rawKey = `raw:${id}`;
          try {
            const comp = LZString.compressToUTF16(JSON.stringify(item.json));
            localStorage.setItem(rawKey, comp);
          } catch {
            // ignore local storage failures
          }
          nextFiles.push({
            id,
            rawKey,
            fileName: item.fileName,
            fileDateISO: new Date(fileMillis).toISOString(),
            tqi,
            aspects,
            needsRaw: false,
          });
        }

        setFilesByProject((prev) => ({ ...prev, [activeProject.id]: nextFiles }));
        setRefreshStatus(
          `Refreshed ${nextFiles.length} file(s) from ${repoCfg.provider}.`
        );
      } catch (e) {
        console.warn("Repo auto-refresh failed:", e);
        setRefreshStatus(
          `Repo refresh failed${
            e instanceof Error && e.message ? `: ${e.message}` : "."
          }`
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectsLoaded, activeProjectId, projects, projectRefreshNonce]);

  function handleRemoveProject(id: string) {
    if (
      !confirm(
        `Remove "${projects.find((p) => p.id === id)?.name ?? "this project"}"?`
      )
    )
      return;

    // remove any compressed raws for the project files
    const files = filesByProject[id] ?? [];
    for (const f of files) {
      const key = f.rawKey ?? `raw:${f.id}`;
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }

    // drop the scores list for this project
    localStorage.removeItem(`${PROJECT_FILES_PREFIX}${id}`);

    const nextProjects = projects.filter((p) => p.id !== id);
    setProjects(nextProjects);
    setFilesByProject((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setActiveProjectId((curr) =>
      curr === id ? nextProjects[0]?.id ?? null : curr
    );
  }

  const handleRenameProject = (id: string, name: string) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, name } : p));
      try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleScores = useCallback(
    (pid: string, scores: ProjectFileScore[]) => {
      setFilesByProject((prev) => {
        if (prev[pid] === scores) return prev;
        return { ...prev, [pid]: scores };
      });
    },
    []
  );

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds((prev) => (sameStringArray(prev, ids) ? prev : ids));
  }, []);

  const handleViewerPayload = useCallback((v: ViewerPayload) => {
    if (v.mode === "single") {
      setComparePayload((prev) => (prev === undefined ? prev : undefined));
      setSinglePayload((prev) => (sameUpload(prev, v.file) ? prev : v.file));
      return;
    }

    setSinglePayload((prev) => (prev === undefined ? prev : undefined));
    setComparePayload((prev) => {
      const next = { file1: v.file1, file2: v.file2 };
      if (
        sameUpload(prev?.file1, next.file1) &&
        sameUpload(prev?.file2, next.file2)
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // ---------- render ----------
  return (
    <div className="flex flex-1 min-h-0">
      <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          filesByProject={Object.fromEntries(
            Object.entries(filesByProject).map(([pid, arr]) => [
              pid,
              arr.map((f) => ({ fileName: f.fileName })),
            ])
          )}
          onAddProject={() => setCreateOpen(true)}
          onSelectProject={handleSelectProject}
          onRemoveProject={handleRemoveProject}
          onRenameProject={handleRenameProject}
      />

      <CreateProjectDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={(name, files, repoConnection) =>
            handleCreateProject(name, files, repoConnection)
          }
          defaultName={`Project ${projects.length + 1}`}
      />

      <main className="flex min-h-0 flex-1 items-start justify-start p-6">
        {activeProjectId ? (
          <div className="min-h-[420px] h-full w-full">
              {/* top section: plot + file list */}
              <div className="grid min-h-0 w-full grid-cols-1 gap-4">
                <section className="min-w-0">
                  <header className="mb-2 text-[20px]">
                    <h2>
                      <strong>TQI &amp; Quality Aspect Score Tracker for{" "}
                        {projects.find((p) => p.id === activeProjectId)?.name}</strong>
                    </h2>
                    {refreshStatus ? (
                      <div className="mt-1 text-[14px] text-[#555]">
                        {refreshStatus}
                      </div>
                    ) : null}
                  </header>
                  <TQIQAPlot files={activeFiles} selectedIds={selectedIds} />
                </section>

                <section className="min-w-0">
                  <ProjectFileLoad
                    ref={fileLoadRef}
                    projectId={activeProjectId}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onScores={handleScores}
                    onSelectionChange={handleSelectionChange}
                    onViewerPayload={handleViewerPayload}
                  />

                  {/* Add File + Visualize buttons live under the file box */}
                  <div className="mt-3 flex items-center justify-start gap-3">
                    <button
                      type="button"
                      className="rounded-[10px] border border-[#9bbcf9] bg-[#2679f5] px-3.5 py-2 font-semibold text-[#f3e8e8] disabled:cursor-not-allowed disabled:border-[#727679] disabled:bg-[#8a8c8d] disabled:text-[#afafaf]"
                      disabled={!canAddMore}
                      onClick={() => fileLoadRef.current?.openAddFile()}
                    >
                      + Add File(s)
                    </button>
                    <button
                      className="rounded-[10px] border border-[#9bbcf9] bg-[#2679f5] px-3.5 py-2 font-semibold text-[#f3e8e8] disabled:cursor-not-allowed disabled:border-[#727679] disabled:bg-[#8a8c8d] disabled:text-[#afafaf]"
                      disabled={
                        (viewMode === "single" && selectedIds.length !== 1) ||
                        (viewMode === "compare" && selectedIds.length !== 2)
                      }
                      onClick={() => {
                        setModalOpen(true);
                        setModalMode(viewMode);
                      }}
                    >
                      Visualize
                    </button>
                  </div>
                </section>
              </div>
            </div>
        ) : (
          <div className="mx-auto my-[70px] text-center text-[20px]">
            <p>
              <strong>
                To create a project and add files to visualize TQI and Quality
                Aspect trends over time, <br />
                click the + icon in the project list sidebar.
              </strong>
            </p>
          </div>
        )}

        {isModalOpen && (
          <ModalPopout onClose={() => setModalOpen(false)}>
            {modalMode === "single" ? (
              <SingleFileComponent jsonData={singlePayload} embedded />
            ) : (
              <CompareComponent
                file1={comparePayload?.file1}
                file2={comparePayload?.file2}
                embedded
                initialSizes={[50, 50]}
              />
            )}
          </ModalPopout>
        )}
      </main>
    </div>
  );
}
