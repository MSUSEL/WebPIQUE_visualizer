// project page
import { useEffect, useMemo, useRef, useState } from "react";
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

// helper for compressed file load (wrapper we pass through)
type UploadPayload = { filename: string; data: any };

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
        const parsedProjects: Project[] = JSON.parse(storedProjects);
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


  const activeFiles = useMemo(
    () => (activeProjectId ? filesByProject[activeProjectId] ?? [] : []),
    [activeProjectId, filesByProject]
  );
  const canAddMore = activeFiles.length < MAX_FILES;

  // ---------- project operations ----------

  function handleCreateProject(name: string, files: ProjectFileScore[]) {
    const id = crypto.randomUUID();
    const proj: Project = { id, name };
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
          onSelectProject={setActiveProjectId}
          onRemoveProject={handleRemoveProject}
          onRenameProject={handleRenameProject}
      />

      <CreateProjectDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={(name, files) => handleCreateProject(name, files)}
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
                  </header>
                  <TQIQAPlot files={activeFiles} selectedIds={selectedIds} />
                </section>

                <section className="min-w-0">
                  <ProjectFileLoad
                    ref={fileLoadRef}
                    projectId={activeProjectId}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onScores={(pid, scores) =>
                      setFilesByProject((prev) => ({
                        ...prev,
                        [pid]: scores,
                      }))
                    }
                    onSelectionChange={setSelectedIds}
                    onViewerPayload={(v) => {
                      if (v.mode === "single") {
                        setComparePayload(undefined);
                        setSinglePayload(v.file);
                      } else {
                        setSinglePayload(undefined);
                        setComparePayload({
                          file1: v.file1,
                          file2: v.file2,
                        });
                      }
                    }}
                  />

                  {/* Add File + Visualize buttons live under the file box */}
                  <div className="mt-3 flex items-center justify-end gap-3">
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
