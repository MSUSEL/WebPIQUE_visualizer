// density plot component used in SecurityTabs.tsx
// displays estimated density plot with area under the curve shaded based on measure score
import * as React from "react";
import * as d3 from "d3";
import { Box } from "@mui/material";

interface Props {
  thresholds: number[];
  score?: number;                 // accepts 0..1 or 1..N
  cweName?: string;
  setCumulativeProbability?: (v: number) => void; // 1 - A (legacy output)
  bwFraction?: number;            // bandwidth as fraction of domain (default ~4%)
  bandwidth?: number;             // absolute bandwidth override (in x units)
}

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

    const n = Math.max(1, thresholds.length);
    const indices = d3.range(1, n + 1);

    // accept score as 0..1 OR 1..N (auto-detect)
    const scoreX =
      score > 1
        ? Math.max(1, Math.min(n, score))
        : Math.max(1, Math.min(n, score * n));

    // also a normalized 0..1 target fraction for the capped area
    const target = Math.max(0, Math.min(1, score > 1 ? score / n : score));

    // build weighted sample (repeat index by its count)
    const sample: number[] = [];
    indices.forEach((i, idx) => {
      const c = thresholds[idx] || 0;
      for (let k = 0; k < c; k++) sample.push(i);
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3
      .scaleLinear()
      .domain([1, n])
      .range([margin.left, width - margin.right]);

    // KDE over index space
    const ticks = x.ticks(Math.max(60, n * 4));
    const defaultBwFraction = bwFraction ?? 1 / 25; // ~4% of domain
    const h = bandwidth ?? Math.max(0.5, defaultBwFraction * n);
    const kde = kernelDensityEstimator(kernelEpanechnikov(h), ticks);
    const density: [number, number][] = sample.length
      ? kde(sample)
      : ticks.map((t) => [t, 0] as [number, number]);

    const yMax = d3.max(density, (d) => d[1]) || 1;
    const y = d3.scaleLinear().domain([0, yMax]).nice()
      .range([height - margin.bottom, margin.top]);

    // compute y* so area under min(density, y*) equals `target` ====
    const totalArea = totalDensityArea(density);
    const fracUnderCap = (yCap: number) => {
      if (totalArea <= 0) return 0;
      let A = 0;
      for (let i = 0; i < density.length - 1; i++) {
        const [xa, ya] = density[i];
        const [xb, yb] = density[i + 1];
        const yaC = Math.min(ya, yCap);
        const ybC = Math.min(yb, yCap);
        A += ((xb - xa) * (yaC + ybC)) / 2;
      }
      return A / totalArea;
    };

    // binary search in [0, yMax] for cap level
    let lo = 0, hi = yMax;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (fracUnderCap(mid) < target) lo = mid;
      else hi = mid;
    }
    const yStar = hi;

    // capped curve for the shaded region
    const capped: [number, number][] = density.map(([xx, yy]) => [xx, Math.min(yy, yStar)]);

    // axes + labels
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.min(n, 10)).tickFormat(d3.format("d")));

    svg.append("text")
      .attr("x", width / 2).attr("y", height - 8)
      .attr("text-anchor", "middle").style("font-size", 13)
      .text("Benchmark Item");

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2).attr("y", margin.left - 42)
      .attr("text-anchor", "middle").style("font-size", 13)
      .text("Density");

    svg.append("text")
      .attr("x", width / 2).attr("y", 20)
      .attr("text-anchor", "middle").style("font-size", 13)
      .style("font-weight", "bold")
      .text(`${cweName ?? "CWE"} Benchmark Density Plot`);

    // paths
    const area = d3.area<[number, number]>()
      .curve(d3.curveBasis)
      .x((d) => x(d[0]))
      .y0(y(0))
      .y1((d) => y(d[1]));

    const line = d3.line<[number, number]>()
      .curve(d3.curveBasis)
      .x((d) => x(d[0]))
      .y((d) => y(d[1]));

    // base fill + outline
    svg.append("path").datum(density).attr("fill", "#FFFFFF").attr("d", area);
    svg.append("path").datum(density)
      .attr("fill", "none").attr("stroke", "#2f6fab").attr("stroke-width", 1.8)
      .attr("d", line);

    // shaded region under min(density, y*)
    svg.append("path").datum(capped).attr("fill", "#cdcacaff").attr("d", area);

    // full-width horizontal dashed line at y*
    svg.append("line")
      .attr("x1", x(1)).attr("x2", x(n))
      .attr("y1", y(yStar)).attr("y2", y(yStar))
      .attr("stroke", "#666").attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4").attr("pointer-events", "none");

    // legend
    const legendX = width - margin.right - 220;
    const legendY = margin.top - 15;
    const legend = svg.append("g").attr("transform", `translate(${legendX},${legendY})`);

    const legendText = legend.append("text")
      .attr("x", 26)   // space for the dashed line sample
      .attr("y", 0)
      .style("font-size", 12.5)
      .text(`${cweName ?? "CWE"} score comparison to the benchmark`);

    // wrap to 2–3 lines within a width
    wrapSvgText(legendText, /*maxWidth*/ 230, /*lineHeight px*/ 14, /*maxLines*/ 3);

    // after wrapping, center the dashed sample vertically next to the text block
    const tb = (legendText.node() as SVGTextElement).getBBox();
    const dashY = tb.y + tb.height / 2;

    // dashed “swatch” line
    legend.append("line")
      .attr("x1", 0).attr("x2", 20)
      .attr("y1", dashY).attr("y2", dashY)
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .attr("pointer-events", "none");

    // legacy output: integral up to scoreX (normalized)
    if (setCumulativeProbability) {
      const A = trapezoidArea(density, 1, scoreX); // integrate from x=1 to scoreX
      const oneMinusA = 1 - A;
      setCumulativeProbability(oneMinusA);
    }
  }, [thresholds, score, cweName, setCumulativeProbability, bwFraction, bandwidth]);

  return (
    <Box>
      <svg ref={svgRef} width={560} height={260} />
    </Box>
  );
};

/* ---------- Helpers (top-level; not nested) ---------- */

// piecewise-linear interpolation on density pairs
function interpY(density: [number, number][], xq: number): number {
  if (density.length === 0) return 0;
  if (xq <= density[0][0]) return density[0][1];
  if (xq >= density[density.length - 1][0]) return density[density.length - 1][1];
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

// normalized trapezoid integral of density from xStart..xEnd
function trapezoidArea(density: [number, number][], xStart: number, xEnd: number): number {
  if (density.length === 0 || xEnd <= xStart) return 0;
  const xs = density.map((d) => d[0]);
  const ys = density.map((d) => d[1]);
  const yAt = (xq: number) => interpY(density, xq);

  const lo = Math.max(xStart, xs[0]);
  const hi = Math.min(xEnd, xs[xs.length - 1]);
  if (hi <= lo) return 0;

  const seg: [number, number][] = [[lo, yAt(lo)]];
  for (let i = 0; i < xs.length; i++) if (xs[i] > lo && xs[i] < hi) seg.push([xs[i], ys[i]]);
  seg.push([hi, yAt(hi)]);
  seg.sort((a, b) => a[0] - b[0]);

  let A = 0;
  for (let i = 0; i < seg.length - 1; i++) {
    const [xa, ya] = seg[i];
    const [xb, yb] = seg[i + 1];
    A += ((xb - xa) * (ya + yb)) / 2;
  }

  const totalArea = totalDensityArea(density);
  return totalArea > 0 ? A / totalArea : 0;
}

// total area under density (for normalization)
function totalDensityArea(density: [number, number][]): number {
  let A = 0;
  for (let i = 0; i < density.length - 1; i++) {
    const [xa, ya] = density[i];
    const [xb, yb] = density[i + 1];
    A += ((xb - xa) * (ya + yb)) / 2;
  }
  return A;
}

// KDE helpers
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

function wrapSvgText(
  textSel: d3.Selection<SVGTextElement, unknown, null, undefined>,
  maxWidth: number,
  lineHeightPx = 14,
  maxLines = 3
) {
  textSel.each(function () {
    const text = d3.select(this);
    const words = text.text().split(/\s+/).filter(Boolean);
    text.text(null); // clear the single-line text

    let line: string[] = [];
    let lineNumber = 0;
    const x = +text.attr("x") || 0;
    const y = +text.attr("y") || 0;

    let tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", "0px");

    for (let i = 0; i < words.length; i++) {
      line.push(words[i]);
      tspan.text(line.join(" "));
      if ((tspan.node() as SVGTextElement).getComputedTextLength() > maxWidth) {
        // start a new line with current word
        line.pop();
        tspan.text(line.join(" "));
        line = [words[i]];
        lineNumber += 1;

        if (lineNumber >= maxLines - 1) {
          // last allowed line -> ellipsize if needed
          text.append("tspan")
            .attr("x", x)
            .attr("y", y)
            .attr("dy", `${lineNumber * lineHeightPx}px`)
            .text(line.join(" ") + (i < words.length - 1 ? "…" : ""));
          break;
        } else {
          tspan = text.append("tspan")
            .attr("x", x)
            .attr("y", y)
            .attr("dy", `${lineNumber * lineHeightPx}px`)
            .text(words[i]);
        }
      }
    }
  });
}


export default ProbabilityDensity;

