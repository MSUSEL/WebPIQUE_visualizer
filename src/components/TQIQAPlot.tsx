// TQI over time chart from up to 12 files
import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label,
} from "recharts";
import type { ProjectFileScore } from "./ProjectFileLoad";

export default function TQIQAPlot({ files }: { files: ProjectFileScore[] }) {
  const data = useMemo(() => {
    const sorted = [...files].sort(
      (a, b) =>
        new Date(a.fileDateISO).getTime() - new Date(b.fileDateISO).getTime()
    );
    // Build a row per file: { name, TQI, [aspectName]: value, ... }
    return sorted.map((f) => {
      const row: any = {
        name: f.fileName,
        TQI: typeof f.tqi === "number" ? f.tqi : null,
      };
      f.aspects.forEach((a) => {
        if (a?.name) row[a.name] = typeof a.value === "number" ? a.value : null;
      });
      return row;
    });
  }, [files]);

  // Collect aspect keys (exclude 'name' and 'TQI')
  const aspectKeys = useMemo(() => {
    const s = new Set<string>();
    data.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (k !== "name" && k !== "TQI") s.add(k);
      });
    });
    return Array.from(s);
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis domain={[0, 1]}>
          <Label value="score" angle={-90} position="insideLeft" />
        </YAxis>
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="TQI" strokeWidth={2} dot={false} />
        {aspectKeys.map((k) => (
          <Line key={k} type="monotone" dataKey={k} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
