// utility to determine differences between WebPIQUE json outputs -- unique to WebPIQUE
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

export function buildDiffHints(leftScores: any, rightScores: any): DiffHints {
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
  const lPFs: any[] = leftScores?.cweProductFactors ?? [];
  const rPFs: any[] = rightScores?.cweProductFactors ?? [];

  const rByName = new Map<string, any>();
  for (const p of rPFs) if (p?.name) rByName.set(p.name, p);

  for (const lpf of lPFs) {
    const pfName = lpf?.name;
    if (!pfName) continue;

    const rpf = rByName.get(pfName);
    if (!rpf) {
      hints.missingPFs.add(pfName);
      for (const lm of lpf?.measures ?? [])
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
    for (const rm of rpf?.measures ?? [])
      if (rm?.name) rMeasuresByName.set(rm.name, rm);

    for (const lm of lpf?.measures ?? []) {
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

  return hints;
}
