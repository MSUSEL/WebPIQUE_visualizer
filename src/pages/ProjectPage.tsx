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

import SingleFileComponent from "../components/nonProject/SingleFileComponent";
import CompareComponent from "../components/nonProject/CompareComponent";
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
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const topContentRef = useRef<HTMLDivElement | null>(null);

  const userResizedRef = useRef(false);

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

  // render sash only if a valid selection exists
  const hasSelection = useMemo(() => {
    if (viewMode === "single") return selectedIds.length === 1;
    if (viewMode === "compare") return selectedIds.length === 2;
    return false;
  }, [viewMode, selectedIds]);

  const effectiveSizes = hasSelection ? rowSizes : [100, 0];
  const handleSizesChange = (sizes: number[]) => setRowSizes(sizes);
  const handleChangeStart = () => {
    userResizedRef.current = true;
  };
  const handleChangeEnd = () => {};

  useEffect(() => {
    const recompute = () => {
      const container = splitContainerRef.current;
      const top = topContentRef.current;
      if (!container || !top || userResizedRef.current) return;

      const containerH = container.clientHeight;
      const contentH = top.scrollHeight;
      if (containerH <= 0 || contentH <= 0) return;

      const padded = contentH + 12;
      const pct = Math.max(30, Math.min(75, (padded / containerH) * 100));
      setRowSizes([pct, 100 - pct]);
    };

    recompute();
    const onResize = () => {
      if (!userResizedRef.current) recompute();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeFiles, selectedIds, viewMode]);

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
              <div ref={splitContainerRef} className="split-root">
                <SplitPane
                  split="horizontal"
                  sizes={effectiveSizes}
                  onChange={handleSizesChange}
                  onDragStart={handleChangeStart}
                  onDragEnd={handleChangeEnd}
                  sashRender={() =>
                    hasSelection ? (
                      <div className="project-sashRenderDots">
                        <span />
                      </div>
                    ) : null
                  }
                >
                  <Pane minSize={240}>
                    {/* top content wrapper we measure */}
                    <div ref={topContentRef} className="project-two-col">
                      <section className="project-plot">
                        <header className="st-section-hdr">
                          <h2>
                            TQI &amp; Quality Aspect Score Tracker for{" "}
                            {
                              projects.find((p) => p.id === activeProjectId)
                                ?.name
                            }
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

                  <Pane minSize={180}>
                    <section className="detail-view">
                      {viewMode === "single" && singlePayload ? (
                        <SingleFileComponent jsonData={singlePayload} />
                      ) : null}
                      {viewMode === "compare" &&
                      comparePayload?.file1 &&
                      comparePayload?.file2 ? (
                        <div style={{ height: "100%" }}>
                          <CompareComponent
                            file1={comparePayload.file1}
                            file2={comparePayload.file2}
                            embedded
                            initialSizes={[50, 50]}
                          />
                        </div>
                      ) : null}
                    </section>
                  </Pane>
                </SplitPane>
              </div>
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
