import { describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ProjectFileLoad, { type ProjectFileScore } from "./ProjectFileLoad";

function makeScore(
  id: string,
  fileName: string,
  fileDateISO: string
): ProjectFileScore {
  return {
    id,
    fileName,
    fileDateISO,
    tqi: 42,
    aspects: [],
    rawKey: `raw:${id}`,
    needsRaw: false,
  };
}

describe("ProjectFileLoad", () => {
  test("does not publish stale scores under the next project id during prop sync", async () => {
    const projectOneScores = [
      makeScore("repo-1", "repo-file.json", "2026-01-01T00:00:00.000Z"),
    ];
    const projectTwoScores = [
      makeScore("local-1", "local-file.json", "2026-02-01T00:00:00.000Z"),
    ];
    const onScores = vi.fn();

    const { rerender } = render(
      <ProjectFileLoad
        projectId="project-1"
        scoresFromParent={projectOneScores}
        onScores={onScores}
      />
    );

    await waitFor(() =>
      expect(onScores).toHaveBeenCalledWith("project-1", projectOneScores)
    );

    rerender(
      <ProjectFileLoad
        projectId="project-2"
        scoresFromParent={projectTwoScores}
        onScores={onScores}
      />
    );

    await waitFor(() =>
      expect(onScores).toHaveBeenCalledWith("project-2", projectTwoScores)
    );

    expect(onScores).not.toHaveBeenCalledWith("project-2", projectOneScores);
  });
});
