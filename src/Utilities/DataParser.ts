// Data parser to extract information from WebPIQUE json output
// The parser works for TQI and Quality Aspects on other PIQUE outputs
// Parser is unique to display WebPIQUE product factors...updata Product Factor section for other PIQUE models

// ---------------- Relational model (for compact & full) ----------------
export interface PFRow {
  id: string;
  name: string;
  value: number;
  description?: string;
  aspect?: string;
}

export interface MeasureRow {
  id: string;
  name: string;
  value: number;
  description?: string;
  thresholds?: number[];
  positive?: boolean;
}

export interface DiagnosticRow {
  id: string;
  name: string;
  toolName?: string;
  value?: number;
  description?: string;
}

export interface PFMeasureEdge {
  pfId: string;
  measureId: string;
  weight?: number;
}

export interface MeasureDiagnosticEdge {
  measureId: string;
  diagnosticId: string;
}

export interface DiagnosticFinding {
  diagnosticId: string;
  id: string;
  title?: string;
  alias?: string;
  description?: string;
  fixed?: any;
  vulnSource?: string;
  vulnSourceVersion?: string;
  fixedVersion?: string;
  byTool?: { tool: string; score?: number }[];
}

export interface RelationalExtract {
  productFactors: PFRow[];
  measures: MeasureRow[];
  diagnostics: DiagnosticRow[];
  pfMeasures: PFMeasureEdge[];
  measureDiagnostics: MeasureDiagnosticEdge[];
  findings: DiagnosticFinding[];
}

const __isVulnId = (key: string) => /^(?:CVE|GHSA)-/i.test(key);

// Build a unified relational view from a PIQUE JSON file.
export function buildRelationalExtract(json: any): RelationalExtract {
  const productFactors: PFRow[] = [];
  const measures: MeasureRow[] = [];
  const diagnostics: DiagnosticRow[] = [];
  const pfMeasures: PFMeasureEdge[] = [];
  const measureDiagnostics: MeasureDiagnosticEdge[] = [];
  const findings: DiagnosticFinding[] = [];

  const measuresRoot = (json.measures ?? {}) as Record<string, any>;
  const diagnosticsRoot = (json.diagnostics ?? {}) as Record<string, any>;

  // indexes to resolve by key OR name
  const measureIdByName = new Map<string, string>();
  for (const [mid, m] of Object.entries(measuresRoot)) {
    const nm = String((m as any)?.name ?? mid).trim();
    measureIdByName.set(nm, mid);
    measureIdByName.set(mid, mid);
  }
  const diagIdByName = new Map<string, string>();
  for (const [did, d] of Object.entries(diagnosticsRoot)) {
    const nm = String((d as any)?.name ?? did).trim();
    diagIdByName.set(nm, did);
    diagIdByName.set(did, did);
  }
  const resolveMeasureId = (labelOrKey: string) =>
    measureIdByName.get(labelOrKey) ?? null;
  const resolveDiagId = (labelOrKey: string) =>
    diagIdByName.get(labelOrKey) ?? null;

  // ---------------- product_factors -> measures (weights + children) ----------------
  for (const [pfId, pfObjRaw] of Object.entries(
    json.factors?.product_factors ?? {}
  )) {
    const pfObj = pfObjRaw as any;
    productFactors.push({
      id: String(pfId),
      name: String((pfObj as any)?.name ?? pfId),
      value: Number((pfObj as any)?.value ?? 0),
      description: (pfObj as any)?.description ?? "",
    });

    // PF -> Measure edges from weights (compact)
    const weights = ((pfObj as any)?.weights ?? {}) as Record<string, number>;
    for (const [label, w] of Object.entries(weights)) {
      const mid = resolveMeasureId(label) ?? resolveMeasureId(String(label));
      if (mid)
        pfMeasures.push({
          pfId: String(pfId),
          measureId: String(mid),
          weight: Number(w ?? 0),
        });
    }

    // PF -> Measure edges from children (full)
    const childMeasures = ((pfObj as any)?.children ?? {}) as Record<
      string,
      any
    >;
    for (const [mKey, mObj] of Object.entries(childMeasures)) {
      const mName = String((mObj as any)?.name ?? mKey);
      const mid = resolveMeasureId(mKey) ?? resolveMeasureId(mName) ?? mKey;
      if (mid) {
        const w = (weights as any)[mKey] ?? (weights as any)[mName] ?? 0;
        pfMeasures.push({
          pfId: String(pfId),
          measureId: String(mid),
          weight: Number(w ?? 0),
        });
      }
    }
  }

  // ---------------- measures ----------------
  for (const [mid, m] of Object.entries(measuresRoot)) {
    measures.push({
      id: String(mid),
      name: String((m as any)?.name ?? mid),
      value: Number((m as any)?.value ?? 0),
      description: (m as any)?.description ?? "",
      thresholds: Array.isArray((m as any)?.thresholds)
        ? (m as any).thresholds.map(Number)
        : [],
      positive: (m as any)?.positive,
    });

    // For compact JSON: add Measure -> Diagnostic edges from measure.weights
    const mWeights = ((m as any)?.weights ?? {}) as Record<string, number>;
    for (const [label] of Object.entries(mWeights)) {
      const did = resolveDiagId(String(label));
      if (did) {
        measureDiagnostics.push({
          measureId: String(mid),
          diagnosticId: String(did),
        });
      }
    }
  }

  // ---------------- diagnostics ----------------
  for (const [did, d] of Object.entries(diagnosticsRoot)) {
    diagnostics.push({
      id: String(did),
      name: String((d as any)?.name ?? did),
      toolName: (d as any)?.toolName ?? "",
      value: Number((d as any)?.value ?? 0),
      description: (d as any)?.description ?? "",
    });
  }

  // ---------------- edges/findings from full JSON children ----------------
  for (const [_pfId, pfObjRaw] of Object.entries(
    json.factors?.product_factors ?? {}
  )) {
    const pfObj = pfObjRaw as any;
    const measureChildren = ((pfObj as any)?.children ?? {}) as Record<
      string,
      any
    >;
    for (const [measureKey, measureObj] of Object.entries(measureChildren)) {
      const measureName = String((measureObj as any)?.name ?? measureKey);
      const measureId =
        resolveMeasureId(measureKey) ??
        resolveMeasureId(measureName) ??
        measureKey;

      const diagChildren = (measureObj as any)?.children ?? {};
      for (const [diagKey, diagObj] of Object.entries(diagChildren)) {
        const diagName = String((diagObj as any)?.name ?? diagKey);
        const diagId =
          resolveDiagId(diagKey) ?? resolveDiagId(diagName) ?? diagKey;

        measureDiagnostics.push({
          measureId: String(measureId),
          diagnosticId: String(diagId),
        });

        const findingChildren = (diagObj as any)?.children ?? {};
        for (const [findingKey, fObj] of Object.entries(findingChildren)) {
          if (!__isVulnId(String(findingKey))) continue;
          findings.push({
            diagnosticId: String(diagId),
            id: String((fObj as any)?.name ?? findingKey),
            title: String(
              (fObj as any)?.title ??
                (fObj as any)?.summary ??
                (fObj as any)?.name ??
                findingKey
            ),
            alias: String((fObj as any)?.alias ?? ""),
            description: (fObj as any)?.description ?? "",
            fixed: (fObj as any)?.fixed,
            vulnSource: (fObj as any)?.vulnSource ?? "",
            vulnSourceVersion: (fObj as any)?.vulnSourceVersion ?? "",
            fixedVersion: (fObj as any)?.fixedVersion ?? "",
            byTool: [
              {
                tool: String((diagObj as any)?.toolName ?? diagKey),
                score: Number((fObj as any)?.value ?? 0),
              },
            ],
          });
        }
      }
    }
  }

  return {
    productFactors,
    measures,
    diagnostics,
    pfMeasures,
    measureDiagnostics,
    findings,
  };
}

// ---------------- High-level score model used by the UI ----------------
export interface CVEByTool {
  tool: string;
  score: number;
}

export interface CVEItem {
  name: string;
  alias?: string;
  description?: string;
  fixed?: string;
  vulnSource?: string;
  vulnSourceVersion?: string;
  fixedVersion?: string;
  byTool: CVEByTool[];
  CWEmeasureName?: string;
}

export interface ProductFactor {
  name: string;
  value: number;
  description?: string;
  type?: string;
  aspect?: string;
  measures: {
    name: string;
    description: string;
    score: number;
    threshold: number[];
    weight?: number;
  }[];
  cves: CVEItem[];
}

export type ProductFactorsByAspect = Record<string, ProductFactor[]>;

export interface VulnerabilitySummary {
  cveCount: number;
}

export interface ParsedScore {
  tqiScore: number;
  aspects: { name: string; value: number }[];
  productFactorsByAspect: ProductFactorsByAspect;
  vulnerabilitySummary?: VulnerabilitySummary;
  cweProductFactors?: ProductFactor[];
}

// helper for CVE/GHSA
const isVulnId = (key: string): boolean => /^(?:CVE|GHSA)-/i.test(key);

// ---------------- Main entry ----------------
export function parsePIQUEJSON(json: any): {
  scores: ParsedScore;
  productFactorsByAspect: ProductFactorsByAspect;
  relational: RelationalExtract;
} {
  const tqiRaw = json.factors?.tqi;
  const tqiNode = tqiRaw ? Object.values(tqiRaw)[0] : null;
  const qualityAspectsRaw = json.factors?.quality_aspects || {};
  const productFactorsRaw = json.factors?.product_factors || {};

  // TQI
  let tqiScore = 0;
  if (tqiNode && typeof (tqiNode as any).value === "number") {
    tqiScore = (tqiNode as any).value;
  }

  // Aspects
  const aspects = Object.entries(qualityAspectsRaw).map(
    ([aspectName, aspectData]: any) => ({
      name: aspectName,
      value: typeof aspectData?.value === "number" ? aspectData.value : 0,
    })
  );

  // Product factors per aspect (full: children; compact: weights)
  const productFactorsByAspect: ProductFactorsByAspect = {};
  for (const [aspectName, rawData] of Object.entries(qualityAspectsRaw)) {
    const aspect = (rawData ?? {}) as {
      value?: number;
      children?: any;
      weights?: Record<string, number>;
    };
    const childArray: string[] = Array.isArray(aspect.children)
      ? (aspect.children as string[])
      : [];
    const childObjKeys: string[] =
      !Array.isArray(aspect.children) &&
      aspect.children &&
      typeof aspect.children === "object"
        ? Object.keys(aspect.children as Record<string, any>)
        : [];
    const weightKeys = Object.keys(
      (aspect.weights ?? {}) as Record<string, number>
    );
    const pfKeys: string[] = childArray.length
      ? childArray
      : childObjKeys.length
      ? childObjKeys
      : weightKeys;

    const pfList: ProductFactor[] = [];
    for (const pfKey of pfKeys) {
      const pfData = (productFactorsRaw as any)[pfKey];
      if (!pfData) continue;
      pfList.push({
        name: String(pfData?.name ?? pfKey),
        value: Number(pfData?.value ?? 0),
        description: pfData?.description ?? "",
        measures: [],
        cves: [],
      });
    }
    productFactorsByAspect[aspectName] = pfList;
  }

  // CWE-product-factors (for legacy Security views)
  const cweProductFactors: ProductFactor[] = [];
  for (const [key, pfDataRaw] of Object.entries(productFactorsRaw)) {
    const pfData = pfDataRaw as any;
    if (!(key.startsWith("Product_Factor") || key.startsWith("Pillar")))
      continue;
    const weightsMap = (pfData?.weights ?? {}) as Record<string, number>;

    const measures: {
      name: string;
      description: string;
      score: number;
      threshold: number[];
      weight: number;
    }[] = [];

    const children = pfData.children;
    if (children && typeof children === "object") {
      for (const [measureKey, measureObj] of Object.entries(children)) {
        const m = measureObj as any;
        const weight = Number(
          weightsMap[measureKey] ?? weightsMap[m?.name] ?? 0
        );
        measures.push({
          name: String(m?.name ?? measureKey),
          description: String(m?.description ?? ""),
          score: Number(m?.value ?? 0),
          weight,
          threshold: Array.isArray(m?.thresholds)
            ? m.thresholds.map(Number)
            : [],
        });
      }
    } else {
      // compact: derive measure list from global measures using PF->Measure edges
      for (const [mKey, w] of Object.entries(weightsMap)) {
        const m = (json.measures ?? {})[mKey] ?? {};
        measures.push({
          name: String((m as any)?.name ?? mKey),
          description: String((m as any)?.description ?? ""),
          score: Number((m as any)?.value ?? 0),
          weight: Number(w ?? 0),
          threshold: Array.isArray((m as any)?.thresholds)
            ? (m as any).thresholds.map(Number)
            : [],
        });
      }
    }

    // CVEs (only present in full JSON under measure.children)
    const cveMap = new Map<string, CVEItem>();
    if (children && typeof children === "object") {
      for (const measureObj of Object.values(children ?? {})) {
        if (!measureObj || typeof measureObj !== "object") continue;
        for (const [diagKey, diagObj] of Object.entries(
          (measureObj as any).children ?? {}
        )) {
          const tool = (diagObj as any)?.toolName ?? diagKey;
          for (const [findingKey, findingObj] of Object.entries(
            (diagObj as any).children ?? {}
          )) {
            if (!isVulnId(findingKey)) continue;
            const f = findingObj as any;
            const name = f.name ?? findingKey;
            let item = cveMap.get(name);
            if (!item) {
              item = {
                name,
                alias: f.alias ?? "",
                description: f.description ?? "",
                fixed:
                  f.fixed === true || f.fixed === "true" || f.fixed === "fixed"
                    ? "Fixed"
                    : f.fixed === false || f.fixed === "false"
                    ? "Not fixed"
                    : f.fixed || "Not fixed",
                vulnSource: f.vulnSource ?? "",
                vulnSourceVersion: f.vulnSourceVersion ?? "",
                fixedVersion: f.fixedVersion ?? "",
                byTool: [],
                CWEmeasureName: (measureObj as any).name,
              };
              cveMap.set(name, item);
            }
            item.byTool.push({ tool, score: Number(f.value ?? 0) });
          }
        }
      }
    }

    cweProductFactors.push({
      name: key,
      value: Number(pfData?.value ?? 0),
      description: pfData?.description ?? "",
      measures,
      type: "CWE",
      aspect: "",
      cves: Array.from(cveMap.values()),
    });
  }

  // vuln summary
  function collectVulnIds(obj: any): Set<string> {
    const found = new Set<string>();
    if (!obj) return found;
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      if (cur && typeof cur === "object") {
        for (const [key, value] of Object.entries(cur)) {
          if (__isVulnId(key)) found.add(key);
          if (value && typeof value === "object") stack.push(value);
        }
      }
    }
    return found;
  }
  const cveCount = collectVulnIds(json.factors?.product_factors || {}).size;

  const relational = buildRelationalExtract(json);
  const vulnerabilitySummary = { cveCount };

  return {
    scores: {
      tqiScore,
      aspects,
      productFactorsByAspect,
      vulnerabilitySummary,
      cweProductFactors,
    },
    productFactorsByAspect,
    relational,
  };
}
