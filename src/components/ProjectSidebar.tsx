// project sidebar
// src/components/ProjectSidebar.tsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import CIcon from '@coreui/icons-react';
import {
    cilListRich,
    cilAccountLogout,
    cilPlus,
    cilChevronBottom,
    cilChevronRight,
    cilCheckAlt,
    cilX,
} from '@coreui/icons';
import "../styles/ProjectSidebar.css";

type Project = { id: string; name: string };

export default function ProjectSidebar({ onLogout }: { onLogout?: () => void }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [expanded, setExpanded] = useState(true);
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    // load/save to localStorage
    useEffect(() => {
        const saved = localStorage.getItem("wp_projects");
        if (saved) setProjects(JSON.parse(saved));
    }, []);
    useEffect(() => {
        localStorage.setItem("wp_projects", JSON.stringify(projects));
    }, [projects]);

    function addProject() {
        const name = newName.trim();
        if (!name) return;
        const id = (globalThis.crypto?.randomUUID?.() ?? `p_${Date.now()}`);
        setProjects(prev => [...prev, { id, name }]);
        setNewName("");
        setShowNew(false);
        setExpanded(true);
    }

    function cancelAdd() {
        setShowNew(false);
        setNewName("");
    }

    function startRename(p: Project) {
        setEditingId(p.id);
        setEditName(p.name);
    }

    function commitRename() {
        const name = editName.trim();
        if (!name) { cancelRename(); return; }
        setProjects(prev => prev.map(pr => pr.id === editingId ? { ...pr, name } : pr));
        setEditingId(null);
        setEditName("");
    }

    function cancelRename() {
        setEditingId(null);
        setEditName("");
    }

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
                            aria-label={expanded ? "Collapse projects" : "Expand projects"}
                            title={expanded ? "Collapse" : "Expand"}
                        >
                            <CIcon className='icon' icon={cilListRich} />
                        </button>

                        <span>Project(s)</span>

                        <button
                            type="button"
                            className="add-btn"
                            aria-label="Add project"
                            aria-expanded={showNew}
                            onClick={() => setShowNew(v => !v)}
                            title="Add project"
                        >
                            <CIcon className="icon" icon={cilPlus} />
                        </button>
                    </div>

                    {showNew && (
                        <div className="new-project">
                            <input
                                type="text"
                                placeholder="Project name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") addProject();
                                    if (e.key === "Escape") cancelAdd();
                                }}
                                autoFocus
                            />
                            <button
                                className="icon-btn"
                                onClick={addProject}
                                disabled={!newName.trim()}
                                aria-label="Create project"
                                title="Create"
                            >
                            </button>
                            <button
                                className="icon-btn"
                                onClick={cancelAdd}
                                aria-label="Cancel"
                                title="Cancel"
                            >
                            </button>
                        </div>
                    )}


                    <ul className="group-list">
                        {projects.length === 0 ? (
                            <li className="muted">No projects yet</li>
                        ) : (
                            projects.map(p => (
                                <li key={p.id} className={editingId === p.id ? "editing" : ""}>
                                    {editingId === p.id ? (
                                        <input
                                            className="rename-input"
                                            value={editName}
                                            autoFocus
                                            onChange={(e) => setEditName(e.target.value)}
                                            onBlur={commitRename}                   // click away = save
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") commitRename(); // Enter = save
                                                if (e.key === "Escape") {              // Esc = cancel
                                                    e.currentTarget.blur();
                                                    cancelRename();
                                                }
                                            }}
                                        />
                                    ) : (
                                        <span
                                            className="project-name"
                                            role="button"
                                            tabIndex={0}
                                            title="Click to rename"
                                            onClick={() => startRename(p)}           // single click = edit
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") startRename(p);
                                            }}
                                        >
                                            {p.name}
                                        </span>
                                    )}
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                <NavLink to="/" className="item logout-link" onClick={onLogout}>
                    <CIcon className="icon" icon={cilAccountLogout} /> Logout
                </NavLink>
            </nav>
        </aside>
    );
}
