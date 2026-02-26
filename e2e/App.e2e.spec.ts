import { test, expect } from "@playwright/test";

function makePiqueJson(tqi = 80, aspect = 70) {
  return {
    factors: {
      tqi: {
        Overall: { value: tqi, weights: { Security: 1 } },
      },
      quality_aspects: {
        Security: { value: aspect, weights: { Product_Factor_1: 1 } },
      },
      product_factors: {
        Product_Factor_1: {
          name: "Product_Factor_1",
          value: aspect,
          weights: {},
          children: {},
        },
      },
    },
    measures: {},
    diagnostics: {},
  };
}

test.describe("App e2e systems and dependency flow", () => {
  test("loads landing page shell and upload UI", async ({ page }) => {
    await page.goto("/#/");

    await expect(page.getByText("WebPIQUE Visualizer")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Browse Files" })
    ).toBeVisible();
    await expect(page.getByText("Montana State University SECL")).toBeVisible();
  });

  test("navigates from landing to single file page after uploading a JSON file", async ({ page }) => {
    await page.goto("/#/");

    await page.locator('main input[type="file"]').setInputFiles({
      name: "sample.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(makePiqueJson(81, 71))),
    });

    await expect(page).toHaveURL(/#\/visualizer$/);
    await expect(
      page.getByText(/click on a quality aspect above to view more information\./i)
    ).toBeVisible();
  });

  test("navigates from landing to project page via hamburger menu", async ({ page }) => {
    await page.goto("/#/");

    await page.locator('.hamburger-react[role="button"]').click();
    await page.getByText("Project", { exact: true }).click();

    await expect(page).toHaveURL(/#\/projects$/);
    await expect(page.getByText("Project List", { exact: true })).toBeVisible();
  });

  test("navigates from landing to compare page via menu and two uploads", async ({ page }) => {
    await page.goto("/#/");

    await page.locator('.hamburger-react[role="button"]').click();
    await page.getByText("Compare", { exact: true }).click();

    const comparePanel = page.getByText("Select Files to Compare").locator("..");
    await comparePanel.locator('input[type="file"]').nth(0).setInputFiles({
      name: "left.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(makePiqueJson(75, 65))),
    });
    await comparePanel.locator('input[type="file"]').nth(1).setInputFiles({
      name: "right.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(makePiqueJson(85, 72))),
    });

    await page.getByRole("button", { name: "Compare" }).click();

    await expect(page).toHaveURL(/#\/compare$/);
    await expect(page.getByText("File Name:").first()).toBeVisible();
    await expect(page.getByText(/left\.json/i)).toBeVisible();
    await expect(page.getByText(/right\.json/i)).toBeVisible();
  });

  test("loads /visualizer from localStorage fallback", async ({ page }) => {
    const payload = { filename: "stored-single.json", data: makePiqueJson(90, 80) };
    await page.addInitScript((p) => {
      localStorage.setItem("wp_single_payload", JSON.stringify(p));
    }, payload);

    await page.goto("/#/visualizer");

    await expect(
      page.getByText(/click on a quality aspect above to view more information\./i)
    ).toBeVisible();
  });

  test("loads /compare from localStorage fallback", async ({ page }) => {
    const payload = {
      file1: { filename: "stored-left.json", data: makePiqueJson(65, 60) },
      file2: { filename: "stored-right.json", data: makePiqueJson(67, 61) },
    };

    await page.addInitScript((p) => {
      localStorage.setItem("wp_compare_payload", JSON.stringify(p));
    }, payload);

    await page.goto("/#/compare");

    await expect(page.getByText("File Name:").first()).toBeVisible();
    await expect(page.getByText(/stored-left\.json/i)).toBeVisible();
    await expect(page.getByText(/stored-right\.json/i)).toBeVisible();
  });

  test("loads /compare from IndexedDB fallback when pending key is set", async ({ page }) => {
    await page.goto("/#/");

    await page.evaluate(async () => {
      const makePiqueJsonInPage = (tqi = 80, aspect = 70) => ({
        factors: {
          tqi: {
            Overall: { value: tqi, weights: { Security: 1 } },
          },
          quality_aspects: {
            Security: { value: aspect, weights: { Product_Factor_1: 1 } },
          },
          product_factors: {
            Product_Factor_1: {
              name: "Product_Factor_1",
              value: aspect,
              weights: {},
              children: {},
            },
          },
        },
        measures: {},
        diagnostics: {},
      });

      const payload = {
        file1: { filename: "idb-left.json", data: makePiqueJsonInPage(70, 60) },
        file2: { filename: "idb-right.json", data: makePiqueJsonInPage(71, 61) },
      };

      sessionStorage.setItem("wp_compare_pending_idb", "1");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("wp_payload_db", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("payloads")) {
            db.createObjectStore("payloads");
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("payloads", "readwrite");
          tx.objectStore("payloads").put(payload, "compare");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    await page.goto("/#/compare");

    await expect(page.getByText(/idb-left\.json/i)).toBeVisible();
    await expect(page.getByText(/idb-right\.json/i)).toBeVisible();
  });

  test("loads /viewer from storage payload", async ({ page }) => {
    const payload = { filename: "viewer-single.json", data: makePiqueJson(88, 77) };
    await page.addInitScript((p) => {
      localStorage.setItem("wp_single_payload", JSON.stringify(p));
    }, payload);

    await page.goto("/#/viewer");

    await expect(
      page.getByText(/click on a quality aspect above to view more information\./i)
    ).toBeVisible();
  });

  test("refreshes project files using mocked external GitHub API", async ({ page }) => {
    const repoProject = [
      {
        id: "p1",
        name: "Repo Project",
        repoConnection: {
          provider: "github",
          baseUrl: "https://api.github.com",
          repoPath: "test-owner/test-repo",
          ref: "main",
          dir: "",
        },
      },
    ];

    await page.route("https://api.github.com/repos/test-owner/test-repo/git/trees/main?recursive=1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tree: [
            {
              type: "blob",
              path: "sample.json",
              sha: "abc123",
            },
          ],
        }),
      });
    });

    await page.route("https://api.github.com/repos/test-owner/test-repo/commits?sha=main&path=sample.json&per_page=1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            commit: {
              committer: {
                date: "2026-01-15T00:00:00.000Z",
              },
            },
          },
        ]),
      });
    });

    await page.route("https://api.github.com/repos/test-owner/test-repo/git/blobs/abc123", async (route) => {
      const blobJson = makePiqueJson(83, 74);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          encoding: "base64",
          content: Buffer.from(JSON.stringify(blobJson)).toString("base64"),
        }),
      });
    });

    await page.addInitScript((projects) => {
      localStorage.setItem("wp_projects", JSON.stringify(projects));
      localStorage.setItem("wp_project_files:p1", JSON.stringify([]));
      localStorage.setItem("wp_active_project_id", "p1");
    }, repoProject);

    await page.goto("/#/projects");

    await expect(page.getByText(/refreshing files from github/i)).toBeVisible();
    await expect(page.getByText(/refreshed 1 file\(s\) from github\./i)).toBeVisible();
  });

  test("redirects /compare to landing when no compare payload exists", async ({ page }) => {
    await page.goto("/#/compare");

    await expect(
      page.getByRole("button", { name: "Browse Files" })
    ).toBeVisible();
  });

  test("loads projects route empty state", async ({ page }) => {
    await page.goto("/#/projects");

    await expect(page.getByText("Project List", { exact: true })).toBeVisible();
    await expect(page.getByText("No projects yet")).toBeVisible();
    await expect(
      page.getByText(/click the \+ icon in the project list sidebar\./i)
    ).toBeVisible();
  });
});

