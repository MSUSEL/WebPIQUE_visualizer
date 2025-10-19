// project page
import { useEffect, useMemo, useState, useRef } from "react";
import Header from "../components/headerfooter/Header";
import Footer from "../components/headerfooter/Footer";
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

export default function ProjectView() {
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

  // ---------- load/save projects ----------
  useEffect(() => {
    const p = localStorage.getItem("wp_projects");
    if (p) setProjects(JSON.parse(p));
  }, []);
  useEffect(() => {
    localStorage.setItem("wp_projects", JSON.stringify(projects));
  }, [projects]);

  // reset selection when switching projects
  useEffect(() => {
    setSelectedIds([]);
  }, [activeProjectId]);

  const activeFiles = useMemo(
    () => (activeProjectId ? filesByProject[activeProjectId] ?? [] : []),
    [activeProjectId, filesByProject]
  );

  function handleCreateProject(name: string, files: ProjectFileScore[]) {
    const id = crypto.randomUUID();
    const proj: Project = { id, name };
    const first12 = files.slice(0, 12);

    setProjects((prev) => [...prev, proj]);
    setFilesByProject((prev) => ({ ...prev, [id]: first12 }));
    localStorage.setItem(`wp_project_files:${id}`, JSON.stringify(first12));
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
      } catch {}
    }

    localStorage.removeItem(`wp_project_files:${id}`);
    // drop the scores list for this project
    localStorage.removeItem(`wp_project_files:${id}`);

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

  // ---------- viewer payloads (from loader) ----------
  const [singlePayload, setSinglePayload] = useState<
    UploadPayload | undefined
  >();
  const [comparePayload, setComparePayload] = useState<
    { file1?: UploadPayload; file2?: UploadPayload } | undefined
  >();

  // ---------- render ----------
  return (
    <div className="project-page app-container">
      <Header />
      <div className="main-content">
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
                {/* keep container sizing rules */}
                {/* top content wrapper */}
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
                          setComparePayload({ file1: v.file1, file2: v.file2 });
                        }
                      }}
                    />

                    {/* NEW: Visualize button lives under the file box */}
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
                          // the payloads (singlePayload/comparePayload) were just set by onViewerPayload()
                        }}
                      >
                        Visualize
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="start_message">{/* unchanged */}</div>
            )}
          </main>

          {isModalOpen && (
            <ModalPopout onClose={() => setModalOpen(false)}>
              <iframe
                ref={iframeRef}
                title="Visualizer"
                className="viewer-iframe"
                src="/viewer" // <-- new route we'll add below
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
        </div>
      </div>
      <Footer />
    </div>
  );
}
