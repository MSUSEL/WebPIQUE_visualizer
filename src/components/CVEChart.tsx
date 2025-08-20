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
    "#17becf"  // cyan
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

// create line chart
const CVEScoreMiniChart: React.FC<Props> = ({ byTool, width = 260, height = 50 }) => {
    //bounding box dimensions for CVE score line graph
    const pad = 20;
    const chartWidth = width - 80;
    const cx = (s: number) => pad + (Math.max(0, Math.min(10, s)) / 10) * (chartWidth - 2 * pad);
    const cy = height / 2;

    //extract tool specific scores
    const scores = byTool.map(tool => tool.score);

    //check if all scores are the same
    const allSame = byTool.length > 1 && new Set(scores).size === 1;

    const colorMap: Record<string, string> = {};

    if (allSame) {
        // markers black when all tools have the same score
        byTool.forEach(t => (colorMap[t.tool] = "#000"));
    } else {
        // stable, palette-ordered color per *tool name* across the whole app
        byTool.forEach(t => {
            colorMap[t.tool] = getToolColor(t.tool);
        });
    }

    //build legend items (either "All tools" if scores are the same, or one marker per tool)
    const legendItems = allSame
        ? [{ label: byTool.map(t => t.tool).join(", "), color: "#000" }]
        : byTool.map(t => ({ label: t.tool, color: colorMap[t.tool] }));

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            <svg width={chartWidth} height={height} role="img" aria-label="CVE score by tool">
                {/* axis */}
                <line x1={pad} y1={cy} x2={chartWidth - pad} y2={cy} stroke="#444" />
                <text x={pad} y={cy + 14} fontSize="10">0</text>
                <text x={chartWidth - pad} y={cy + 14} fontSize="10" textAnchor="end">10</text>

                {/* points */}
                {byTool.map((d, i) => (
                    <g key={i}>
                        <circle cx={cx(d.score)} cy={cy} r={5} fill={colorMap[d.tool]} />
                        <text x={cx(d.score)} y={cy - 8} fontSize="10" textAnchor="middle">
                            {Number.isFinite(d.score) ? d.score : "—"}
                        </text>
                    </g>
                ))}
            </svg>

            {/* legend */}
            <div style={{ marginLeft: "10px", fontSize: "10px" }}>
                {legendItems.map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                        <div
                            style={{
                                width: 10,
                                height: 10,
                                backgroundColor: item.color,
                                marginRight: 5,
                                borderRadius: "50%", // round legend marker
                            }}
                        />
                        {item.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CVEScoreMiniChart;