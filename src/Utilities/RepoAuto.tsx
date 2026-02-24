export type RepoProvider = "gitlab" | "github";

export type RepoAutoEntry = {
  fileName: string;
  fileMillis: number;
  json: any;
};

export type RepoAutoOptions = {
  provider: RepoProvider;
  repoPath: string;
  baseUrl: string;
  ref: string;
  dir: string;
  token?: string;
  maxFiles?: number;
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

export async function fetchRecentRepoJsonFiles(
  opts: RepoAutoOptions
): Promise<RepoAutoEntry[]> {
  const {
    provider,
    repoPath,
    baseUrl,
    ref,
    dir,
    token,
    maxFiles = 12,
    onProgress,
  } = opts;

  if (provider === "gitlab") {
    const resolved = resolveGitLabInput(repoPath, baseUrl, ref, dir);
    const headers: Record<string, string> = {};
    if (token?.trim()) headers["PRIVATE-TOKEN"] = token.trim();

    const apiBase = `${resolved.host.replace(/\/+$/, "")}/api/v4`;
    const projectId = encodeURIComponent(resolved.projectPath);
    const refEnc = encodeURIComponent(resolved.ref);
    const dirPart = resolved.dirPath
      ? `&path=${encodeURIComponent(resolved.dirPath)}`
      : "";

    const blobs: { name: string; path: string; sha: string }[] = [];
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
        const path = String(it?.path ?? "").trim();
        const name = String(it?.name ?? "").trim();
        const sha = String(it?.id ?? "").trim();
        if (!path || !name || !name.toLowerCase().endsWith(".json")) return;
        blobs.push({ name, path, sha });
      });
      if (pageItems.length < perPage) break;
    }
    if (blobs.length === 0)
      throw new Error("No JSON files found in the target repo directory.");

    onProgress?.(0.2);

    const dated = await Promise.all(
      blobs.map(async (f: { name: string; path: string; sha: string }) => {
        const commitsUrl = `${apiBase}/projects/${projectId}/repository/commits?ref_name=${refEnc}&path=${encodeURIComponent(
          f.path
        )}&per_page=1`;
        const resp = await fetch(commitsUrl, { headers });
        if (!resp.ok) return { ...f, fileMillis: 0 };
        const list = await resp.json();
        const iso = Array.isArray(list) ? list[0]?.committed_date : null;
        const millis = iso ? Date.parse(String(iso)) : 0;
        return { ...f, fileMillis: Number.isFinite(millis) ? millis : 0 };
      })
    );

    const top = dated.sort((a, b) => b.fileMillis - a.fileMillis).slice(0, maxFiles);
    onProgress?.(0.45);

    const out: RepoAutoEntry[] = [];
    for (let i = 0; i < top.length; i += 1) {
      const f = top[i];
      let text = "";
      if (f.sha) {
        const blobUrl = `${apiBase}/projects/${projectId}/repository/blobs/${encodeURIComponent(
          f.sha
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
          f.path
        )}/raw?ref=${refEnc}`;
        const rawResp = await fetch(rawUrl, { headers });
        if (!rawResp.ok) continue;
        text = await rawResp.text();
      }

      try {
        out.push({
          fileName: f.name,
          fileMillis: f.fileMillis || Date.now() - i,
          json: JSON.parse(text),
        });
      } catch {
        // ignore malformed files
      }
    }
    if (out.length === 0) throw new Error("No valid JSON files could be downloaded.");
    return out;
  }

  const resolved = resolveGitHubInput(repoPath, baseUrl, ref, dir);
  const apiBase = resolved.host.includes("api.github.com")
    ? resolved.host.replace(/\/+$/, "")
    : "https://api.github.com";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;

  const repoFull = `${encodeURIComponent(resolved.owner)}/${encodeURIComponent(
    resolved.repo
  )}`;
  const contentsPath = resolved.dirPath
    ? `${resolved.dirPath}/`
    : "";
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
  const files: { name: string; path: string; sha: string }[] = treeItems
    .filter(
      (it: any) =>
        String(it?.type ?? "") === "blob" &&
        String(it?.path ?? "").toLowerCase().endsWith(".json") &&
        (!contentsPath ||
          String(it?.path ?? "").startsWith(contentsPath))
    )
    .map((it: any) => ({
      name: String(it.path ?? "").split("/").pop() ?? "",
      path: String(it.path ?? ""),
      sha: String(it.sha ?? ""),
    }));
  if (files.length === 0)
    throw new Error("No JSON files found in the target repo directory.");

  onProgress?.(0.2);

  const dated = await Promise.all(
    files.map(async (f: { name: string; path: string; sha: string }) => {
      const commitsUrl = `${apiBase}/repos/${repoFull}/commits?sha=${refEnc}&path=${encodeURIComponent(
        f.path
      )}&per_page=1`;
      const resp = await fetch(commitsUrl, { headers });
      if (!resp.ok) return { ...f, fileMillis: 0 };
      const list = await resp.json();
      const iso = Array.isArray(list)
        ? list[0]?.commit?.committer?.date ?? list[0]?.commit?.author?.date
        : null;
      const millis = iso ? Date.parse(String(iso)) : 0;
      return { ...f, fileMillis: Number.isFinite(millis) ? millis : 0 };
    })
  );

  const top = dated.sort((a, b) => b.fileMillis - a.fileMillis).slice(0, maxFiles);
  onProgress?.(0.45);

  const out: RepoAutoEntry[] = [];
  for (let i = 0; i < top.length; i += 1) {
    const f = top[i];
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
        fileName: f.name,
        fileMillis: f.fileMillis || Date.now() - i,
        json: JSON.parse(text),
      });
    } catch {
      // ignore malformed files
    }
  }
  if (out.length === 0) throw new Error("No valid JSON files could be downloaded.");
  return out;
}
