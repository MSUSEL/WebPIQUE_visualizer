import { afterEach, describe, expect, test, vi } from "vitest";
import { listRecentRepoJsonFiles } from "./RepoAuto";

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function jsonResponse(body: any, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe("RepoAuto", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("blank GitLab branch loads recent files across branches", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/projects/group%2Frepo")) {
        return jsonResponse({ id: 77 });
      }
      if (url.includes("/repository/branches?")) {
        return jsonResponse([{ name: "main" }, { name: "dev" }]);
      }
      if (url.includes("/repository/tree?ref=main")) {
        return jsonResponse([
          {
            type: "blob",
            path: "reports/main_evalResults.json",
            name: "main_evalResults.json",
            id: "sha-main",
          },
        ]);
      }
      if (url.includes("/repository/tree?ref=dev")) {
        return jsonResponse([
          {
            type: "blob",
            path: "reports/dev_evalResults.json",
            name: "dev_evalResults.json",
            id: "sha-dev",
          },
        ]);
      }
      if (
        url.includes("/repository/commits?ref_name=main") &&
        url.includes("reports%2Fmain_evalResults.json")
      ) {
        return jsonResponse([{ committed_date: "2026-04-01T00:00:00.000Z" }]);
      }
      if (
        url.includes("/repository/commits?ref_name=dev") &&
        url.includes("reports%2Fdev_evalResults.json")
      ) {
        return jsonResponse([{ committed_date: "2026-04-05T00:00:00.000Z" }]);
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const files = await listRecentRepoJsonFiles({
      provider: "gitlab",
      repoPath: "group/repo",
      baseUrl: "https://gitlab.com",
      ref: "",
      dir: "reports",
      maxFiles: 12,
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      fileName: "dev_evalResults.json",
      details: "dev",
    });
    expect(files[1]).toMatchObject({
      fileName: "main_evalResults.json",
      details: "main",
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/repository/branches?")
      )
    ).toBe(true);
  });

  test("explicit GitLab branch only queries that branch", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/projects/group%2Frepo")) {
        return jsonResponse({ id: 77 });
      }
      if (url.includes("/repository/tree?ref=release")) {
        return jsonResponse([
          {
            type: "blob",
            path: "reports/release_evalResults.json",
            name: "release_evalResults.json",
            id: "sha-release",
          },
        ]);
      }
      if (
        url.includes("/repository/commits?ref_name=release") &&
        url.includes("reports%2Frelease_evalResults.json")
      ) {
        return jsonResponse([{ committed_date: "2026-04-03T00:00:00.000Z" }]);
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const files = await listRecentRepoJsonFiles({
      provider: "gitlab",
      repoPath: "group/repo",
      baseUrl: "https://gitlab.com",
      ref: "release",
      dir: "reports",
      maxFiles: 12,
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      fileName: "release_evalResults.json",
      details: "release",
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/repository/branches?")
      )
    ).toBe(false);
  });
});
