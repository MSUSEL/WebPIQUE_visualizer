// project sidebar - allows user to create project and add files
import CIcon from "@coreui/icons-react";
import { cilListRich, cilAccountLogout, cilPlus } from "@coreui/icons";
import "../styles/ProjectSidebar.css";

export type Project = { id: string; name: string };
export type ProjectFileLite = { fileName: string };

export default function ProjectSidebar({
  projects,
  activeProjectId,
  filesByProject,
  onAddProject,
  onSelectProject,
  onLogout,
}: {
  projects: Project[];
  activeProjectId: string | null;
  filesByProject: Record<string, ProjectFileLite[]>;
  onAddProject: () => void;
  onSelectProject: (id: string) => void;
  onLogout?: () => void;
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
                console.log("open dialog");
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
                  >
                    {p.name}
                  </span>

                  {filesByProject?.[p.id]?.length ? (
                    <ul className="group-list nested">
                      {filesByProject[p.id].map((f) => (
                        <li key={`${p.id}::${f.fileName}`} className="muted">
                          • {f.fileName}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>

        <button className="item logout-link" onClick={onLogout}>
          <CIcon className="icon" icon={cilAccountLogout} /> Logout
        </button>
      </nav>
    </aside>
  );
}
