// density plot component used in SecurityTabs.tsx
// displays estimated density plot with area under the curve shaded based on measure score
import * as React from "react";
import * as d3 from "d3";
import { Box } from "@mui/material";

interface Props {
  thresholds: number[];
  score?: number;
  cweName?: string;
  setCumulativeProbability?: (v: number) => void; // 1 - A
  bwFraction?: number;
  bandwidth?: number;
}

/**
 * Single density plot replicating https://github.com/MSUSEL/msusel-benchmark-utilityfunction/blob/master/02_protocals/DensityBasedScoring.ipynb logic:
 * - Build a weighted sample of indices (1..N) using counts in `thresholds`
 * - KDE over index-space
 * - Shade area left of `score` and draw a marker there
 * - Tooltip on marker (SVG <title>)
 */
const ProbabilityDensity: React.FC<Props> = ({
  thresholds,
  score = 0,
  cweName,
  setCumulativeProbability,
  bwFraction,
  bandwidth,
}) => {
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (!svgRef.current || !thresholds || thresholds.length === 0) return;

    const width = 560;
    const height = 260;
    const margin = { top: 60, right: 28, bottom: 40, left: 56 };

    const n = thresholds.length;
    const indices = d3.range(1, n + 1);

    // accept score as 0..1 OR 1..N (auto-detect)
    const scoreX =
      score > 1
        ? Math.max(1, Math.min(n, score))
        : Math.max(1, Math.min(n, score * n));

    // build weighted sample: repeat index by its count
    const sample: number[] = [];
    let total = 0;
    indices.forEach((i, idx) => {
      const c = thresholds[idx] || 0;
      total += c;
      for (let k = 0; k < c; k++) sample.push(i);
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3
      .scaleLinear()
      .domain([1, Math.max(1, n)])
      .range([margin.left, width - margin.right]);

    // KDE setup using
    const ticks = x.ticks(Math.max(60, n * 4));
    const defaultBwFraction = bwFraction ?? 1 / 25; // bandwidth calculated on ~ 4% of domain
    const h = bandwidth ?? Math.max(0.5, defaultBwFraction * n);
    const kde = kernelDensityEstimator(kernelEpanechnikov(h), ticks);
    const density = sample.length
      ? kde(sample)
      : ticks.map((t) => [t, 0] as [number, number]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(density, (d) => d[1]) || 1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // axes and title
    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.min(n, 10)).tickFormat(d3.format("d")));

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 8)
      .attr("text-anchor", "middle")
      .style("font-size", 13)
      .text("Benchmark Item");

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", margin.left - 42)
      .attr("text-anchor", "middle")
      .style("font-size", 13)
      .text("Density");

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - height + 20)
      .attr("text-anchor", "middle")
      .style("font-size", 15)
      .style("font-weight", "bold")
      .text(`${cweName ?? "CWE"} Density Plot`);

    // area + line
    const area = d3
      .area<[number, number]>()
      .curve(d3.curveBasis)
      .x((d) => x(d[0]))
      .y0(y(0))
      .y1((d) => y(d[1]));

    const line = d3
      .line<[number, number]>()
      .curve(d3.curveBasis)
      .x((d) => x(d[0]))
      .y((d) => y(d[1]));

    // density outline
    svg.append("path").datum(density).attr("fill", "#eee").attr("d", area);
    svg
      .append("path")
      .datum(density)
      .attr("fill", "none")
      .attr("stroke", "#2f6fab")
      .attr("stroke-width", 1.8)
      .attr("d", line);

    // shade area left of scoreX
    const densityLeft = clipDensityLeftOf(density, scoreX);
    svg
      .append("path")
      .datum(densityLeft)
      .attr("fill", "#9aa7b1")
      .attr("opacity", 0.55)
      .attr("d", area);

    // marker at score
    const markerY = y(interpY(density, scoreX));
    const marker = svg
      .append("circle")
      .attr("cx", x(scoreX))
      .attr("cy", markerY)
      .attr("r", 4.5)
      .attr("fill", "#d62728");

    // hover tooltip by <title>
    marker
      .append("title")
      .text(
        `${cweName ?? "CWE"} score: ${fmt(score)} (${fmt(scoreX)} on index)`
      );

    // vertical guide at the score
    svg
      .append("line")
      .attr("x1", x(scoreX))
      .attr("x2", x(scoreX))
      .attr("y1", y(0))
      .attr("y2", markerY)
      .attr("stroke", "#777")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");

    // legend
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right - 170}, ${margin.top - 20})`
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

    // compute shaded area A (trapezoid rule) and report 1 - A like the Python
    if (setCumulativeProbability) {
      const A = trapezoidArea(density, 1, scoreX); // integral from x=1 to scoreX
      const oneMinusA = 1 - A;
      setCumulativeProbability(oneMinusA);
    }
  }, [
    thresholds,
    score,
    cweName,
    setCumulativeProbability,
    bwFraction,
    bandwidth,
  ]);

  return (
    <Box>
      <svg ref={svgRef} width={560} height={260} />
    </Box>
  );
};

/* ---------- Helpers ---------- */

// interpolate y at arbitrary x from piecewise density pairs
function interpY(density: [number, number][], xq: number): number {
  if (density.length === 0) return 0;
  if (xq <= density[0][0]) return density[0][1];
  if (xq >= density[density.length - 1][0])
    return density[density.length - 1][1];
  for (let i = 0; i < density.length - 1; i++) {
    const [x0, y0] = density[i];
    const [x1, y1] = density[i + 1];
    if (xq >= x0 && xq <= x1) {
      const t = (xq - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

// clip/extend density to the left of xCut, closing to baseline for fill
function clipDensityLeftOf(
  density: [number, number][],
  xCut: number
): [number, number][] {
  if (density.length === 0) return [];
  const left: [number, number][] = [];
  for (let i = 0; i < density.length; i++) {
    const [x, y] = density[i];
    if (x <= xCut) left.push([x, y]);
    else {
      // insert a linear-interpolated point at xCut
      const [x0, y0] = density[i - 1];
      const [x1, y1] = density[i];
      const t = (xCut - x0) / (x1 - x0);
      const yi = y0 + t * (y1 - y0);
      left.push([xCut, yi]);
      break;
    }
  }
  // close the polygon down to baseline at the cut
  left.push([xCut, 0]);
  // and back to baseline at the start
  const xMin = density[0][0];
  left.unshift([xMin, 0]);
  return left;
}

// numerical integral (trapezoid) of density from xStart to xEnd.
// assumes density x-range spans [1..N] and integrates only the covered part.
function trapezoidArea(
  density: [number, number][],
  xStart: number,
  xEnd: number
): number {
  if (density.length === 0 || xEnd <= xStart) return 0;
  const seg: [number, number][] = [];
  const xs = density.map((d) => d[0]);
  const ys = density.map((d) => d[1]);
  const yAt = (xq: number) => interpY(density, xq);

  const x0 = Math.max(xStart, xs[0]);
  const x1 = Math.min(xEnd, xs[xs.length - 1]);
  if (x1 <= x0) return 0;

  // seed with x0
  seg.push([x0, yAt(x0)]);
  // include all native points strictly inside (x0, x1)
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] > x0 && xs[i] < x1) seg.push([xs[i], ys[i]]);
  }
  // end with x1
  seg.push([x1, yAt(x1)]);
  seg.sort((a, b) => a[0] - b[0]);

  // trapezoid rule
  let A = 0;
  for (let i = 0; i < seg.length - 1; i++) {
    const [xa, ya] = seg[i];
    const [xb, yb] = seg[i + 1];
    A += ((xb - xa) * (ya + yb)) / 2;
  }

  // normalize by total area (integral over whole domain) so A is in [0,1]
  let Aall = 0;
  for (let i = 0; i < density.length - 1; i++) {
    const [xa, ya] = density[i];
    const [xb, yb] = density[i + 1];
    Aall += ((xb - xa) * (ya + yb)) / 2;
  }
  return Aall > 0 ? A / Aall : 0;
}

// univariate KDE - Rosenblatt-Parzen estimator using an Epanechnikov kernel with fixed bandwith
// used on benchmark thresholds (1..n) weighted by counts
function kernelDensityEstimator(kernel: (v: number) => number, xs: number[]) {
  return function (sample: number[]): [number, number][] {
    return xs.map((x) => [x, d3.mean(sample, (s) => kernel(x - s)) ?? 0]);
  };
}
function kernelEpanechnikov(k: number) {
  return (v: number) => {
    v = Math.abs(v / k);
    return v <= 1 ? (0.75 * (1 - v * v)) / k : 0;
  };
}
const fmt = (v: number) =>
  Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(3);

export default ProbabilityDensity;
