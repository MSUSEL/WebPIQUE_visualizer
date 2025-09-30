// TQI over time chart from up to 12 files
import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
  ReferenceArea,
} from "recharts";
import type { ProjectFileScore } from "../projectPage/ProjectFileLoad";
import "../../styles/TQIPlot.css";

export default function TQIQAPlot({
  files,
  selectedIds = [],
}: {
  files: ProjectFileScore[];
  selectedIds?: string[];
}) {
  // 1) Build rows sorted by date, but give each row an ordinal x index (0..n-1)
  const data = useMemo(() => {
    const sorted = [...files].sort(
      (a, b) =>
        new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
    );
    return sorted.map((f, i) => {
      const dateMs = new Date(f.fileDateISO).getTime();
      const row: any = {
        x: i, // ← ordinal position for equal spacing
        fileId: f.id,
        dateMs,
        fileName: f.fileName,
        TQI: typeof f.tqi === "number" ? f.tqi : null,
      };
      f.aspects.forEach((a) => {
        if (a?.name) row[a.name] = typeof a.value === "number" ? a.value : null;
      });
      return row;
    });
  }, [files]);

  const palette = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
  ];

  const aspectKeys = useMemo(() => {
    const s = new Set<string>();
    data.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (!["x", "dateMs", "fileId", "fileName", "TQI"].includes(k)) s.add(k);
      });
    });
    return Array.from(s);
  }, [data]);

  // 2) Highlight band per selected file using index-based half-step window
  const highlightBands = useMemo(() => {
    if (!data.length || !selectedIds.length) return [];
    const bands: { x1: number; x2: number }[] = [];
    data.forEach((row) => {
      if (selectedIds.includes(row.fileId)) {
        bands.push({ x1: row.x - 0.5, x2: row.x + 0.5 });
      }
    });
    return bands;
  }, [data, selectedIds]);

  const fmt = (v: any) =>
    typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "n/a";

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as any;
    const when = new Date(row.dateMs).toLocaleString();
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,.08)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.fileName}</div>
        <div style={{ opacity: 0.8, marginBottom: 6 }}>{when}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: palette[0],
            }}
          />
          <span>
            <strong>TQI</strong>: {fmt(row.TQI)}
          </span>
        </div>
        {aspectKeys.map((k, i) =>
          row[k] == null ? null : (
            <div
              key={k}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: palette[(i + 1) % palette.length],
                }}
              />
              <span>
                <strong>{k}</strong>: {fmt(row[k])}
              </span>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="tqiqa-chart">
      <div className="tqiqa-row">
        <div className="tqiqa-chart-col">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={data}
              margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              {/* 3) Ordinal X-axis: equally spaced ticks (0..n-1) formatted as dates */}
              <XAxis
                dataKey="x"
                type="number"
                domain={[0, Math.max(data.length - 1, 0)]}
                ticks={data.map((_, i) => i)}
                tickFormatter={(i) =>
                  data[i] ? new Date(data[i].dateMs).toLocaleDateString() : ""
                }
                tick={{ fontSize: 12 }}
                label={{
                  value: "Date",
                  position: "bottom",
                  offset: 4,
                  style: {
                    fontSize: 18,
                    fontWeight: 700,
                    textAnchor: "middle",
                  },
                }}
              />
              <YAxis domain={[0, 1]}>
                <Label
                  value="Score"
                  angle={-90}
                  position="insideLeft"
                  offset={10}
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    textAnchor: "middle",
                  }}
                />
              </YAxis>

              {highlightBands.map((b, i) => (
                <ReferenceArea
                  key={i}
                  x1={b.x1}
                  x2={b.x2}
                  ifOverflow="extendDomain"
                  fill="#60a5fa"
                  fillOpacity={0.58}
                  stroke="#60a5fa"
                  strokeOpacity={0.4}
                />
              ))}

              <Tooltip content={<CustomTooltip />} />

              <Line
                className="line-tqi"
                type="monotone"
                dataKey="TQI"
                stroke={palette[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
              {aspectKeys.map((k, i) => (
                <Line
                  key={k}
                  className={`line-aspect-${i}`}
                  type="monotone"
                  dataKey={k}
                  stroke={palette[(i + 1) % palette.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="tqiqa-legend">
          <div className="legend-item">
            <span className="swatch" style={{ background: palette[0] }} />
            <span>TQI</span>
          </div>
          {aspectKeys.map((k, i) => (
            <div className="legend-item" key={k}>
              <span
                className="swatch"
                style={{ background: palette[(i + 1) % palette.length] }}
              />
              <span>{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
