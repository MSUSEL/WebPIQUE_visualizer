// Mini inline chart for two tools on 0–10 scale
import * as React from "react";

export interface CVEByTool {
    tool: string;   // e.g., "Grype", "Trivy"
    score: number;  // 0–10 scale
}

interface Props {
    byTool: CVEByTool[];
    width?: number;   // optional, defaults below
    height?: number;  // optional, defaults below
}

const CVEScoreMiniChart: React.FC<Props> = ({ byTool, width = 260, height = 50 }) => {
    const pad = 20;
    const chartWidth = width - 80;
    const cx = (s: number) => pad + (Math.max(0, Math.min(10, s)) / 10) * (chartWidth - 2 * pad);
    const cy = height / 2;

    // Determine colors: grey if both have same score
    const bothSame = byTool.length === 2 && byTool[0].score === byTool[1].score;
    const colorMap: Record<string, string> = bothSame
        ? { Grype: "#888", Trivy: "#888" }
        : { Grype: "#1f77b4", Trivy: "#ff7f0e" };

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
                {Object.keys(colorMap).map((tool) => (
                    <div key={tool} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                        <div
                            style={{
                                width: 10,
                                height: 10,
                                backgroundColor: colorMap[tool],
                                marginRight: 5,
                                borderRadius: "50%",
                            }}
                        />
                        {tool}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CVEScoreMiniChart;