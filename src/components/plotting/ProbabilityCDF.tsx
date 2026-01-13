// CDF plot to compare score to benchmark
import * as React from "react";
import * as d3 from "d3";
import { Box } from "@mui/material";

interface Props {
  thresholds: number[]; // counts per benchmark item (length = N)
  percentile: number; // your existing measure.score in [0,1]
  cweName?: string;
  bwFraction?: number; // optional: match your density’s bwFraction
  bandwidth?: number; // optional: override bandwidth
}

const ProbabilityCDF: React.FC<Props> = ({
  thresholds,
  percentile,
  cweName,
  bwFraction,
  bandwidth,
}) => {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const width = 420;
  const height = 200;

  React.useEffect(() => {
    if (!svgRef.current || !thresholds || thresholds.length === 0) return;

    const margin = { top: 60, right: 28, bottom: 40, left: 56 };

    const N = thresholds.length;
    const indices = d3.range(1, N + 1);

    // Build weighted sample from thresholds (same as your density)
    const sample: number[] = [];
    indices.forEach((i, idx) => {
      const c = thresholds[idx] || 0;
      for (let k = 0; k < c; k++) sample.push(i);
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3
      .scaleLinear()
      .domain([1, Math.max(1, N)])
      .range([margin.left, width - margin.right]);

    // KDE → density on a fine grid
    const ticks = x.ticks(Math.max(60, N * 4));
    const defaultBwFraction = bwFraction ?? 1 / 25;
    const h = bandwidth ?? Math.max(0.5, defaultBwFraction * N);
    const kde = kernelDensityEstimator(kernelEpanechnikov(h), ticks);
    const density: [number, number][] = sample.length
      ? kde(sample)
      : ticks.map((t) => [t, 0] as [number, number]);

    // Normalize area to 1, then cumulatively integrate to a CDF
    const totalArea = trapz(density);
    let acc = 0;
    const cdf: [number, number][] = density.map((d, i, arr) => {
      if (i > 0) acc += trapz([arr[i - 1], d]);
      const y = totalArea > 0 ? acc / totalArea : 0;
      return [d[0], y];
    });

    // === Key bit: use your precomputed percentile ===
    const p = clamp01(percentile);
    const x_p = quantileAt(cdf, p); // invert CDF to find the quantile

    const y = d3
      .scaleLinear()
      .domain([0, 1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.min(N, 10)).tickFormat(d3.format("d")));

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 8)
      .attr("text-anchor", "middle")
      .style("font-size", 13)
      .text("Ordered Benchmark Item (Rank)");

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", margin.left - 42)
      .attr("text-anchor", "middle")
      .style("font-size", 13)
      .text("Cumulative Probability (ECDF)");

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 22)
      .attr("text-anchor", "middle")
      .style("font-size", 13)
      .style("font-weight", "bold")
      .text(`Probability of Measure Being Better Than Benchmark`);

    // CDF curve
    const line = d3
      .line<[number, number]>()
      .curve(d3.curveBasis)
      .x((d) => x(d[0]))
      .y((d) => y(d[1]));

    svg
      .append("path")
      .datum(cdf)
      .attr("fill", "none")
      .attr("stroke", "#2f6fab")
      .attr("stroke-width", 1.8)
      .attr("d", line);

    // Shade under CDF up to the quantile x_p (uses your p; no recompute)
    const leftCdf = clipLeftOf(cdf, x_p);
    const area = d3
      .area<[number, number]>()
      .curve(d3.curveBasis)
      .x((d) => x(d[0]))
      .y0(y(0))
      .y1((d) => y(d[1]));

    svg.append("path").datum(leftCdf).attr("fill", "#cdcacaff").attr("d", area);

    // Marker at (x_p, p)
    svg
      .append("circle")
      .attr("cx", x(x_p))
      .attr("cy", y(p))
      .attr("r", 4)
      .attr("fill", "#d62728")
      .append("title")
      .text(`Percentile = ${(p * 100).toFixed(2)}%`);

    // vertical guide under the red marker (light gray, dashed)
    svg
      .append("line")
      .attr("x1", x(x_p))
      .attr("x2", x(x_p))
      .attr("y1", y(0))
      .attr("y2", y(p))
      .attr("stroke", "#5e5d5dff")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .attr("pointer-events", "none");

    // horizontal guide aligned with the red marker (light gray, dashed)
    svg
      .append("line")
      .attr("x1", margin.left)
      .attr("x2", x(x_p))
      .attr("y1", y(p))
      .attr("y2", y(p))
      .attr("stroke", "#5e5d5dff")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .attr("pointer-events", "none");

    // legend
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right - 170}, ${margin.top - 15})`
      );
    legend
      .append("circle")
      .attr("r", 5)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", "#d62728");
    legend
      .append("text")
      .attr("x", 12)
      .attr("y", 4)
      .style("font-size", 12.5)
      .text(`${cweName ?? "CWE"} score`);
  }, [thresholds, percentile, cweName, bwFraction, bandwidth]);

  return (
    <Box className="w-full">
      <svg
        ref={svgRef}
        className="block h-auto w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      />
    </Box>
  );
};

/* ----------------- helpers ----------------- */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function quantileAt(cdf: [number, number][], p: number): number {
  if (!cdf.length) return 1;
  if (p <= cdf[0][1]) return cdf[0][0];
  if (p >= cdf[cdf.length - 1][1]) return cdf[cdf.length - 1][0];
  for (let i = 0; i < cdf.length - 1; i++) {
    const [x0, y0] = cdf[i];
    const [x1, y1] = cdf[i + 1];
    if (p >= y0 && p <= y1) {
      const t = (p - y0) / (y1 - y0 || 1);
      return x0 + t * (x1 - x0);
    }
  }
  return cdf[cdf.length - 1][0];
}

function clipLeftOf(
  curve: [number, number][],
  xCut: number
): [number, number][] {
  if (!curve.length) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < curve.length; i++) {
    const [x, y] = curve[i];
    if (x <= xCut) out.push([x, y]);
    else {
      const [x0, y0] = curve[i - 1];
      const [x1, y1] = curve[i];
      const t = (xCut - x0) / (x1 - x0);
      const yi = y0 + t * (y1 - y0);
      out.push([xCut, yi]);
      break;
    }
  }
  // close polygon to baseline
  const xMin = curve[0][0];
  out.push([xCut, 0]);
  out.unshift([xMin, 0]);
  return out;
}

function trapz(seg: [number, number][]): number {
  let A = 0;
  for (let i = 1; i < seg.length; i++) {
    const [xa, ya] = seg[i - 1];
    const [xb, yb] = seg[i];
    A += ((xb - xa) * (ya + yb)) / 2;
  }
  return A;
}

function kernelDensityEstimator(kernel: (v: number) => number, xs: number[]) {
  return (sample: number[]): [number, number][] =>
    xs.map((x) => [x, d3.mean(sample, (s) => kernel(x - s)) ?? 0]);
}
function kernelEpanechnikov(k: number) {
  return (v: number) => {
    v = Math.abs(v / k);
    return v <= 1 ? (0.75 * (1 - v * v)) / k : 0;
  };
}

export default ProbabilityCDF;
