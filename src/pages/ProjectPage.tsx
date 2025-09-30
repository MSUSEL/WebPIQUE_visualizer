// project page
import { useEffect, useMemo, useState } from "react";
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

import SingleFileComponent from "../components/nonProject/SingleFileComponent";
import CompareComponent from "../components/nonProject/CompareComponent";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SplitPane, { Pane } from "split-pane-react";
import "split-pane-react/esm/themes/default.css";

import "../styles/Pages.css";
import "../styles/ProjectViewStyle.css";
import CIcon from "@coreui/icons-react";
import { cilPlus } from "@coreui/icons";

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
  const [rowSizes, setRowSizes] = useState<number[]>([65, 35]);

  function ErrorBoundary(props: { children: React.ReactNode }) {
    const [err, setErr] = useState<Error | null>(null);
    // minimal boundary via try/catch-wrapper render:
    // (If you prefer a class boundary, you can swap it in.)
    if (err) {
      return (
        <div style={{ padding: 16 }}>
          <h4>Viewer error</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(err.message || err)}
          </pre>
          <div className="muted">See console for stack trace.</div>
        </div>
      );
    }
    try {
      return <>{props.children}</>;
    } catch (e: any) {
      console.error("Viewer crashed:", e);
      setErr(e);
      return null;
    }
  }

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

  // render sash only if a valid selection exists
  const hasSelection = useMemo(() => {
    if (viewMode === "single") return selectedIds.length === 1;
    if (viewMode === "compare") return selectedIds.length === 2;
    return false;
  }, [viewMode, selectedIds]);

  const effectiveSizes = hasSelection ? rowSizes : [100, 0];

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
              <SplitPane
                split="horizontal"
                sizes={effectiveSizes}
                onChange={setRowSizes}
                sashRender={() =>
                  hasSelection ? (
                    <div className="project-sashRenderDots">
                      <span />
                    </div>
                  ) : null
                }
                style={{ height: "80vh" }}
              >
                {/* TOP: plot + file list (ALWAYS mounted) */}
                <Pane minSize={240}>
                  <div className="project-two-col">
                    <section className="project-plot">
                      <header className="st-section-hdr">
                        <h2>
                          TQI &amp; Quality Aspect Score Tracker for{" "}
                          {projects.find((p) => p.id === activeProjectId)?.name}
                        </h2>
                      </header>
                      <TQIQAPlot
                        files={activeFiles}
                        selectedIds={selectedIds}
                      />
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
                    </section>
                  </div>
                </Pane>

                {/* BOTTOM: viewer */}
                <Pane minSize={180}>
                  <section className="detail-view">
                    {viewMode === "single" && singlePayload ? (
                      <>
                        <SingleFileComponent jsonData={singlePayload} />
                      </>
                    ) : null}

                    {/* Temporary compare placeholder */}
                    {viewMode === "compare" &&
                    comparePayload?.file1 &&
                    comparePayload?.file2 ? (
                      <div
                        style={{
                          padding: 24,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          gap: 12,
                        }}
                      >
                        <h3 style={{ margin: 0 }}>Compare view coming soon</h3>
                        <p style={{ maxWidth: 640, opacity: 0.8 }}>
                          The compare experience is temporarily disabled while
                          we finish a fix. You can still view individual files
                          using <strong>Single File</strong>.
                        </p>
                      </div>
                    ) : null}
                  </section>
                </Pane>
              </SplitPane>
            ) : (
              <div className="start_message">
                <h3>
                  <strong>
                    To begin, create a project by clicking the{" "}
                    <CIcon className="project-icon" icon={cilPlus} /> icon in
                    the sidebar.{" "}
                  </strong>
                </h3>
              </div>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
