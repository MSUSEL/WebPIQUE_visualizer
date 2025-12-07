// project page
import { useEffect, useMemo, useState, useRef } from "react";
import ProjectSidebar, {
  Project,
} from "../components/projectPage/ProjectSidebar";
import ProjectFileLoad, {
  ProjectFileScore,
  ViewMode,
} from "../components/projectPage/ProjectFileLoad";
import TQIQAPlot from "../components/plotting/TQIQAPlot";
import CreateProjectDialog from "../components/projectPage/CreateProjectDialog";
import ModalPopout from "../components/projectPage/ModalPopout";

import "../styles/Pages.css";
import "../styles/ProjectViewStyle.css";

// helper for compressed file load (wrapper we pass through)
type UploadPayload = { filename: string; data: any };

// ----- localStorage keys -----
const PROJECTS_KEY = "wp_projects";
const PROJECT_FILES_PREFIX = "wp_project_files:";
const ACTIVE_PROJECT_KEY = "wp_active_project_id";

export default function ProjectView() {
  // ---------- core project state ----------
  const [projects, setProjects] = useState<Project[]>([]);
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
    }
  }, []);

  // ---------- persist projects list ----------
  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // ignore quota/serialization errors
    }
  }, [projects]);

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

  // ---------- project operations ----------

  function handleCreateProject(name: string, files: ProjectFileScore[]) {
    const id = crypto.randomUUID();
    const proj: Project = { id, name };
    const first12 = files.slice(0, 12);

    setProjects((prev) => [...prev, proj]);
    setFilesByProject((prev) => ({ ...prev, [id]: first12 }));
    setActiveProjectId(id);
    setCreateOpen(false);
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
    <div className="project-page app-container">
      <div className="project-layout">
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

        <main className="project-main">
          {activeProjectId ? (
            <div className="split-root">
              {/* top section: plot + file list */}
              <div className="project-two-col">
                <section className="project-plot">
                  <header className="st-section-hdr">
                    <h2>
                      TQI &amp; Quality Aspect Score Tracker for{" "}
                      {projects.find((p) => p.id === activeProjectId)?.name}
                    </h2>
                  </header>
                  <TQIQAPlot files={activeFiles} selectedIds={selectedIds} />
                </section>

                <section className="project-files">
                  <ProjectFileLoad
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

                  {/* Visualize button lives under the file box */}
                  <div className="visualize-btn-row">
                    <button
                      className="visualize-btn"
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
            <div className="start_message">
              <p>
                <strong>
                  Create a project and add files to visualize TQI and Quality
                  Aspect trends over time. <br />
                  Click the + icon in the project list sidebar to get started.
                </strong>
              </p>
            </div>
          )}

          {isModalOpen && (
            <ModalPopout onClose={() => setModalOpen(false)}>
              <iframe
                ref={iframeRef}
                title="Visualizer"
                className="viewer-iframe"
                src="/viewer"
                onLoad={() => {
                  const msg =
                    modalMode === "single"
                      ? {
                          type: "viewer-payload",
                          mode: "single",
                          file: singlePayload,
                        }
                      : {
                          type: "viewer-payload",
                          mode: "compare",
                          file1: comparePayload?.file1,
                          file2: comparePayload?.file2,
                        };
                  iframeRef.current?.contentWindow?.postMessage(
                    msg,
                    window.location.origin
                  );
                }}
              />
            </ModalPopout>
          )}
        </main>
      </div>
    </div>
  );
}
