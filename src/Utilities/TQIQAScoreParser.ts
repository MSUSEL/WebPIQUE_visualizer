export interface ParsedScore {
  tqiScore: number;
  aspects: { name: string; value: number }[];
}

// ---------------- Main entry ----------------
export function parseTQIQAScores(json: any): {
  scores: ParsedScore;
} {
  const tqiRaw = json.factors?.tqi;
  const tqiNode = tqiRaw ? Object.values(tqiRaw)[0] : null;
  const qualityAspectsRaw = json.factors?.quality_aspects || {};

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

  return {
    scores: {
      tqiScore,
      aspects,
    },
  };
}
