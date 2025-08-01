import * as React from 'react';
import * as d3 from 'd3';
import { Box } from '@mui/material';

interface Props {
    thresholds: number[];
    score: number;
    cweName?: string;
    setCumulativeProbability?: (value: number) => void;
}



const ProbabilityDensity: React.FC<Props> = ({ thresholds, score, cweName, setCumulativeProbability }) => {
    const ref = React.useRef<SVGSVGElement | null>(null);
    const max = d3.max(thresholds) ?? 1;
    const min = d3.min(thresholds) ?? 0;
    const normalized = thresholds.map(t => (t - min) / (max - min));
    const normalizedScore = score;

    const cumulativeProbability =
        (normalized.filter(t => score >= t).length ?? 0) / (normalized.length || 1);

    if (setCumulativeProbability) {
        setCumulativeProbability(cumulativeProbability);
    }

    React.useEffect(() => {
        if (!ref.current || normalized.length === 0) return;

        const svg = d3.select(ref.current);
        svg.selectAll('*').remove(); // Clear previous

        const width = 450;
        const height = 240;
        const margin = { top: 40, right: 30, bottom: 30, left: 40 };

        const x = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, width - margin.right]);

        const kde = kernelDensityEstimator(kernelEpanechnikov(0.05), x.ticks(40));
        const density = kde(normalized);

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

        // Density area under the curve
        const area = d3.area<[number, number]>()
            .curve(d3.curveBasis)
            .x(d => x(d[0]))
            .y0(y(0))
            .y1(d => y(d[1]));

        svg.append("path")
            .datum(density)
            .attr("fill", "#cce5df")
            .attr("stroke", "#3d90b7")
            .attr("stroke-width", 1.5)
            .attr("d", area(density) ?? "");

        // Vertical score line 
        svg.append("line")
            .attr("x1", x(normalizedScore))
            .attr("x2", x(normalizedScore))
            .attr("y1", margin.top)
            .attr("y2", height - margin.bottom)
            .attr("stroke", "#EA4228")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "4");

        svg.append("text")
            .attr("x", x(normalizedScore) + 6)
            .attr("y", (height + margin.top - margin.bottom) / 2.25)
            .attr("transform", `rotate(-90, ${x(normalizedScore) + 6}, ${(height + margin.top - margin.bottom) / 2})`)
            .attr("fill", "black")
            .style("font-size", "11px")
            .style("text-anchor", "middle")
            .text("CWE Score");

        // Y-axis label
        svg.append("text")
            .attr("text-anchor", "middle")
            .attr("transform", `rotate(-90)`)
            .attr("x", -height / 2)
            .attr("y", margin.left - 30)
            .style("font-size", "14px")
            .text("# of benchmark items");

        // X-axis label
        svg.append("text")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height - 5 + 5)
            .style("font-size", "14px")
            .text("Score");

        // title
        svg.append("text")
            .attr("x", width - 375)
            .attr("y", margin.top - 20)
            .style("font-size", "15px")
            .text(`${cweName ?? 'CWE'} – Benchmark Density Plot`);
    }, [normalized, normalizedScore]);

    return <Box><svg ref={ref} width={450} height={240} /></Box>;
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
