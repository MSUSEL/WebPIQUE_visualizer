// project page
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Provider, createStore } from "jotai";
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
import {
  fetchSelectedRepoJsonFiles,
  listRecentRepoJsonFiles,
  type RepoAutoCandidate,
} from "../Utilities/RepoAuto";
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
  const [refreshStatus, setRefreshStatus] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [remoteDialogLoading, setRemoteDialogLoading] = useState(false);
  const [remoteDialogStatus, setRemoteDialogStatus] = useState("");
  const [remoteDialogToken, setRemoteDialogToken] = useState("");
  const [refreshProjectId, setRefreshProjectId] = useState<string | null>(null);
  const [remoteCandidates, setRemoteCandidates] = useState<RepoAutoCandidate[]>([]);
  const [selectedRemoteCandidateIds, setSelectedRemoteCandidateIds] = useState<
    string[]
  >([]);

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
                  selectedIds: Array.isArray(p.repoConnection.selectedIds)
                    ? p.repoConnection.selectedIds
                    : undefined,
                  selectedPaths: Array.isArray(p.repoConnection.selectedPaths)
                    ? p.repoConnection.selectedPaths
                    : undefined,
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
    setRefreshStatus("");
  }, []);


  const activeFiles = useMemo(
    () => (activeProjectId ? filesByProject[activeProjectId] ?? [] : []),
    [activeProjectId, filesByProject]
  );
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );
  const singleViewerStore = useMemo(
    () => createStore(),
    [isModalOpen, modalMode, singlePayload?.filename]
  );
  const refreshProject = useMemo(
    () => projects.find((p) => p.id === refreshProjectId) ?? null,
    [projects, refreshProjectId]
  );
  const allRemoteCandidatesSelected =
    remoteCandidates.length > 0 &&
    remoteCandidates.every((candidate) =>
      selectedRemoteCandidateIds.includes(candidate.id)
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

  const updateProjectRepoSelection = useCallback(
    (projectId: string, selectedCandidates: RepoAutoCandidate[]) => {
      const selectedIds = selectedCandidates.map((candidate) => candidate.id);
      const selectedPaths = selectedCandidates.map((candidate) => candidate.filePath);
      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== projectId || !project.repoConnection) return project;
          return {
            ...project,
            repoConnection: {
              ...project.repoConnection,
              selectedIds,
              selectedPaths,
            },
          };
        })
      );
    },
    []
  );

  const handleOpenRefreshDialog = useCallback(
    (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project?.repoConnection) return;
      setActiveProjectId(projectId);
      setRefreshProjectId(projectId);
      setRemoteDialogToken("");
      setRemoteCandidates([]);
      setSelectedRemoteCandidateIds([]);
      setRemoteDialogStatus("");
      setRemoteDialogLoading(false);
      setRemoteDialogOpen(true);
    },
    [projects]
  );

  const loadRemoteSelectionDialog = useCallback(
    async (project: Project, token?: string) => {
      const repoCfg = project.repoConnection;
      if (!repoCfg) return;

      setRemoteDialogLoading(true);
      setRemoteDialogStatus("Loading remote files...");

      try {
        const candidates = await listRecentRepoJsonFiles({
          ...repoCfg,
          token,
          maxFiles: MAX_FILES,
        });

        if (candidates.length === 0) {
          throw new Error("No remote JSON files are currently available.");
        }

        const savedPaths =
          Array.isArray(repoCfg.selectedPaths) && repoCfg.selectedPaths.length > 0
            ? new Set(repoCfg.selectedPaths)
            : null;
        const selectedIds =
          savedPaths
            ? candidates
                .filter((candidate) => savedPaths.has(candidate.filePath))
                .map((candidate) => candidate.id)
            : candidates
                .filter((candidate) =>
                  (repoCfg.selectedIds ?? []).includes(candidate.id)
                )
                .map((candidate) => candidate.id);

        setRemoteCandidates(candidates);
        setSelectedRemoteCandidateIds(
          selectedIds.length > 0
            ? selectedIds
            : candidates.map((candidate) => candidate.id)
        );
        setRemoteDialogStatus(
          "Select which current remote files to fetch for this project."
        );
      } catch (e) {
        console.warn("Remote selection preload failed:", e);
        setRemoteCandidates([]);
        setSelectedRemoteCandidateIds([]);
        setRemoteDialogStatus(
          e instanceof Error && e.message
            ? e.message
            : "Failed to load remote files."
        );
      } finally {
        setRemoteDialogLoading(false);
      }
    },
    []
  );

  const handleConfirmRemoteSelection = useCallback(async () => {
    if (!refreshProject?.repoConnection || selectedRemoteCandidateIds.length === 0) {
      return;
    }

    const repoCfg = refreshProject.repoConnection;
    const selectedCandidates = remoteCandidates.filter((candidate) =>
      selectedRemoteCandidateIds.includes(candidate.id)
    );

    setRemoteDialogLoading(true);
    setRemoteDialogStatus(`Refreshing files from ${repoCfg.provider}...`);
    setRefreshStatus(`Refreshing files from ${repoCfg.provider}...`);

    const fetchEntries = async (token?: string) =>
      fetchSelectedRepoJsonFiles({
        ...repoCfg,
        token,
        selectedIds: selectedCandidates.map((candidate) => candidate.id),
        maxFiles: MAX_FILES,
      });

    try {
      const entries = await fetchEntries(remoteDialogToken.trim() || undefined);

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

      setFilesByProject((prev) => ({ ...prev, [refreshProject.id]: nextFiles }));
      updateProjectRepoSelection(refreshProject.id, selectedCandidates);
      setRefreshStatus(
        `Refreshed ${nextFiles.length} file(s) from ${repoCfg.provider}.`
      );
      setRemoteDialogOpen(false);
      setRemoteDialogStatus("");
      setRefreshProjectId(null);
    } catch (e) {
      console.warn("Repo refresh failed:", e);
      const message =
        e instanceof Error && e.message ? e.message : "Repo refresh failed.";
      setRefreshStatus(`Repo refresh failed: ${message}`);
      setRemoteDialogStatus(message);
    } finally {
      setRemoteDialogLoading(false);
    }
  }, [
    refreshProject,
    remoteCandidates,
    remoteDialogToken,
    selectedRemoteCandidateIds,
    updateProjectRepoSelection,
  ]);

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
          onRefreshProject={handleOpenRefreshDialog}
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
        {remoteDialogOpen ? (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(0,0,0,0.35)]">
            <div className="w-[560px] max-w-[92vw] rounded-[10px] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.2)]">
              <div className="mb-3">
                <h3 className="m-0">Refresh Remote Files</h3>
                {refreshProject?.repoConnection ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[13px] text-[#555]">
                    <div>
                      <strong className="text-black">Source:</strong>{" "}
                      {refreshProject.repoConnection.provider}
                    </div>
                    <div>
                      <strong className="text-black">Base URL:</strong>{" "}
                      {refreshProject.repoConnection.baseUrl}
                    </div>
                    <div>
                      <strong className="text-black">Repo:</strong>{" "}
                      {refreshProject.repoConnection.repoPath}
                    </div>
                    <div>
                      <strong className="text-black">Ref:</strong>{" "}
                      {refreshProject.repoConnection.ref || "All branches"}
                    </div>
                    <div>
                      <strong className="text-black">Directory:</strong>{" "}
                      {refreshProject.repoConnection.dir || "None"}
                    </div>
                    <label className="mt-1 block">
                      <div className="mb-1 text-[12px] opacity-80">
                        Token (if required)
                      </div>
                      <input
                        type="password"
                        value={remoteDialogToken}
                        onChange={(e) => setRemoteDialogToken(e.target.value)}
                        placeholder={
                          refreshProject.repoConnection.provider === "github"
                            ? "GitHub token"
                            : "GitLab token"
                        }
                        className="w-full rounded-md border border-[#ddd] px-2.5 py-2 text-[13px]"
                        disabled={remoteDialogLoading}
                      />
                    </label>
                  </div>
                ) : null}
                {remoteDialogStatus ? (
                  <div className="mt-2 text-[13px] text-[#555]">
                    {remoteDialogStatus}
                  </div>
                ) : null}
              </div>

              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  className="cursor-pointer rounded-lg border border-[#ddd] bg-white px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    if (!refreshProject) return;
                    loadRemoteSelectionDialog(
                      refreshProject,
                      remoteDialogToken.trim() || undefined
                    );
                  }}
                  disabled={!refreshProject?.repoConnection || remoteDialogLoading}
                >
                  Connect to Remote
                </button>
                {remoteCandidates.length > 0 ? (
                  <div className="text-[12px] text-[#555]">
                    {selectedRemoteCandidateIds.length} of {remoteCandidates.length} selected
                  </div>
                ) : null}
              </div>

              {remoteCandidates.length > 0 ? (
                <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[13px] font-semibold">
                      Select saved files to fetch
                    </div>
                    <button
                      type="button"
                      className="cursor-pointer rounded border border-[#ddd] px-2 py-1 text-[12px]"
                      onClick={() =>
                        setSelectedRemoteCandidateIds(
                          allRemoteCandidatesSelected
                            ? []
                            : remoteCandidates.map((candidate) => candidate.id)
                        )
                      }
                      disabled={remoteDialogLoading}
                    >
                      {allRemoteCandidatesSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <ul className="max-h-[220px] space-y-1 overflow-auto">
                    {remoteCandidates.map((candidate) => {
                      const checked = selectedRemoteCandidateIds.includes(candidate.id);
                      return (
                        <li key={candidate.id}>
                          <label className="flex cursor-pointer items-start gap-2 text-[12px]">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={remoteDialogLoading}
                              onChange={() =>
                                setSelectedRemoteCandidateIds((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== candidate.id)
                                    : [...prev, candidate.id]
                                )
                              }
                            />
                            <span className="flex-1">
                              <span className="block">{candidate.fileName}</span>
                              <span className="block text-[#6b7280]">
                                {candidate.filePath}
                              </span>
                              <span className="block text-[#6b7280]">
                                {candidate.details ??
                                  (candidate.fileMillis
                                    ? new Date(candidate.fileMillis).toLocaleString()
                                    : "Unknown date")}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="cursor-pointer rounded-lg border border-[#ddd] bg-[#f7f7f7] px-3.5 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setRemoteDialogOpen(false);
                    setRefreshProjectId(null);
                    setRemoteDialogStatus("");
                    setRemoteCandidates([]);
                    setSelectedRemoteCandidateIds([]);
                    setRemoteDialogToken("");
                  }}
                  disabled={remoteDialogLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#0d6efd] bg-[#0d6efd] px-3.5 py-2 text-white disabled:cursor-not-allowed disabled:bg-[#9bbcf9]"
                  onClick={handleConfirmRemoteSelection}
                  disabled={
                    remoteDialogLoading ||
                    remoteCandidates.length === 0 ||
                    selectedRemoteCandidateIds.length === 0
                  }
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeProjectId ? (
          <div className="min-h-[420px] h-full w-full">
              {/* top section: plot + file list */}
              <div className="grid min-h-0 w-full grid-cols-1 gap-4">
                <section className="min-w-0">
                  <header className="mb-2 text-[20px]">
                    <h2>
                      <strong>TQI &amp; Quality Aspect Score Tracker for{" "}
                        {activeProject?.name}
                      </strong>
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
                    scoresFromParent={activeFiles}
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
              <Provider store={singleViewerStore}>
                <SingleFileComponent jsonData={singlePayload} embedded />
              </Provider>
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
