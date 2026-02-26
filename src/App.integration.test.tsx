import { describe, beforeEach, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("App integration route flow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete (globalThis as any).__wpComparePayload;
  });

  test("loads landing page shell and upload UI", () => {
    renderAppAt("/");

    expect(screen.getByText(/webpique visualizer/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse files/i })).toBeInTheDocument();
    expect(screen.getByText(/montana state university secl/i)).toBeInTheDocument();
  });

  test("redirects /compare to landing when no compare payload exists", () => {
    renderAppAt("/compare");

    expect(screen.getByRole("button", { name: /browse files/i })).toBeInTheDocument();
  });

  test("loads projects route empty state", () => {
    renderAppAt("/projects");

    expect(screen.getByText(/^Project List$/i)).toBeInTheDocument();
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/click the \+ icon in the project list sidebar/i)
    ).toBeInTheDocument();
  });
});


