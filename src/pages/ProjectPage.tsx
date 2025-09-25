// project page
import React, { useEffect, useMemo, useState } from "react";
import Header from "../components/headerfooter/Header";
import Footer from "../components/headerfooter/Footer";
import ProjectSidebar, {
  Project,
} from "../components/projectPage/ProjectSidebar";
import ProjectFileLoad, {
  ProjectFileScore,
} from "../components/projectPage/ProjectFileLoad";
import TQIQAPlot from "../components/plotting/TQIQAPlot";
import CreateProjectDialog from "../components/projectPage/CreateProjectDialog";
import "../styles/Pages.css";

export default function ProjectView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filesByProject, setFilesByProject] = useState<
    Record<string, ProjectFileScore[]>
  >({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // load/save projects
  useEffect(() => {
    const p = localStorage.getItem("wp_projects");
    if (p) setProjects(JSON.parse(p));
  }, []);
  useEffect(() => {
    localStorage.setItem("wp_projects", JSON.stringify(projects));
  }, [projects]);

  const activeFiles = useMemo(
    () => (activeProjectId ? filesByProject[activeProjectId] ?? [] : []),
    [activeProjectId, filesByProject]
  );

  function handleCreateProject(name: string, files: ProjectFileScore[]) {
    const id = crypto.randomUUID();
    const proj: Project = { id, name };
    setProjects((prev) => [...prev, proj]);
    setFilesByProject((prev) => ({ ...prev, [id]: files.slice(0, 12) }));
    setActiveProjectId(id);
  }

  return (
    <div className="app-container">
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
          />

          <CreateProjectDialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreate={handleCreateProject}
          />

          <main className="project-main">
            {activeProjectId ? (
              <div className="grid grid-cols-2 gap-6">
                <section>
                  <header className="st-section-hdr">
                    <h2>
                      TQI & Quality Aspect Score Tracker for{" "}
                      {projects.find((p) => p.id === activeProjectId)?.name}
                    </h2>
                  </header>
                  <TQIQAPlot files={activeFiles} />
                </section>

                <section>
                  <ProjectFileLoad
                    projectId={activeProjectId}
                    onScores={(pid, scores) =>
                      setFilesByProject((prev) => ({ ...prev, [pid]: scores }))
                    }
                  />
                </section>
              </div>
            ) : (
              <p className="muted">Select a project to begin.</p>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
