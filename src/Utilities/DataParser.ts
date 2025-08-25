// Data parser to extract information from WebPIQUE json output
// The parser works for TQI and Quality Aspects on other PIQUE outputs
// Parser is unique to display WebPIQUE product factors...updata Product Factor section for other PIQUE models

// Interfaces for parser
export interface CVEByTool {
  //this is specific to WebPIQUE
  tool: string;
  score: number;
}

export interface CVEItem {
  //this is specific to WebPIQUE
  name: string;
  description?: string;
  fixed?: string;
  vulnSource?: string;
  vulnSourceVersion?: string;
  fixedVersion?: string;
  byTool: CVEByTool[];
  CWEmeasureName?: string;
}

export interface ProductFactor {
  //this is specific to WebPIQUE
  name: string;
  value: number;
  description: string;
  type: string;
  aspect: string;
  benchmarkSize?: number;
  measures: {
    name: string;
    description: string;
    score: number;
    threshold: number[];
    weight?: number;
  }[];
  cves: CVEItem[];
}

export interface ParsedScore {
  tqiScore: number;
  aspects: { name: string; value: number }[];
  productFactorsByAspect: ProductFactorsByAspect;
  vulnerabilitySummary?: VulnerabilitySummary; //this is specific to WebPIQUE
  cweProductFactors?: ProductFactor[]; //this is specific to WebPIQUE
}

export interface ProductFactorsByAspect {
  [aspectName: string]: ProductFactor[];
}

export interface VulnerabilitySummary {
  //this is specific to WebPIQUE
  cweCount: number;
  cveCount: number;
}

export function parsePIQUEJSON(json: any): {
  scores: ParsedScore;
  productFactorsByAspect: ProductFactorsByAspect;
} {
  //variables for TQI and quality aspect scores, and product factor infomration
  const tqiRaw = json.factors?.tqi;
  const tqiNode = tqiRaw ? Object.values(tqiRaw)[0] : null;
  const qualityAspectsRaw = json.factors.quality_aspects || {};
  const productFactorsRaw = json.factors.product_factors || {};

  //extract and store TQI score
  let tqiScore = 0;
  if (tqiNode && typeof (tqiNode as any).value === "number") {
    tqiScore = (tqiNode as any).value;
  }

  //extract and store aspect scores
  const aspects = Object.entries(qualityAspectsRaw).map(
    ([aspectName, aspectData]: any) => ({
      name: aspectName,
      value: typeof aspectData?.value === "number" ? aspectData.value : 0,
    })
  );

  //extract and store product factor information by aspect
  const productFactorsByAspect: ProductFactorsByAspect = {};
  for (const [aspectName, rawData] of Object.entries(qualityAspectsRaw)) {
    const aspectData = rawData as { value: number; children?: unknown };
    const children: string[] = Array.isArray(aspectData.children)
      ? (aspectData.children as string[])
      : [];
    const pfList: ProductFactor[] = [];

    for (const pfKey of children) {
      const pfName = pfKey as string;
      const pfData = productFactorsRaw[pfName];
      if (pfData) {
        const cleanName = pfName.replace(/^Product_Factor:/, "");
        let type: string | undefined = undefined;

        pfList.push({
          name: pfName as string,
          aspect: aspectName,
        } as any);
      }
    }

    productFactorsByAspect[aspectName] = pfList;
  }

  //extract CWE product factors, specific to WebPIQUE
  const cweProductFactors: ProductFactor[] = [];

  for (const [key, pfDataRaw] of Object.entries(
    json.factors?.product_factors || {}
  )) {
    const pfData = pfDataRaw as any;
    const weightsMap = (pfData?.weights ?? {}) as Record<string, number>;

    if (key.startsWith("Product_Factor")) {
      const children = pfData.children;
      const measures: {
        name: string;
        description: string;
        score: number;
        threshold: number[];
        weight: number;
      }[] = [];

      if (children && typeof children === "object") {
        for (const [measureKey, measureObj] of Object.entries(children)) {
          if (typeof measureObj === "object" && measureObj !== null) {
            const m = measureObj as any;

            // weight lookup by key, then by name (covers both common JSON shapes)
            const weight = Number(
              weightsMap[measureKey] ?? weightsMap[m.name] ?? 0
            );

            measures.push({
              name: (measureObj as any).name ?? measureKey,
              description: (measureObj as any).description ?? "",
              score: (measureObj as any).value ?? 0,
              weight,
              threshold: Array.isArray((measureObj as any).thresholds)
                ? (measureObj as any).thresholds.map(Number)
                : [],
            });
          }
        }
      }

      //extract CVE, specific to WebPIQUE
      const cveMap = new Map<string, CVEItem>();

      for (const measureObj of Object.values(pfData.children ?? {})) {
        if (!measureObj || typeof measureObj !== "object") continue;

        for (const [diagKey, diagObj] of Object.entries(
          (measureObj as any).children ?? {}
        )) {
          const diag = diagObj as any;
          const tool = diag?.toolName ?? diagKey; // Grype / Trivy / etc.

          for (const [findingKey, findingObj] of Object.entries(
            diag?.children ?? {}
          )) {
            if (!findingKey.startsWith("CVE-")) continue;

            const f = findingObj as any;
            const name = f.name ?? findingKey;

            // get CVE item
            let item = cveMap.get(name);
            if (!item) {
              item = {
                name,
                description: f.description ?? "",
                fixed:
                  f.fixed === true || f.fixed === "true"
                    ? "Fixed"
                    : f.fixed === false || f.fixed === "false"
                    ? "Not fixed"
                    : f.fixed || "Not fixed", //set fixed status to either "Fixed" or "Not fixed"
                vulnSource: f.vulnSource ?? "",
                vulnSourceVersion: f.vulnSourceVersion ?? "",
                fixedVersion: f.fixedVersion ?? "",
                byTool: [],
                CWEmeasureName: (measureObj as any).name,
              };
              cveMap.set(name, item);
            }

            item.byTool.push({
              tool,
              score: Number(f.value ?? 0),
            });
          }
        }
      }

      let benchmarkSize = 0;
      for (const m of measures) {
        if (Array.isArray(m.threshold) && m.threshold.length) {
          benchmarkSize = m.threshold.length;
          break;
        }
      }

      // log mismatches if thresholds aren’t consistent
      const mismatch = measures.some(
        (m) =>
          (m.threshold?.length ?? 0) !== 0 &&
          (m.threshold?.length ?? 0) !== benchmarkSize
      );
      if (mismatch)
        console.warn("Inconsistent threshold lengths under PF", key);

      cweProductFactors.push({
        name: key,
        value: pfData.value ?? 0,
        description: pfData.description ?? "",
        measures,
        type: "CWE",
        aspect: "",
        cves: Array.from(cveMap.values()),
        benchmarkSize,
      });
    }
  }

  // Extract CWE product factors and CVE counts, specific to WebPIQUE
  const cweCount = Object.keys(json.factors?.product_factors || {}).filter(
    (key) => key.startsWith("Product_Factor CWE-")
  ).length;

  // Recursively traverse diagnostics to extract CVEs
  function collectCVEs(obj: any): Set<string> {
    const found = new Set<string>();
    const stack = [obj];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== "object") continue;

      for (const [key, value] of Object.entries(current)) {
        if (key.startsWith("CVE-")) {
          found.add(key);
        } else if (typeof value === "object") {
          stack.push(value);
        }
      }
    }

    return found;
  }

  const allCVEs = collectCVEs(json.factors?.product_factors || {});
  const cveCount = allCVEs.size;

  const vulnerabilitySummary = {
    cweCount,
    cveCount,
  };

  return {
    scores: {
      tqiScore,
      aspects,
      productFactorsByAspect,
      vulnerabilitySummary,
      cweProductFactors,
    },
    productFactorsByAspect,
  };
}
