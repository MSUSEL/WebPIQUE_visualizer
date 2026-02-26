import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

async function expectNoSeriousOrCriticalViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .exclude(".react-split__sash")
    .analyze();

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );

  expect(
    seriousOrCritical,
    `A11y violations:\n${JSON.stringify(seriousOrCritical, null, 2)}`
  ).toEqual([]);
}

test.describe("Accessibility checks", () => {
  test("landing page has no serious/critical WCAG A/AA violations", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.getByText("WebPIQUE Visualizer")).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test("visualizer page has no serious/critical WCAG A/AA violations", async ({ page }) => {
    const payload = { filename: "a11y-single.json", data: makePiqueJson(88, 77) };
    await page.addInitScript((p) => {
      localStorage.setItem("wp_single_payload", JSON.stringify(p));
    }, payload);

    await page.goto("/#/visualizer");
    await expect(
      page.getByText(/click on a quality aspect above to view more information\./i)
    ).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test("compare page has no serious/critical WCAG A/AA violations", async ({ page }) => {
    const payload = {
      file1: { filename: "a11y-left.json", data: makePiqueJson(65, 60) },
      file2: { filename: "a11y-right.json", data: makePiqueJson(67, 61) },
    };

    await page.addInitScript((p) => {
      localStorage.setItem("wp_compare_payload", JSON.stringify(p));
    }, payload);

    await page.goto("/#/compare");
    await expect(page.getByText("File Name:").first()).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
});
