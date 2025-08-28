// utility to determine differences between WebPIQUE json outputs -- unique to WebPIQUE
export type DiffHints = {
  // card-level: exist on both sides but differ in some way
  differingPFs: Set<string>;
  differingMeasures: Set<string>;
  differingCVEs: Set<string>;

  // compares if something is present in one pane and not another
  missingPFs: Set<string>;
  missingMeasures: Set<string>;
  missingCVEs: Set<string>;

  // field-level diffs (only populated when the item exists on BOTH sides)
  pfFieldDiffs: Map<string, { value?: boolean; description?: boolean }>;
  measureFieldDiffs: Map<string, { score?: boolean; weight?: boolean }>;
  cveFieldDiffs: Map<
    string,
    { pkg?: boolean; vulnVer?: boolean; fixed?: boolean; fixedVer?: boolean }
  >;
};

const EPS = 1e-6;

const sameNum = (a?: number | null, b?: number | null) => {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < EPS;
  }
  return a == null && b == null;
};

const thash = (arr?: number[]) =>
  Array.isArray(arr) ? arr.map((n) => Number(n)).join(",") : "";

const normFixed = (v: any): "fixed" | "notfixed" | "" => {
  if (v === true) return "fixed";
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "fixed" || s === "true") return "fixed";
  if (s === "not fixed" || s === "false") return "notfixed";
  return "";
};

const getId = (c: any) =>
  c?.cveId ?? c?.id ?? c?.name ?? c?.CVE ?? c?.CVE_ID ?? null;

const measureKey = (pfName: string, mName: string) => `${pfName}::${mName}`;

export function buildDiffHints(leftScores: any, rightScores: any): DiffHints {
  const hints: DiffHints = {
    differingPFs: new Set<string>(),
    differingMeasures: new Set<string>(),
    differingCVEs: new Set<string>(),
    missingPFs: new Set<string>(),
    missingMeasures: new Set<string>(),
    missingCVEs: new Set<string>(),
    pfFieldDiffs: new Map(),
    measureFieldDiffs: new Map(),
    cveFieldDiffs: new Map(),
  };

  const leftPFs: any[] = leftScores?.cweProductFactors ?? [];
  const rightPFs: any[] = rightScores?.cweProductFactors ?? [];

  // pfs by name (right side)
  const rightPFByName = new Map<string, any>();
  rightPFs.forEach((p) => rightPFByName.set(p?.name, p));

  // compare pfs & Measures
  for (const lpf of leftPFs) {
    const pfName = String(lpf?.name ?? "");
    const rpf = rightPFByName.get(pfName);

    if (!rpf) {
      // missing entirely on right side
      hints.missingPFs.add(pfName);
      (lpf?.measures ?? []).forEach((m: any) =>
        hints.missingMeasures.add(measureKey(pfName, String(m?.name ?? "")))
      );
      continue;
    }

    // pf-level field diffs
    const valDiff = !sameNum(lpf?.value ?? null, rpf?.value ?? null);
    const descDiff = (lpf?.description ?? "") !== (rpf?.description ?? "");
    if (valDiff || descDiff) {
      hints.differingPFs.add(pfName);
      hints.pfFieldDiffs.set(pfName, {
        ...(valDiff ? { value: true } : {}),
        ...(descDiff ? { description: true } : {}),
      });
    }

    // measures by name on right side
    const rMeasures = new Map<string, any>();
    (rpf?.measures ?? []).forEach((m: any) =>
      rMeasures.set(String(m?.name ?? ""), m)
    );

    for (const lm of lpf?.measures ?? []) {
      const mName = String(lm?.name ?? "");
      const key = measureKey(pfName, mName);
      const rm = rMeasures.get(mName);

      if (!rm) {
        // measure missing on right; do not set field diffs
        hints.missingMeasures.add(key);
        continue;
      }

      const rScore = (rm as any)?.score ?? null;
      const rWeight = (rm as any)?.weight ?? null;
      const rThresh = (rm as any)?.threshold;

      const scoreDiff = !sameNum(lm?.score ?? null, rScore);
      const weightDiff = !sameNum(lm?.weight ?? null, rWeight);
      const thrDiff = thash(lm?.threshold) !== thash(rThresh);

      if (scoreDiff || weightDiff || thrDiff) {
        hints.differingMeasures.add(key);
        if (scoreDiff || weightDiff) {
          hints.measureFieldDiffs.set(key, {
            ...(scoreDiff ? { score: true } : {}),
            ...(weightDiff ? { weight: true } : {}),
          });
        }
      }
    }
  }

  // ----- CVEs/GHSAs
  const flattenCVEs = (scores: any) => {
    const out: Record<
      string,
      { pkg: string; vulnVer: string; fixed: string; fixedVer: string }
    > = {};
    for (const pf of scores?.cweProductFactors ?? []) {
      for (const c of pf?.cves ?? []) {
        const id = getId(c);
        if (!id) continue;
        out[id] = {
          pkg: (c?.vulnSource ?? "").trim(),
          vulnVer: (c?.vulnSourceVersion ?? "").trim(),
          fixed: normFixed(c?.fixed),
          fixedVer: (c?.fixedVersion ?? "").trim(),
        };
      }
    }
    return out;
  };

  const L = flattenCVEs(leftScores);
  const R = flattenCVEs(rightScores);

  const allIds = new Set<string>([...Object.keys(L), ...Object.keys(R)]);
  for (const id of allIds) {
    const A = L[id];
    const B = R[id];

    if (!A || !B) {
      // present on this (left) side but missing on right
      if (A) hints.missingCVEs.add(id);
      // omit field-level diffs when missing-only
      continue;
    }

    const pkgDiff = A.pkg !== B.pkg;
    const vverDiff = A.vulnVer !== B.vulnVer;
    const fixDiff = A.fixed !== B.fixed;
    const fverDiff = A.fixedVer !== B.fixedVer;

    if (pkgDiff || vverDiff || fixDiff || fverDiff) {
      hints.differingCVEs.add(id);
      hints.cveFieldDiffs.set(id, {
        ...(pkgDiff ? { pkg: true } : {}),
        ...(vverDiff ? { vulnVer: true } : {}),
        ...(fixDiff ? { fixed: true } : {}),
        ...(fverDiff ? { fixedVer: true } : {}),
      });
    }
  }

  return hints;
}
