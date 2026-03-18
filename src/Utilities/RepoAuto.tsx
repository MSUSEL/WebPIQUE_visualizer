export type RepoProvider = "gitlab" | "github" | "gitlab-artifacts";

export type RepoAutoEntry = {
  fileName: string;
  fileMillis: number;
  json: any;
};

export type RepoAutoCandidate = {
  id: string;
  fileName: string;
  filePath: string;
  fileMillis: number;
  details?: string;
};

export type RepoAutoOptions = {
  provider: RepoProvider;
  repoPath: string;
  baseUrl: string;
  ref: string;
  dir: string;
  token?: string;
  maxFiles?: number;
  artifactJob?: string;
  selectedIds?: string[];
  onProgress?: (value: number) => void;
};

type GitLabResolved = {
  host: string;
  projectPath: string;
  ref: string;
  dirPath: string;
};

type GitHubResolved = {
  host: string;
  owner: string;
  repo: string;
  ref: string;
  dirPath: string;
};

type RemoteFile = {
  id: string;
  fileName: string;
  filePath: string;
  fileMillis: number;
  details?: string;
  sha?: string;
  artifactJob?: string;
  artifactPath?: string;
  artifactJobId?: number;
};

const cleanPath = (s: string) =>
  s
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

const decodeBase64Utf8 = (b64: string): string => {
  const normalized = String(b64 ?? "").replace(/\s+/g, "");
  if (!normalized) return "";
  try {
    const bin = atob(normalized);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
};

const toFileId = (provider: RepoProvider, path: string, sha?: string) =>
  `${provider}:${path}:${sha ?? ""}`;

const resolveGitLabInput = (
  repoPathInput: string,
  baseUrlInput: string,
  refInput: string,
  dirInput: string
): GitLabResolved => {
  const fallbackHost = (baseUrlInput || "https://gitlab.com").replace(/\/+$/, "");
  const fallbackRef = refInput.trim() || "main";
  const fallbackDir = cleanPath(dirInput);
  const raw = repoPathInput.trim();
  if (!raw) throw new Error("Repository path is required.");

  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw);
    const host = `${u.protocol}//${u.host}`;
    const segs = u.pathname
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean);
    const dashIdx = segs.findIndex((s) => s === "-");
    const treeIdx = segs.findIndex((s, i) => i > dashIdx && s === "tree");

    if (dashIdx >= 0 && treeIdx >= 0 && treeIdx + 1 < segs.length) {
      const projectPath = cleanPath(segs.slice(0, dashIdx).join("/"));
      const refFromUrl = segs[treeIdx + 1] ?? "";
      const dirFromUrl = cleanPath(segs.slice(treeIdx + 2).join("/"));
      return {
        host,
        projectPath,
        ref: refInput.trim() || refFromUrl || "main",
        dirPath: fallbackDir || dirFromUrl,
      };
    }

    if (dashIdx >= 0) {
      const projectPath = cleanPath(segs.slice(0, dashIdx).join("/"));
      const artifactsIdx = segs.findIndex((s, i) => i > dashIdx && s === "artifacts");
      const mode =
        artifactsIdx >= 0 && artifactsIdx + 1 < segs.length
          ? segs[artifactsIdx + 1]
          : "";
      const dirFromArtifacts =
        artifactsIdx >= 0 &&
        (mode === "browse" || mode === "file" || mode === "raw") &&
        artifactsIdx + 2 < segs.length
          ? cleanPath(segs.slice(artifactsIdx + 2).join("/"))
          : "";

      return {
        host,
        projectPath,
        ref: fallbackRef,
        dirPath: fallbackDir || dirFromArtifacts,
      };
    }

    return {
      host,
      projectPath: cleanPath(u.pathname),
      ref: fallbackRef,
      dirPath: fallbackDir,
    };
  }

  return {
    host: fallbackHost,
    projectPath: cleanPath(raw),
    ref: fallbackRef,
    dirPath: fallbackDir,
  };
};

const resolveGitHubInput = (
  repoPathInput: string,
  baseUrlInput: string,
  refInput: string,
  dirInput: string
): GitHubResolved => {
  const fallbackHost = (baseUrlInput || "https://api.github.com").replace(
    /\/+$/,
    ""
  );
  const fallbackRef = refInput.trim() || "main";
  const fallbackDir = cleanPath(dirInput);
  const raw = repoPathInput.trim();
  if (!raw) throw new Error("Repository path is required.");

  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw);
    const siteHost = `${u.protocol}//${u.host}`;
    const segs = u.pathname
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean);
    if (segs.length < 2) throw new Error("GitHub URL must include owner/repo.");

    const owner = segs[0];
    const repo = segs[1];
    const branchIdx = segs.findIndex((s) => s === "tree");
    const refFromUrl =
      branchIdx >= 0 && branchIdx + 1 < segs.length ? segs[branchIdx + 1] : "";
    const dirFromUrl =
      branchIdx >= 0 && branchIdx + 2 < segs.length
        ? cleanPath(segs.slice(branchIdx + 2).join("/"))
        : "";

    return {
      host: u.host.includes("api.github.com")
        ? siteHost
        : fallbackHost || "https://api.github.com",
      owner,
      repo,
      ref: refInput.trim() || refFromUrl || fallbackRef,
      dirPath: fallbackDir || dirFromUrl,
    };
  }

  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Use GitHub path format: owner/repo");
  return {
    host: fallbackHost,
    owner: parts[0],
    repo: parts[1],
    ref: fallbackRef,
    dirPath: fallbackDir,
  };
};

async function listGitLabRepoFiles(opts: RepoAutoOptions): Promise<RemoteFile[]> {
  const resolved = resolveGitLabInput(
    opts.repoPath,
    opts.baseUrl,
    opts.ref,
    opts.dir
  );
  const headers: Record<string, string> = {};
  if (opts.token?.trim()) headers["PRIVATE-TOKEN"] = opts.token.trim();

  const apiBase = `${resolved.host.replace(/\/+$/, "")}/api/v4`;
  const projectId = encodeURIComponent(resolved.projectPath);
  const refEnc = encodeURIComponent(resolved.ref);
  const dirPart = resolved.dirPath
    ? `&path=${encodeURIComponent(resolved.dirPath)}`
    : "";

  const blobs: { fileName: string; filePath: string; sha: string }[] = [];
  const perPage = 100;
  const maxPages = 5;
  for (let page = 1; page <= maxPages; page += 1) {
    const treeUrl = `${apiBase}/projects/${projectId}/repository/tree?ref=${refEnc}${dirPart}&recursive=true&per_page=${perPage}&page=${page}`;
    const treeResp = await fetch(treeUrl, { headers });
    if (!treeResp.ok) {
      throw new Error(
        `GitLab tree request failed (${treeResp.status}). Check repo path, ref, token, and access.`
      );
    }
    const pageItems = await treeResp.json();
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;
    pageItems.forEach((it: any) => {
      if (it?.type !== "blob") return;
      const filePath = String(it?.path ?? "").trim();
      const fileName = String(it?.name ?? "").trim();
      const sha = String(it?.id ?? "").trim();
      if (!filePath || !fileName || !fileName.toLowerCase().endsWith(".json")) return;
      blobs.push({ fileName, filePath, sha });
    });
    if (pageItems.length < perPage) break;
  }
  if (blobs.length === 0) {
    throw new Error("No JSON files found in the target repo directory.");
  }

  const dated = await Promise.all(
    blobs.map(async (f) => {
      const commitsUrl = `${apiBase}/projects/${projectId}/repository/commits?ref_name=${refEnc}&path=${encodeURIComponent(
        f.filePath
      )}&per_page=1`;
      const resp = await fetch(commitsUrl, { headers });
      if (!resp.ok) {
        return {
          ...f,
          id: toFileId(opts.provider, f.filePath, f.sha),
          fileMillis: 0,
        };
      }
      const list = await resp.json();
      const iso = Array.isArray(list) ? list[0]?.committed_date : null;
      const millis = iso ? Date.parse(String(iso)) : 0;
      return {
        ...f,
        id: toFileId(opts.provider, f.filePath, f.sha),
        fileMillis: Number.isFinite(millis) ? millis : 0,
      };
    })
  );

  return dated.sort((a, b) => b.fileMillis - a.fileMillis);
}

async function listGitHubRepoFiles(opts: RepoAutoOptions): Promise<RemoteFile[]> {
  const resolved = resolveGitHubInput(
    opts.repoPath,
    opts.baseUrl,
    opts.ref,
    opts.dir
  );
  const apiBase = resolved.host.includes("api.github.com")
    ? resolved.host.replace(/\/+$/, "")
    : "https://api.github.com";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (opts.token?.trim()) headers.Authorization = `Bearer ${opts.token.trim()}`;

  const repoFull = `${encodeURIComponent(resolved.owner)}/${encodeURIComponent(
    resolved.repo
  )}`;
  const contentsPath = resolved.dirPath ? `${resolved.dirPath}/` : "";
  const refEnc = encodeURIComponent(resolved.ref);
  const treeUrl = `${apiBase}/repos/${repoFull}/git/trees/${refEnc}?recursive=1`;
  const treeResp = await fetch(treeUrl, { headers });
  if (!treeResp.ok) {
    throw new Error(
      `GitHub tree request failed (${treeResp.status}). Check repo path, ref, token, and access.`
    );
  }
  const treeObj = await treeResp.json();
  const treeItems = Array.isArray(treeObj?.tree) ? treeObj.tree : [];
  const files: { fileName: string; filePath: string; sha: string }[] = treeItems
    .filter(
      (it: any) =>
        String(it?.type ?? "") === "blob" &&
        String(it?.path ?? "").toLowerCase().endsWith(".json") &&
        (!contentsPath || String(it?.path ?? "").startsWith(contentsPath))
    )
    .map((it: any) => ({
      fileName: String(it.path ?? "").split("/").pop() ?? "",
      filePath: String(it.path ?? ""),
      sha: String(it.sha ?? ""),
    }));
  if (files.length === 0) {
    throw new Error("No JSON files found in the target repo directory.");
  }

  const dated = await Promise.all(
    files.map(async (f) => {
      const commitsUrl = `${apiBase}/repos/${repoFull}/commits?sha=${refEnc}&path=${encodeURIComponent(
        f.filePath
      )}&per_page=1`;
      const resp = await fetch(commitsUrl, { headers });
      if (!resp.ok) {
        return {
          ...f,
          id: toFileId(opts.provider, f.filePath, f.sha),
          fileMillis: 0,
        };
      }
      const list = await resp.json();
      const iso = Array.isArray(list)
        ? list[0]?.commit?.committer?.date ?? list[0]?.commit?.author?.date
        : null;
      const millis = iso ? Date.parse(String(iso)) : 0;
      return {
        ...f,
        id: toFileId(opts.provider, f.filePath, f.sha),
        fileMillis: Number.isFinite(millis) ? millis : 0,
      };
    })
  );

  return dated.sort((a, b) => b.fileMillis - a.fileMillis);
}

async function listGitLabArtifactFiles(
  opts: RepoAutoOptions
): Promise<RemoteFile[]> {
  const resolved = resolveGitLabInput(
    opts.repoPath,
    opts.baseUrl,
    opts.ref,
    opts.dir
  );
  const headers: Record<string, string> = {};
  if (opts.token?.trim()) headers["PRIVATE-TOKEN"] = opts.token.trim();

  const apiBase = `${resolved.host.replace(/\/+$/, "")}/api/v4`;
  const projectId = encodeURIComponent(resolved.projectPath);
  const refEnc = encodeURIComponent(resolved.ref);

  const pipelinesUrl = `${apiBase}/projects/${projectId}/pipelines?status=success&ref=${refEnc}&per_page=20`;
  const pipelinesResp = await fetch(pipelinesUrl, { headers });
  if (!pipelinesResp.ok) {
    throw new Error(
      `GitLab pipelines request failed (${pipelinesResp.status}). Check repo path, ref, token, and access.`
    );
  }
  const pipelinesJson = await pipelinesResp.json();
  const pipelines = Array.isArray(pipelinesJson) ? pipelinesJson : [];
  if (pipelines.length === 0) {
    throw new Error(
      `No successful GitLab pipelines were found for ref "${resolved.ref}".`
    );
  }

  const browseJobPath = async (
    job: any,
    pipeline: any,
    path: string
  ): Promise<RemoteFile[]> => {
    const artifactJob = String(job?.name ?? "").trim();
    const artifactJobId = Number(job?.id);
    if (!artifactJob) return [];
    const jobMillisRaw = Date.parse(
      String(job?.finished_at ?? job?.created_at ?? job?.started_at ?? 0)
    );
    const jobMillis = Number.isFinite(jobMillisRaw) ? jobMillisRaw : 0;
    if (!Number.isFinite(artifactJobId)) return [];

    const treePathQuery = path ? `&path=${encodeURIComponent(path)}` : "";
    const treeUrl = `${apiBase}/projects/${projectId}/jobs/${artifactJobId}/artifacts/tree?recursive=true${treePathQuery}`;
    let items: any[] = [];
    const treeResp = await fetch(treeUrl, { headers });
    if (treeResp.ok) {
      const treeJson = await treeResp.json();
      items = Array.isArray(treeJson) ? treeJson : [];
    } else {
      const pathQuery = path ? `&path=${encodeURIComponent(path)}` : "";
      const browseUrl = `${apiBase}/projects/${projectId}/jobs/artifacts/${refEnc}/browse?job=${encodeURIComponent(
        artifactJob
      )}${pathQuery}`;
      const browseResp = await fetch(browseUrl, { headers });
      if (!browseResp.ok) {
        throw new Error(
          `GitLab artifact browse request failed (${browseResp.status}). Check ref, token, and access.`
        );
      }
      const browseJson = await browseResp.json();
      items = Array.isArray(browseJson) ? browseJson : [];
    }
    if (!Array.isArray(items)) return [];

    const nested = await Promise.all(
      items.map(async (item: any) => {
        const itemPath = cleanPath(String(item?.path ?? ""));
        const fileName =
          String(item?.name ?? "").trim() || itemPath.split("/").pop() || "";
        const itemType = String(item?.type ?? "").toLowerCase();
        if (!itemPath) return [];
        if (
          !treeResp.ok &&
          (itemType === "directory" || itemType === "tree" || itemType === "dir")
        ) {
          return browseJobPath(job, pipeline, itemPath);
        }
        if (!fileName.toLowerCase().endsWith(".json")) return [];
        const modifiedRaw = Date.parse(
          String(
            item?.modified_at ??
              item?.updated_at ??
              item?.commit?.committed_date ??
              job?.finished_at ??
              job?.created_at ??
              0
          )
        );
        const fileMillis = Number.isFinite(modifiedRaw) ? modifiedRaw : jobMillis;
        const refLabel = String(pipeline?.ref ?? job?.ref ?? resolved.ref).trim();
        const shortSha = String(pipeline?.sha ?? job?.commit?.id ?? "")
          .trim()
          .slice(0, 8);
        const dateLabel = fileMillis
          ? new Date(fileMillis).toLocaleString()
          : "Unknown date";
        return [
          {
            id: `${toFileId(opts.provider, itemPath)}:${artifactJob}`,
            fileName,
            filePath: `${artifactJob} | ${itemPath}`,
            fileMillis,
            details: `${refLabel || "unknown-ref"} : ${shortSha || "unknown-sha"} : ${dateLabel}`,
            artifactJob,
            artifactPath: itemPath,
            artifactJobId,
          },
        ];
      })
    );

    return nested.flat();
  };

  const nestedJobs = await Promise.all(
    pipelines.map(async (pipeline: any) => {
      const pipelineId = Number(pipeline?.id);
      if (!Number.isFinite(pipelineId)) return [];
      const jobsUrl = `${apiBase}/projects/${projectId}/pipelines/${pipelineId}/jobs?scope[]=success&per_page=100`;
      const jobsResp = await fetch(jobsUrl, { headers });
      if (!jobsResp.ok) return [];
      const jobsJson = await jobsResp.json();
      const jobs = Array.isArray(jobsJson) ? jobsJson : [];
      return jobs
        .filter(
          (job: any) =>
            (job?.artifacts_file?.filename || job?.artifacts?.length) &&
            String(job?.status ?? "").toLowerCase() === "success"
        )
        .map((job: any) => ({ job, pipeline }));
    })
  );
  const nestedFiles = await Promise.all(
    nestedJobs
      .flat()
      .map(({ job, pipeline }) => browseJobPath(job, pipeline, resolved.dirPath))
  );
  const files = nestedFiles.flat();
  if (files.length === 0) {
    throw new Error("No JSON files were found in the selected GitLab build artifacts.");
  }
  return files.sort((a, b) => b.fileMillis - a.fileMillis);
}

async function listRemoteFiles(opts: RepoAutoOptions): Promise<RemoteFile[]> {
  if (opts.provider === "gitlab") return listGitLabRepoFiles(opts);
  if (opts.provider === "github") return listGitHubRepoFiles(opts);
  return listGitLabArtifactFiles(opts);
}

export async function listRecentRepoJsonFiles(
  opts: RepoAutoOptions
): Promise<RepoAutoCandidate[]> {
  const maxFiles = opts.maxFiles ?? 12;
  const files = await listRemoteFiles(opts);
  return files.slice(0, maxFiles).map((f) => ({
    id: f.id,
    fileName: f.fileName,
    filePath: f.filePath,
    fileMillis: f.fileMillis,
    details: f.details,
  }));
}

export async function fetchSelectedRepoJsonFiles(
  opts: RepoAutoOptions
): Promise<RepoAutoEntry[]> {
  const maxFiles = opts.maxFiles ?? 12;
  const selectedSet = new Set((opts.selectedIds ?? []).filter(Boolean));
  const candidates = await listRemoteFiles(opts);
  const targetFiles =
    selectedSet.size > 0
      ? candidates.filter((f) => selectedSet.has(f.id)).slice(0, maxFiles)
      : candidates.slice(0, maxFiles);

  if (targetFiles.length === 0) {
    throw new Error("No files were selected for download.");
  }

  opts.onProgress?.(0.25);

  if (opts.provider === "gitlab") {
    const resolved = resolveGitLabInput(
      opts.repoPath,
      opts.baseUrl,
      opts.ref,
      opts.dir
    );
    const headers: Record<string, string> = {};
    if (opts.token?.trim()) headers["PRIVATE-TOKEN"] = opts.token.trim();
    const apiBase = `${resolved.host.replace(/\/+$/, "")}/api/v4`;
    const projectId = encodeURIComponent(resolved.projectPath);
    const refEnc = encodeURIComponent(resolved.ref);

    const out: RepoAutoEntry[] = [];
    for (let i = 0; i < targetFiles.length; i += 1) {
      const f = targetFiles[i];
      let text = "";
      const sha = String(f.sha ?? "").trim();
      if (sha) {
        const blobUrl = `${apiBase}/projects/${projectId}/repository/blobs/${encodeURIComponent(
          sha
        )}`;
        const blobResp = await fetch(blobUrl, { headers });
        if (blobResp.ok) {
          try {
            const blobMeta = await blobResp.json();
            const enc = String((blobMeta as any)?.encoding ?? "").toLowerCase();
            const content = String((blobMeta as any)?.content ?? "");
            if (enc === "base64" && content) text = decodeBase64Utf8(content);
          } catch {
            text = "";
          }
        }
      }

      if (!text) {
        const rawUrl = `${apiBase}/projects/${projectId}/repository/files/${encodeURIComponent(
          f.filePath
        )}/raw?ref=${refEnc}`;
        const rawResp = await fetch(rawUrl, { headers });
        if (!rawResp.ok) continue;
        text = await rawResp.text();
      }

      try {
        out.push({
          fileName: f.fileName,
          fileMillis: f.fileMillis || Date.now() - i,
          json: JSON.parse(text),
        });
      } catch {
        // ignore malformed files
      }
      opts.onProgress?.(0.25 + ((i + 1) / targetFiles.length) * 0.75);
    }
    if (out.length === 0) {
      throw new Error("No valid JSON files could be downloaded.");
    }
    return out;
  }

  if (opts.provider === "github") {
    const resolved = resolveGitHubInput(
      opts.repoPath,
      opts.baseUrl,
      opts.ref,
      opts.dir
    );
    const apiBase = resolved.host.includes("api.github.com")
      ? resolved.host.replace(/\/+$/, "")
      : "https://api.github.com";
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (opts.token?.trim()) headers.Authorization = `Bearer ${opts.token.trim()}`;

    const repoFull = `${encodeURIComponent(resolved.owner)}/${encodeURIComponent(
      resolved.repo
    )}`;
    const out: RepoAutoEntry[] = [];
    for (let i = 0; i < targetFiles.length; i += 1) {
      const f = targetFiles[i];
      const blobUrl = `${apiBase}/repos/${repoFull}/git/blobs/${encodeURIComponent(
        String(f.sha ?? "")
      )}`;
      const blobResp = await fetch(blobUrl, { headers });
      if (!blobResp.ok) continue;
      let text = "";
      try {
        const meta = await blobResp.json();
        const enc = String((meta as any)?.encoding ?? "").toLowerCase();
        const content = String((meta as any)?.content ?? "");
        if (enc === "base64" && content) text = decodeBase64Utf8(content);
      } catch {
        text = "";
      }
      if (!text) continue;
      try {
        out.push({
          fileName: f.fileName,
          fileMillis: f.fileMillis || Date.now() - i,
          json: JSON.parse(text),
        });
      } catch {
        // ignore malformed files
      }
      opts.onProgress?.(0.25 + ((i + 1) / targetFiles.length) * 0.75);
    }
    if (out.length === 0) {
      throw new Error("No valid JSON files could be downloaded.");
    }
    return out;
  }

  const resolved = resolveGitLabInput(opts.repoPath, opts.baseUrl, opts.ref, opts.dir);
  const headers: Record<string, string> = {};
  if (opts.token?.trim()) headers["PRIVATE-TOKEN"] = opts.token.trim();
  const apiBase = `${resolved.host.replace(/\/+$/, "")}/api/v4`;
  const projectId = encodeURIComponent(resolved.projectPath);
  const refEnc = encodeURIComponent(resolved.ref);

  const out: RepoAutoEntry[] = [];
  for (let i = 0; i < targetFiles.length; i += 1) {
    const f = targetFiles[i];
    const artifactPath = String(f.artifactPath ?? f.filePath).trim();
    const artifactJobId = Number(f.artifactJobId);
    if (!artifactPath || !Number.isFinite(artifactJobId)) continue;
    const rawPath = artifactPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const rawUrl = `${apiBase}/projects/${projectId}/jobs/${artifactJobId}/artifacts/${rawPath}`;
    const resp = await fetch(rawUrl, { headers });
    if (!resp.ok) continue;
    const text = await resp.text();
    try {
      out.push({
        fileName: f.fileName,
        fileMillis: f.fileMillis || Date.now() - i,
        json: JSON.parse(text),
      });
    } catch {
      // ignore malformed files
    }
    opts.onProgress?.(0.25 + ((i + 1) / targetFiles.length) * 0.75);
  }
  if (out.length === 0) {
    throw new Error("No valid JSON files could be downloaded.");
  }
  return out;
}

export async function fetchRecentRepoJsonFiles(
  opts: RepoAutoOptions
): Promise<RepoAutoEntry[]> {
  return fetchSelectedRepoJsonFiles(opts);
}
