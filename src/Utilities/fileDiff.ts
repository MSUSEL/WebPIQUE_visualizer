// utility to determine differences between WebPIQUE json outputs -- unique to WebPIQUE

export type ToolScore = { tool: string; score: number };

export type ScoresType = {
  cweProductFactors: Array<{
    name: string;
    value: number;
    description: string;
    measures: Array<{
      name: string;
      score: number;
      weight?: number | null;
      threshold: number[];
    }>;
    cves?: Array<{
      name: string;
      byTool: Array<{ tool: string; score: number }>;
    }>;
  }>;
};

export type DiffHints = {
  differingPFs: Set<string>; // pillar key (pf.name)
  differingMeasures: Set<string>; // `${pf.name}::${measure.name}`
  differingCVEs: Set<string>; // "CVE-YYYY-NNNN" ID
  differingToolScores: Set<string>; // `${CVE}|${tool}`
};

const thash = (arr?: number[]) =>
  Array.isArray(arr) ? arr.map(Number).join(",") : "";

export function computeDiffHintsFromScores(
  a: ScoresType,
  b: ScoresType
): DiffHints {
  const differingPFs = new Set<string>();
  const differingMeasures = new Set<string>();
  const differingCVEs = new Set<string>();
  const differingToolScores = new Set<string>();

  // ---------- PF / CWE ----------
  const mapPF = (s: ScoresType) =>
    new Map(s.cweProductFactors.map((pf) => [pf.name, pf]));
  const A = mapPF(a);
  const B = mapPF(b);

  const allPFNames = new Set<string>([...A.keys(), ...B.keys()]);
  for (const pfName of allPFNames) {
    const pa = A.get(pfName);
    const pb = B.get(pfName);
    if (!pa || !pb) {
      differingPFs.add(pfName);
      continue;
    }

    if (pa.value !== pb.value || pa.description !== pb.description) {
      differingPFs.add(pfName);
    }

    const mapM = (pf: typeof pa) =>
      new Map(pf.measures.map((m) => [m.name, m]));
    const Am = mapM(pa),
      Bm = mapM(pb);
    const allM = new Set<string>([...Am.keys(), ...Bm.keys()]);
    for (const mk of allM) {
      const ma = Am.get(mk);
      const mb = Bm.get(mk);
      if (!ma || !mb) {
        differingPFs.add(pfName);
        differingMeasures.add(`${pfName}::${mk}`);
        continue;
      }
      if (
        ma.score !== mb.score ||
        (ma.weight ?? null) !== (mb.weight ?? null) ||
        thash(ma.threshold) !== thash(mb.threshold)
      ) {
        differingPFs.add(pfName);
        differingMeasures.add(`${pfName}::${mk}`);
      }
    }
  }

  // ---------- CVEs ----------
  const collectCVEs = (s: ScoresType) => {
    const map = new Map<string, Map<string, number>>(); // cve -> tool -> score
    for (const pf of s.cweProductFactors) {
      for (const cve of pf.cves ?? []) {
        const name = cve.name;
        if (!map.has(name)) map.set(name, new Map());
        const toolMap = map.get(name)!;
        for (const t of cve.byTool ?? []) toolMap.set(t.tool, Number(t.score));
      }
    }
    return map;
  };

  const AC = collectCVEs(a);
  const BC = collectCVEs(b);
  const allCVEs = new Set<string>([...AC.keys(), ...BC.keys()]);
  for (const cveName of allCVEs) {
    const ma = AC.get(cveName);
    const mb = BC.get(cveName);
    if (!ma || !mb) {
      differingCVEs.add(cveName);
      continue;
    }

    const tools = new Set<string>([...ma.keys(), ...mb.keys()]);
    let any = false;
    for (const tool of tools) {
      const sa = ma.get(tool);
      const sb = mb.get(tool);
      if (sa === undefined || sb === undefined || sa !== sb) {
        any = true;
        differingToolScores.add(`${cveName}|${tool}`);
      }
    }
    if (any) differingCVEs.add(cveName);
  }

  return {
    differingPFs,
    differingMeasures,
    differingCVEs,
    differingToolScores,
  };
}
