import type { RepoProvider } from "./RepoAuto";

type ProjectFileMetadata = {
  fileName?: string;
  fileDateISO: string;
  sourceProvider?: RepoProvider | "local";
  sourceRef?: string;
  sourcePath?: string;
  sourceDetails?: string;
};

export const formatSourceProviderLabel = (
  provider?: RepoProvider | "local"
): string => {
  if (provider === "gitlab") return "GitLab Repo";
  if (provider === "github") return "GitHub Repo";
  if (provider === "gitlab-artifacts") return "GitLab Build Artifact";
  if (provider === "local") return "Local File";
  return "";
};

export const buildProjectFileMetadataLines = (
  file: ProjectFileMetadata
): string[] => {
  const lines: string[] = [];
  const fileNameLabel = String(file.fileName ?? "").trim();
  const sourceLabel = file.sourceProvider
    ? formatSourceProviderLabel(file.sourceProvider)
    : "";
  const refLabel = String(file.sourceRef ?? "").trim();
  const pathLabel = String(file.sourcePath ?? "").trim();
  const detailsLabel = String(file.sourceDetails ?? "").trim();

  if (sourceLabel || refLabel) {
    lines.push(
      [sourceLabel, refLabel ? `Branch: ${refLabel}` : ""].filter(Boolean).join(" | ")
    );
  }

  if (pathLabel && pathLabel !== fileNameLabel) lines.push(pathLabel);
  if (
    detailsLabel &&
    detailsLabel !== fileNameLabel &&
    detailsLabel !== refLabel &&
    detailsLabel !== pathLabel
  ) {
    lines.push(detailsLabel);
  }

  if (!detailsLabel || detailsLabel === refLabel) {
    lines.push(new Date(file.fileDateISO).toLocaleString());
  }
  return lines;
};

export const buildProjectFileMetadataTitle = (
  fileName: string,
  file: ProjectFileMetadata
) =>
  [fileName, ...buildProjectFileMetadataLines({ ...file, fileName })].join("\n");
