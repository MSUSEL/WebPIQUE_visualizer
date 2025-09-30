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

import SingleFileComponent from "../components/SingleFileComponent";
import CompareComponent from "../components/CompareComponent";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SplitPane, { Pane } from "split-pane-react";
import "split-pane-react/esm/themes/default.css";
import LZString from "lz-string";

import "../styles/Pages.css";
import "../styles/ProjectViewStyle.css";

// helper for compressed file load
function loadCompressedRaw(id: string): any | undefined {
  try {
    const comp = localStorage.getItem(`raw:${id}`);
    if (!comp) return undefined;
    const txt = LZString.decompressFromUTF16(comp);
    if (!txt) return undefined;
    return JSON.parse(txt);
  } catch {
    return undefined;
  }
}

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
    const nextProjects = projects.filter((p) => p.id !== id);
    setProjects(nextProjects);
    setFilesByProject((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    localStorage.removeItem(`wp_project_files:${id}`);
    setActiveProjectId((curr) =>
      curr === id ? nextProjects[0]?.id ?? null : curr
    );
  }

  // ---------- derive viewer payloads from selection + files ----------
  const selectedFiles = useMemo(
    () => activeFiles.filter((f) => selectedIds.includes(f.id)),
    [activeFiles, selectedIds]
  );

  const getRaw = (f?: ProjectFileScore) =>
    f?.raw ?? (f ? loadCompressedRaw(f.id) : undefined);

  const singlePayload = useMemo(() => {
    if (viewMode !== "single" || selectedFiles.length < 1) return undefined;
    const f = selectedFiles[0];
    const raw = getRaw(f);
    return raw ? { filename: f.fileName, data: raw } : undefined;
  }, [viewMode, selectedFiles]);

  const comparePayload = useMemo(() => {
    if (viewMode !== "compare" || selectedFiles.length !== 2) return undefined;
    const [a, b] = selectedFiles;
    const ra = getRaw(a);
    const rb = getRaw(b);
    return ra && rb
      ? {
          file1: { filename: a.fileName, data: ra },
          file2: { filename: b.fileName, data: rb },
        }
      : undefined;
  }, [viewMode, selectedFiles]);

  const hasSelection = useMemo(() => {
    if (viewMode === "single") return selectedFiles.length === 1;
    if (viewMode === "compare") return selectedFiles.length === 2;
    return false;
  }, [viewMode, selectedFiles]);

  // split pane sizing and collapse
  const isCollapsed = useMemo(() => !hasSelection, [hasSelection]);
  const effectiveSizes = isCollapsed ? [100, 0] : rowSizes;

  useEffect(() => {
    if (!isCollapsed && rowSizes[1] === 0) setRowSizes([65, 35]);
  }, [isCollapsed, rowSizes]);

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
                sashRender={() => (
                  <div className="sashRenderDots">
                    <span />
                  </div>
                )}
                style={{ height: "calc(100vh - 140px)" }}
              >
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
                      />
                    </section>
                  </div>
                </Pane>

                {/* bottom: detail viewer */}
                <Pane minSize={0}>
                  <section className="detail-view">
                    {viewMode === "single" ? (
                      singlePayload ? (
                        <SingleFileComponent jsonData={singlePayload} />
                      ) : hasSelection ? (
                        <div className="muted">
                          This file was added before raw data was cached. Please
                          re-import it to view details.
                        </div>
                      ) : (
                        <div className="muted"></div>
                      )
                    ) : comparePayload ? (
                      <MemoryRouter
                        initialEntries={[
                          { pathname: "/cmp", state: comparePayload },
                        ]}
                      >
                        <Routes>
                          <Route path="/cmp" element={<CompareComponent />} />
                        </Routes>
                      </MemoryRouter>
                    ) : hasSelection ? (
                      <div className="muted">
                        One or both selected files were added before raw data
                        was cached. Please re-import both files to compare.
                      </div>
                    ) : (
                      <div className="muted"></div>
                    )}
                  </section>
                </Pane>
              </SplitPane>
            ) : (
              <div className="muted">
                <h2>
                  <strong>Create a project to begin.</strong>
                </h2>
              </div>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
