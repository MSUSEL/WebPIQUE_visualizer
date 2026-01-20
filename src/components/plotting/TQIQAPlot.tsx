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

export default function TQIQAPlot({
  files,
  selectedIds = [],
}: {
  files: ProjectFileScore[];
  selectedIds?: string[];
}) {
  // build rows sorted by date, giving each row an ordinal x index (0..n-1)
  const data = useMemo(() => {
    const sorted = [...files].sort(
      (a, b) =>
        new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
    );
    return sorted.map((f, i) => {
      const dateMs = new Date(f.fileDateISO).getTime();
      const row: any = {
        x: i, // ordinal position for equal spacing
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

  const tqiColor = "#1f77b4"; // blue (reserved for TQI)
  const aspectPalette = [
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

  const aspectKeys = useMemo(() => {
    const s = new Set<string>();
    data.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (!["x", "dateMs", "fileId", "fileName", "TQI"].includes(k)) s.add(k);
      });
    });
    return Array.from(s);
  }, [data]);

  // highlight band per selected file using index-based half-step window
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
        className="rounded-md border border-[#ddd] bg-white p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
      >
        <div className="mb-0.5 font-semibold">{row.fileName}</div>
        <div className="mb-1.5 opacity-80">{when}</div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: tqiColor }}
          />
          <span>
            <strong>TQI</strong>: {fmt(row.TQI)}
          </span>
        </div>
        {aspectKeys.map((k, i) =>
          row[k] == null ? null : (
            <div
              key={k}
              className="flex items-center gap-1.5"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: aspectPalette[i % aspectPalette.length],
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
    <div className="w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={data}
              margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              {/* ordinal X-axis: equally spaced ticks (0..n-1) formatted as dates */}
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
                  value: "File Date",
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

              {aspectKeys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={aspectPalette[i % aspectPalette.length]}
                  strokeWidth={2}
                  strokeOpacity={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              <Line
                type="monotone"
                dataKey="TQI"
                stroke={tqiColor}
                strokeWidth={2}
                strokeOpacity={1}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5 text-[14px]">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-3 w-3 rounded-full" style={{ background: tqiColor }} />
            <span>TQI</span>
          </div>
          {aspectKeys.map((k, i) => (
            <div className="flex items-center gap-2 whitespace-nowrap" key={k}>
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  background: aspectPalette[i % aspectPalette.length],
                }}
              />
              <span>{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
