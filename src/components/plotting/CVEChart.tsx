//Mini inline chart for two tools on 0–10 scale
import * as React from "react";

//tool name and tool score
export interface CVEByTool {
  tool: string;
  score: number;
}

//CVE info by tool and set height/width parameters
interface Props {
  byTool: CVEByTool[];
  width?: number;
  height?: number;
}

//global color palette for up to 10 tools
const palette = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#7f7f7f", // grey
  "#bcbd22", // yellow-green
  "#17becf", // cyan
];

//assign colors to unique tools
const toolColorRegistry = new Map<string, string>();

function getToolColor(tool: string): string {
  const existing = toolColorRegistry.get(tool);
  if (existing) return existing;
  const color = palette[toolColorRegistry.size % palette.length];
  toolColorRegistry.set(tool, color);
  return color;
}

const formatScore = (score: number) =>
  Number.isFinite(score) ? score.toFixed(2) : "—";

// create line chart
const CVEScoreMiniChart: React.FC<Props> = ({
  byTool,
  width = 260,
  height = 50,
}) => {
  //bounding box dimensions for CVE score line graph
  const pad = 20;
  const chartWidth = width - 80;
  const cx = (s: number) =>
    pad + (Math.max(0, Math.min(10, s)) / 10) * (chartWidth - 2 * pad);
  const cy = height / 2;

  //check if all scores are the same
  // group tools by their numeric score (clamped to 0–10 for safety)
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  const byScore = new Map<number, CVEByTool[]>();
  byTool.forEach((t) => {
    const s = clamp(t.score);
    const arr = byScore.get(s) ?? [];
    arr.push(t);
    byScore.set(s, arr);
  });

  // assign colors: black for any score shared by 2+ tools, otherwise per-tool palette
  const colorMap: Record<string, string> = {};
  byTool.forEach((t) => {
    const s = clamp(t.score);
    const dupCount = byScore.get(s)?.length ?? 0;
    colorMap[t.tool] = dupCount >= 2 ? "#000" : getToolColor(t.tool);
  });

  // legend: one black item per duplicate-score group, plus one item per unique-score tool
  const legendItems: { label: string; color: string }[] = [];

  // add duplicate-score groups (black marker, combined labels)
  for (const [score, group] of byScore) {
    if (group.length >= 2) {
      legendItems.push({
        label: group.map((g) => g.tool).join(", "),
        color: "#000",
      });
    }
  }

  // add unique-score tools (own palette colors)
  byTool.forEach((t) => {
    const s = clamp(t.score);
    if ((byScore.get(s)?.length ?? 0) < 2) {
      legendItems.push({ label: t.tool, color: colorMap[t.tool] });
    }
  });

  const pointItems: {
    score: number;
    color: string;
    label: string;
    display: string;
  }[] = [];

  for (const [score, group] of byScore) {
    if (group.length >= 2) {
      const tools = group.map((g) => g.tool).join(", ");
      const display = formatScore(group[0].score);
      pointItems.push({
        score,
        color: "#000",
        label: `${tools}: ${display}`,
        display,
      });
    } else {
      const t = group[0];
      const display = formatScore(t.score);
      pointItems.push({
        score,
        color: colorMap[t.tool],
        label: `${t.tool}: ${display}`,
        display,
      });
    }
  }

  return (
    <div className="flex items-center">
      <svg
        width={chartWidth}
        height={height}
        role="img"
        aria-label="CVE score by tool"
      >
        {/* axis */}
        <line x1={pad} y1={cy} x2={chartWidth - pad} y2={cy} stroke="#444" />
        <text x={pad} y={cy + 14} fontSize="10">
          0
        </text>
        <text x={chartWidth - pad} y={cy + 14} fontSize="10" textAnchor="end">
          10
        </text>

        {/* points */}
        {pointItems.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <circle cx={cx(p.score)} cy={cy} r={5} fill={p.color}>
              <title>{p.label}</title>
            </circle>
          </g>
        ))}
      </svg>

      {/* legend */}
      <div className="ml-2.5 text-[10px]">
        {legendItems.map((item) => (
          <div key={item.label} className="mb-1 flex items-center">
            <div
              className="mr-1.5 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CVEScoreMiniChart;
