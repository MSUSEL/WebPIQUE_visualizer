// utility to determine differences between WebPIQUE json outputs -- unique to WebPIQUE
import type { RelationalExtract } from "./DataParser";
export type DiffHints = {
  // membership / presence
  differingPFs: Set<string>;
  differingMeasures: Set<string>;
  differingCVEs: Set<string>;
  missingPFs: Set<string>;
  missingMeasures: Set<string>;
  missingCVEs: Set<string>;

  // compare field-level information
  pfFieldDiffs: Map<string, { value?: boolean; benchmarkSize?: boolean }>;
  measureFieldDiffs: Map<string, { score?: boolean; weight?: boolean }>;
  cveFieldDiffs: Map<
    string,
    {
      pkg?: boolean;
      vulnVer?: boolean;
      fixed?: boolean;
      fixedVer?: boolean;
      byTool?: boolean;
    }
  >;

  // compare pf and measure scores bewteen panes
  pfPeerValues: Map<string, number | null>;
  pfPeerBenchmarkSize: Map<string, number>;
  measurePeerValues: Map<string, number | null>;
  measurePeerWeights: Map<string, number | null>;
};

const EPS = 1e-6; // reduce flaoting-point rounding noise during comparison
const nearlyEq = (a?: number | null, b?: number | null) =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < EPS
    : a == null && b == null;

const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

const normFixed = (v: any): "fixed" | "notfixed" | "" => {
  if (v === true) return "fixed";
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "true" || s === "fixed") return "fixed";
  if (s === "false" || s === "not fixed") return "notfixed";
  return "";
};

// normalize tools as a set of tool names (order/dupes ignored)
const setOfTools = (arr: any[]) =>
  new Set((arr ?? []).map((t) => String(t?.tool ?? "").trim()).filter(Boolean));
const eqSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

export function buildDiffHints(
  leftScores: any,
  rightScores: any,
  leftRel?: RelationalExtract | null,
  rightRel?: RelationalExtract | null
): DiffHints {
  const hints: DiffHints = {
    differingPFs: new Set(),
    differingMeasures: new Set(),
    differingCVEs: new Set(),
    missingPFs: new Set(),
    missingMeasures: new Set(),
    missingCVEs: new Set(),
    pfFieldDiffs: new Map(),
    measureFieldDiffs: new Map(),
    cveFieldDiffs: new Map(),
    pfPeerValues: new Map(),
    pfPeerBenchmarkSize: new Map(),
    measurePeerValues: new Map(),
    measurePeerWeights: new Map(),
  };

  // pf and measure comparison
  const flattenPFs = (scores: any): any[] => {
    const out = new Map<string, any>();
    const fromAspect = Object.values(
      (scores?.productFactorsByAspect ?? {}) as Record<string, any[]>
    ).flat();
    const fromCwe = scores?.cweProductFactors ?? [];
    const all = [...fromAspect, ...fromCwe];
    for (const pf of all) {
      const name = pf?.name;
      if (!name) continue;
      const existing = out.get(name);
      if (!existing) {
        out.set(name, pf);
        continue;
      }
      const nextMeasures = Array.isArray(pf?.measures) ? pf.measures.length : 0;
      const curMeasures = Array.isArray(existing?.measures)
        ? existing.measures.length
        : 0;
      if (nextMeasures > curMeasures) out.set(name, pf);
    }
    return Array.from(out.values());
  };

  const lPFs: any[] = flattenPFs(leftScores);
  const rPFs: any[] = flattenPFs(rightScores);

  const measuresByIdL = new Map<string, any>(
    (leftRel?.measures ?? []).map((m) => [String(m.id), m])
  );
  const measuresByIdR = new Map<string, any>(
    (rightRel?.measures ?? []).map((m) => [String(m.id), m])
  );
  const pfIdByNameL = new Map<string, string>(
    (leftRel?.productFactors ?? []).map((pf) => [String(pf.name), String(pf.id)])
  );
  const pfIdByNameR = new Map<string, string>(
    (rightRel?.productFactors ?? []).map((pf) => [String(pf.name), String(pf.id)])
  );

  const measuresForPF = (
    pfName: string,
    pfObj: any,
    rel?: RelationalExtract | null,
    pfIdByName?: Map<string, string>,
    measuresById?: Map<string, any>
  ) => {
    if (Array.isArray(pfObj?.measures) && pfObj.measures.length)
      return pfObj.measures;
    if (!rel) return [];
    const pfId = pfIdByName?.get(pfName);
    if (!pfId) return [];
    return (rel.pfMeasures ?? [])
      .filter((edge) => String(edge.pfId) === pfId)
      .map((edge) => {
        const m = measuresById?.get(String(edge.measureId));
        return {
          name: String(m?.name ?? edge.measureId ?? ""),
          score: typeof m?.value === "number" ? m.value : null,
          weight: typeof edge.weight === "number" ? edge.weight : null,
        };
      })
      .filter((m) => m.name);
  };

  const rByName = new Map<string, any>();
  for (const p of rPFs) if (p?.name) rByName.set(p.name, p);

  for (const lpf of lPFs) {
    const pfName = lpf?.name;
    if (!pfName) continue;

    const rpf = rByName.get(pfName);
    if (!rpf) {
      hints.missingPFs.add(pfName);
      const lMeasures = measuresForPF(
        pfName,
        lpf,
        leftRel,
        pfIdByNameL,
        measuresByIdL
      );
      for (const lm of lMeasures)
        hints.missingMeasures.add(mkey(pfName, lm?.name ?? ""));
      continue;
    }

    // pf peer value for ▲/▼ chip in SecurityTabs
    hints.pfPeerValues.set(
      pfName,
      typeof rpf.value === "number" ? rpf.value : null
    );

    // derive benchmark size like the UI does
    function getBenchmarkSize(pf: any): number {
      if (typeof pf?.benchmarkSize === "number") return pf.benchmarkSize;
      const firstMeasure = pf?.measures?.[0];
      const th: unknown =
        firstMeasure?.thresholds ?? firstMeasure?.threshold ?? [];
      return Array.isArray(th) ? th.length : 0;
    }

    const benchL = getBenchmarkSize(lpf);
    const benchR = getBenchmarkSize(rpf);
    hints.pfPeerBenchmarkSize.set(pfName, benchR);

    // pf field diffs
    const valueDiff = !nearlyEq(lpf.value, rpf.value);
    const benchDiff = benchL !== benchR;
    if (valueDiff || benchDiff) {
      hints.differingPFs.add(pfName);
      hints.pfFieldDiffs.set(pfName, {
        ...(valueDiff ? { value: true } : {}),
        ...(benchDiff ? { benchmarkSize: true } : {}),
      });
    }

    // measures, matched by name
    const rMeasuresByName = new Map<string, any>();
    const rMeasures = measuresForPF(
      pfName,
      rpf,
      rightRel,
      pfIdByNameR,
      measuresByIdR
    );
    for (const rm of rMeasures)
      if (rm?.name) rMeasuresByName.set(rm.name, rm);

    const lMeasures = measuresForPF(
      pfName,
      lpf,
      leftRel,
      pfIdByNameL,
      measuresByIdL
    );
    for (const lm of lMeasures) {
      const mName = lm?.name;
      if (!mName) continue;

      const key = mkey(pfName, mName);
      const rm = rMeasuresByName.get(mName);

      if (!rm) {
        hints.missingMeasures.add(key);
        hints.measurePeerValues.set(key, null);
        continue;
      }

      // measure peer score/weight for ▲/▼ chips
      hints.measurePeerValues.set(
        key,
        typeof rm.score === "number" ? rm.score : null
      );
      hints.measurePeerWeights.set(
        key,
        typeof rm.weight === "number" ? rm.weight : null
      );

      // measure field diffs used for highlighting
      const scoreDiff = !nearlyEq(lm.score, rm.score);
      const weightDiff = !nearlyEq(lm.weight ?? null, rm.weight ?? null);

      if (scoreDiff || weightDiff) {
        hints.differingMeasures.add(key);
        hints.measureFieldDiffs.set(key, {
          ...(scoreDiff ? { score: true } : {}),
          ...(weightDiff ? { weight: true } : {}),
        });
      }
    }
  }

  // package vulnerability differences
  const collectCVEs = (scores: any) => {
    const map = new Map<
      string,
      {
        pkg: string;
        vulnVer: string;
        fixed: string;
        fixedVer: string;
        byTool: Set<string>;
      }
    >();
    for (const pf of scores?.cweProductFactors ?? []) {
      for (const c of pf?.cves ?? []) {
        const id = c?.cveId ?? c?.id ?? c?.name ?? c?.CVE ?? c?.CVE_ID ?? null;
        if (!id) continue;
        map.set(id, {
          pkg: (c?.vulnSource ?? "").trim(),
          vulnVer: (c?.vulnSourceVersion ?? "").trim(),
          fixed: normFixed(c?.fixed),
          fixedVer: (c?.fixedVersion ?? "").trim(),
          byTool: setOfTools(c?.byTool),
        });
      }
    }
    return map;
  };

  const L = collectCVEs(leftScores);
  const R = collectCVEs(rightScores);

  const allIds = new Set<string>([...L.keys(), ...R.keys()]);
  for (const id of allIds) {
    const A = L.get(id);
    const B = R.get(id);

    if (!A || !B) {
      if (A) hints.missingCVEs.add(id);
      continue; // no field diffs if absent on one side
    }

    const pkgDiff = A.pkg !== B.pkg;
    const vverDiff = A.vulnVer !== B.vulnVer;
    const fixDiff = A.fixed !== B.fixed;
    const fverDiff = A.fixedVer !== B.fixedVer;
    const toolDiff = !eqSet(A.byTool, B.byTool);

    if (pkgDiff || vverDiff || fixDiff || fverDiff || toolDiff) {
      hints.differingCVEs.add(id);
      hints.cveFieldDiffs.set(id, {
        ...(pkgDiff ? { pkg: true } : {}),
        ...(vverDiff ? { vulnVer: true } : {}),
        ...(fixDiff ? { fixed: true } : {}),
        ...(fverDiff ? { fixedVer: true } : {}),
        ...(toolDiff ? { byTool: true } : {}),
      });
    }
  }

  // diagnostic differences (non-CVE)
  const collectDiagnostics = (rel?: RelationalExtract | null) => {
    const map = new Map<
      string,
      { name: string; toolName: string; value: number | null; description: string }
    >();
    for (const d of rel?.diagnostics ?? []) {
      const id = String(d?.id ?? "").trim();
      if (!id) continue;
      map.set(id, {
        name: String(d?.name ?? ""),
        toolName: String(d?.toolName ?? ""),
        value: typeof d?.value === "number" ? d.value : null,
        description: String(d?.description ?? ""),
      });
    }
    return map;
  };

  const DL = collectDiagnostics(leftRel);
  const DR = collectDiagnostics(rightRel);
  const diagIds = new Set<string>([...DL.keys(), ...DR.keys()]);
  for (const id of diagIds) {
    const A = DL.get(id);
    const B = DR.get(id);
    if (!A || !B) {
      if (A) hints.missingCVEs.add(id);
      continue;
    }
    const nameDiff = A.name !== B.name;
    const toolDiff = A.toolName !== B.toolName;
    const descDiff = A.description !== B.description;
    const valDiff = !nearlyEq(A.value, B.value);
    if (nameDiff || toolDiff || descDiff || valDiff) {
      hints.differingCVEs.add(id);
    }
  }

  return hints;
}
