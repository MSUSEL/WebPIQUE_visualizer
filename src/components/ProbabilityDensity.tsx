import * as React from 'react';
import * as d3 from 'd3';
import { Box } from '@mui/material';

interface Props {
    thresholds: number[];
    score: number;
}

const ProbabilityDensity: React.FC<Props> = ({ thresholds, score }) => {
    const ref = React.useRef<SVGSVGElement | null>(null);

    React.useEffect(() => {
        if (!ref.current || thresholds.length === 0) return;

        const svg = d3.select(ref.current);
        svg.selectAll('*').remove(); // Clear previous

        const width = 400;
        const height = 200;
        const margin = { top: 10, right: 30, bottom: 30, left: 40 };

        const x = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, width - margin.right]);

        const kde = kernelDensityEstimator(kernelEpanechnikov(0.05), x.ticks(40));
        const density = kde(thresholds);

        const y = d3.scaleLinear()
            .domain([0, d3.max(density, d => d[1]) || 1])
            .range([height - margin.bottom, margin.top]);

        // Axes
        svg.append("g")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x));

        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y));

        // Density path
        const line = d3.line<[number, number]>()
            .curve(d3.curveBasis)
            .x(d => x(d[0]))
            .y(d => y(d[1]));

        svg.append("path")
            .datum(density)
            .attr("fill", "#cce5df")
            .attr("stroke", "#3d90b7")
            .attr("stroke-width", 1.5)
            .attr("d", line(density) ?? "");

        // Vertical score line
        svg.append("line")
            .attr("x1", x(score))
            .attr("x2", x(score))
            .attr("y1", margin.top)
            .attr("y2", height - margin.bottom)
            .attr("stroke", "#EA4228")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "4");

        // Y-axis label
        svg.append("text")
            .attr("text-anchor", "middle")
            .attr("transform", `rotate(-90)`)
            .attr("x", -height / 2)
            .attr("y", margin.left - 35)
            .style("font-size", "12px")
            .text("Probability Density");

        // X-axis label
        svg.append("text")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height - 5)
            .style("font-size", "12px")
            .text("CWE Score");

    }, [thresholds, score]);

    return <Box><svg ref={ref} width={400} height={200} /></Box>;
};

// Kernel functions
function kernelDensityEstimator(
    kernel: (v: number) => number,
    x: number[]
): (sample: number[]) => [number, number][] {
    return function (sample: number[]) {
        return x.map((xVal): [number, number] => [xVal, d3.mean(sample, s => kernel(xVal - s)) ?? 0]);
    };
}
function kernelEpanechnikov(k: number) {
    return (v: number) => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
}

export default ProbabilityDensity;
