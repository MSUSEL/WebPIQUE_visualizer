// project sidebar - allows user to create project and add files
import CIcon from "@coreui/icons-react";
import { cilListRich, cilPlus, cilTrash, cilPencil } from "@coreui/icons";

export type Project = { id: string; name: string };
export type ProjectFileLite = { fileName: string };

export default function ProjectSidebar({
  projects,
  activeProjectId,
  filesByProject,
  onAddProject,
  onSelectProject,
  onRemoveProject,
  onRenameProject,
}: {
  projects: Project[];
  activeProjectId: string | null;
  filesByProject: Record<string, ProjectFileLite[]>;
  onAddProject: () => void;
  onSelectProject: (id: string) => void;
  onLogout?: () => void;
  onRemoveProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
}) {
  return (
    <aside className="w-[250px] min-h-[30vh] border-r border-[#d0d5dd] pt-[20px]">
      <div className="mx-2 flex h-[30px] items-center justify-center text-[22px] font-semibold">
        Project List
      </div>
      <hr className="h-[2px] w-full border-0 bg-[#d0d5dd]" />

      <nav>
        <div className="mt-1.5">
          <div className="flex items-center gap-[10px] rounded-[5px] px-3 py-2 hover:bg-[#f5f5f5]">
            <button
              type="button"
              className="rounded-md p-1.5 hover:bg-[#f5f5f5]"
              aria-label="Projects"
              title="Projects"
            >
              <CIcon className="h-[18px] w-[18px]" icon={cilListRich} />
            </button>

            <span>Project(s)</span>

            <button
              type="button"
              className="ml-auto flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#d0d5dd] bg-white transition duration-150 hover:rotate-90 hover:scale-110 hover:border-[#c7d2fe] hover:bg-[#f8fafc] hover:shadow"
              aria-label="Add project"
              title="Add project"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddProject();
              }}
            >
              <CIcon className="h-[18px] w-[18px]" icon={cilPlus} />
            </button>
          </div>

          <ul className="my-1.5 ml-7 list-disc">
            {projects.length === 0 ? (
              <li className="ml-[-14px] list-none text-[#6b7280]">
                No projects yet
              </li>
            ) : (
              projects.map((p) => {
                const isActive = p.id === activeProjectId;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span
                      className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] px-1 ${isActive
                        ? "border border-[lightgrey] bg-[rgba(96,165,250,0.45)] text-[20px] font-bold"
                        : ""
                        }`}
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

                    <button
                      type="button"
                      aria-label={`Rename ${p.name}`}
                      title="Rename project"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const newName = window.prompt("Rename project", p.name);
                        if (
                          newName &&
                          newName.trim() &&
                          newName.trim() !== p.name
                        ) {
                          onRenameProject(p.id, newName.trim());
                        }
                      }}
                      className="rounded-md p-1.5 hover:bg-[#f5f5f5]"
                    >
                      <CIcon className="h-[18px] w-[18px]" icon={cilPencil} />
                    </button>

                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      title="Remove project"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemoveProject(p.id);
                      }}
                      className="rounded-md p-1.5 hover:bg-[#f5f5f5]"
                    >
                      <CIcon className="h-[18px] w-[18px]" icon={cilTrash} />
                    </button>
                  </li>
                );
              })
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
