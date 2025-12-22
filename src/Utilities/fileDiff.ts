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

  // compare pf and measure scores between panes
  pfPeerValues: Map<string, number | null>;
  pfPeerBenchmarkSize: Map<string, number>;
  measurePeerValues: Map<string, number | null>;
  measurePeerWeights: Map<string, number | null>;
};

const EPS = 1e-6;

const nearlyEq = (a?: number | null, b?: number | null) =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < EPS
    : a == null && b == null;

const mkey = (pfName: string, mName: string) => `${pfName}::${mName}`;

// Normalize keys so UI lookups are stable across casing/whitespace.
// - CVE/GHSA IDs: uppercase
// - everything else: trimmed as-is
const normFindingId = (id: any): string => {
  const s = String(id ?? "").trim();
  if (!s) return "";
  return /^(?:CVE|GHSA)-/i.test(s) ? s.toUpperCase() : s;
};

const normStr = (v: any) => String(v ?? "").trim();

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
// supports: [{tool:"Grype"}], [{name:"Grype"}], ["Grype"], "Grype", {tool:"Grype"}
const setOfTools = (arr: any) => {
  const raw = Array.isArray(arr) ? arr : arr ? [arr] : [];
  return new Set(
    raw
      .map((t: any) =>
        normStr(
          typeof t === "string" ? t : t?.tool ?? t?.name ?? t?.source ?? ""
        )
      )
      .filter(Boolean)
  );
};

const eqSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Collect PFs from scores in a way that matches ProductFactorTabs:
 * 1) productFactorsByAspect
 * 2) cweProductFactors (security legacy)
 */
const collectPFs = (scores: any): any[] => {
  const out: any[] = [];
  const seen = new Set<string>();

  const byAspect = scores?.productFactorsByAspect as
    | Record<string, any[]>
    | undefined;

  if (byAspect && typeof byAspect === "object") {
    for (const list of Object.values(byAspect)) {
      for (const pf of list ?? []) {
        const name = pf?.name;
        if (name && !seen.has(name)) {
          seen.add(name);
          out.push(pf);
        }
      }
    }
  }

  for (const pf of scores?.cweProductFactors ?? []) {
    const name = pf?.name;
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(pf);
    }
  }

  return out;
};

/**
 * When PF.measures is missing/empty (common if UI uses relational graph),
 * derive PF->Measures from scores.relational:
 * - find PF id by PF name in relational.productFactors
 * - pfMeasures gives measureIds for pfId
 * - measures table provides measure rows
 */
const collectMeasuresForPF = (scores: any, pfObj: any): any[] => {
  const direct = Array.isArray(pfObj?.measures) ? pfObj.measures : [];
  if (direct.length > 0) return direct;

  const rel = scores?.relational;
  if (!rel) return [];

  const pfName = String(pfObj?.name ?? "").trim();
  if (!pfName) return [];

  const pfRow = (rel.productFactors ?? []).find((p: any) => p?.name === pfName);
  const pfId = pfRow?.id;
  if (!pfId) return [];

  const measureIds: string[] = [];
  for (const e of rel.pfMeasures ?? []) {
    if (e?.pfId === pfId && e?.measureId) measureIds.push(String(e.measureId));
  }

  const measureById = new Map<string, any>();
  for (const m of rel.measures ?? []) {
    if (m?.id) measureById.set(String(m.id), m);
  }

  return measureIds.map((id) => measureById.get(id)).filter(Boolean);
};

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

  // ----- PFs + Measures -----
  const lPFs = collectPFs(leftScores);
  const rPFs = collectPFs(rightScores);

  const rByName = new Map<string, any>();
  for (const p of rPFs) if (p?.name) rByName.set(p.name, p);

  for (const lpf of lPFs) {
    const pfName = lpf?.name;
    if (!pfName) continue;

    const rpf = rByName.get(pfName);
    if (!rpf) {
      hints.missingPFs.add(pfName);

      // mark all measures under this PF as missing (derive measures same way UI can)
      const lMeasuresAll = collectMeasuresForPF(leftScores, lpf);
      for (const lm of lMeasuresAll) {
        const mName = lm?.name;
        if (mName) hints.missingMeasures.add(mkey(pfName, mName));
      }
      continue;
    }

    // pf peer value for ▲/▼
    hints.pfPeerValues.set(
      pfName,
      typeof rpf.value === "number" ? rpf.value : null
    );

    // derive benchmark size similar to UI
    const getBenchmarkSize = (pf: any): number => {
      if (typeof pf?.benchmarkSize === "number") return pf.benchmarkSize;
      const m = collectMeasuresForPF(leftScores, pf)?.[0] ?? pf?.measures?.[0];
      const th: unknown = m?.thresholds ?? m?.threshold ?? [];
      return Array.isArray(th) ? th.length : 0;
    };

    const benchL = getBenchmarkSize(lpf);
    const benchR = getBenchmarkSize(rpf);
    hints.pfPeerBenchmarkSize.set(pfName, benchR);

    const valueDiff = !nearlyEq(lpf.value, rpf.value);
    const benchDiff = benchL !== benchR;

    if (valueDiff || benchDiff) {
      hints.differingPFs.add(pfName);
      hints.pfFieldDiffs.set(pfName, {
        ...(valueDiff ? { value: true } : {}),
        ...(benchDiff ? { benchmarkSize: true } : {}),
      });
    }

    // measures matched by measure.name
    const lMeasures = collectMeasuresForPF(leftScores, lpf);
    const rMeasures = collectMeasuresForPF(rightScores, rpf);

    const rMeasuresByName = new Map<string, any>();
    for (const rm of rMeasures ?? [])
      if (rm?.name) rMeasuresByName.set(rm.name, rm);

    for (const lm of lMeasures ?? []) {
      const mName = lm?.name;
      if (!mName) continue;

      const key = mkey(pfName, mName);
      const rm = rMeasuresByName.get(mName);

      if (!rm) {
        hints.missingMeasures.add(key);
        hints.measurePeerValues.set(key, null);
        hints.measurePeerWeights.set(key, null);
        continue;
      }

      // score may be in score OR value depending on parser shape
      const lScore = typeof lm?.score === "number" ? lm.score : lm?.value;
      const rScore = typeof rm?.score === "number" ? rm.score : rm?.value;

      hints.measurePeerValues.set(
        key,
        typeof rScore === "number" ? rScore : null
      );
      hints.measurePeerWeights.set(
        key,
        typeof rm?.weight === "number" ? rm.weight : null
      );

      const scoreDiff = !nearlyEq(
        typeof lScore === "number" ? lScore : null,
        typeof rScore === "number" ? rScore : null
      );
      const weightDiff = !nearlyEq(lm?.weight ?? null, rm?.weight ?? null);

      if (scoreDiff || weightDiff) {
        hints.differingMeasures.add(key);
        hints.measureFieldDiffs.set(key, {
          ...(scoreDiff ? { score: true } : {}),
          ...(weightDiff ? { weight: true } : {}),
        });
      }
    }
  }

  // ----- Findings / CVEs / Diagnostics (fields + flags) -----
  // Prefer relational.findings because that is what FindingsTab renders.
  const collectFindings = (scores: any) => {
    const rel = scores?.relational;
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

    if (rel?.findings && Array.isArray(rel.findings)) {
      for (const f of rel.findings) {
        const id = normFindingId(
          f?.id ?? f?.cveId ?? f?.name ?? f?.CVE ?? f?.CVE_ID
        );
        if (!id) continue;

        map.set(id, {
          pkg: normStr(f?.vulnSource),
          vulnVer: normStr(f?.vulnSourceVersion),
          fixed: normFixed(f?.fixed),
          fixedVer: normStr(f?.fixedVersion),
          byTool: setOfTools(f?.byTool),
        });
      }
      return map;
    }

    // Fallback: legacy pf.cves path
    for (const pf of collectPFs(scores)) {
      for (const c of pf?.cves ?? []) {
        const id = normFindingId(
          c?.cveId ?? c?.id ?? c?.name ?? c?.CVE ?? c?.CVE_ID
        );
        if (!id) continue;

        map.set(id, {
          pkg: normStr(c?.vulnSource),
          vulnVer: normStr(c?.vulnSourceVersion),
          fixed: normFixed(c?.fixed),
          fixedVer: normStr(c?.fixedVersion),
          byTool: setOfTools(c?.byTool),
        });
      }
    }
    return map;
  };

  const L = collectFindings(leftScores);
  const R = collectFindings(rightScores);

  const allIds = new Set<string>([...L.keys(), ...R.keys()]);
  for (const id of allIds) {
    const A = L.get(id);
    const B = R.get(id);

    if (!A || !B) {
      if (A) hints.missingCVEs.add(id);
      continue;
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
