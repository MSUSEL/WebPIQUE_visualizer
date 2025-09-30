// project sidebar - allows user to create project and add files
import CIcon from "@coreui/icons-react";
import { cilListRich, cilPlus, cilTrash } from "@coreui/icons";
import "../../styles/ProjectSidebar.css";

export type Project = { id: string; name: string };
export type ProjectFileLite = { fileName: string };

export default function ProjectSidebar({
  projects,
  activeProjectId,
  filesByProject,
  onAddProject,
  onSelectProject,
  onRemoveProject,
}: {
  projects: Project[];
  activeProjectId: string | null;
  filesByProject: Record<string, ProjectFileLite[]>;
  onAddProject: () => void;
  onSelectProject: (id: string) => void;
  onLogout?: () => void;
  onRemoveProject: (id: string) => void;
}) {
  return (
    <aside className="simple-sidebar">
      <div className="brand">WebPIQUE Project Visualizer</div>
      <hr className="horizontal-line" />

      <nav>
        <div className="group">
          <div className="group-title">
            <button
              type="button"
              className="icon-btn caret"
              aria-label="Projects"
              title="Projects"
            >
              <CIcon className="icon" icon={cilListRich} />
            </button>

            <span>Project(s)</span>

            <button
              type="button"
              className="add-btn"
              aria-label="Add project"
              title="Add project"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddProject();
              }}
            >
              <CIcon className="icon" icon={cilPlus} />
            </button>
          </div>

          <ul className="group-list">
            {projects.length === 0 ? (
              <li className="muted">No projects yet</li>
            ) : (
              projects.map((p) => (
                <li
                  key={p.id}
                  className={p.id === activeProjectId ? "active" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    className="project-name"
                    role="button"
                    tabIndex={0}
                    title="Single-click to select"
                    onClick={() => onSelectProject(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSelectProject(p.id);
                    }}
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name}
                  </span>

                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    title="Remove project"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemoveProject(p.id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: 2,
                      borderRadius: 6,
                    }}
                  >
                    <CIcon className="icon" icon={cilTrash} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        {/*
        <button
          className="item logout-link"
          onClick={() => {
            navigate("/"); // go to LandingPage ("/")
          }}
        >
          <CIcon className="icon" icon={cilAccountLogout} /> Home
        </button>
        */}
      </nav>
    </aside>
  );
}
