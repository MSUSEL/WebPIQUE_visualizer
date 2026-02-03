import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import { RelationalExtract } from "../../Utilities/DataParser";

type PF = any;

type Props = {
  aspectName: string;
  aspectPFs: PF[];
  aspectPfIdSet: Set<string>;
  aspectScore?: number | null;
  relational?: RelationalExtract;
};

type Node = {
  key: string;
  text: string;
  type: "qa" | "pf" | "measure" | "diagnostic";
};

type Link = {
  from: string;
  to: string;
};

const isVulnId = (s?: string) => !!(s && /^(?:CVE|GHSA)-/i.test(s));

const parseDiagnosticName = (raw: string) => {
  const name = String(raw ?? "").trim();
  if (!name) return "";
  const match = /^(.*)\s+Diagnostic\s+(.+)$/i.exec(name);
  if (match) return match[1].trim() || name;
  return name;
};

const measureKeyFromLabel = (label: string) => {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  const colon = raw.split(":")[0]?.trim();
  if (colon) return colon;
  const dash = raw.split(" - ")[0]?.trim();
  return dash || raw;
};

const TreeVisual: React.FC<Props> = ({
  aspectName,
  aspectPFs,
  aspectPfIdSet,
  aspectScore,
  relational,
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const wrapText = (text: string, maxWidth: number, font: string) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [text];
    ctx.font = font;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [text];
    const lines: string[] = [];
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const next = `${line} ${words[i]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  };

  const data = useMemo(() => {
    const nodes: Node[] = [];
    const links: Link[] = [];

    if (!relational) return { nodes, links };

    const qaLabel = String(aspectName || "Quality Aspect");
    const qaKey = `qa:${qaLabel}`;
    nodes.push({ key: qaKey, text: qaLabel, type: "qa" });

    const pfNames = new Set<string>();
    (aspectPFs ?? []).forEach((pf) => {
      const name = String(pf?.name ?? pf?.id ?? "").trim();
      if (name) pfNames.add(name);
    });
    const pfList = Array.from(pfNames).sort((a, b) => a.localeCompare(b));
    pfList.forEach((name) => {
      const key = `pf:${name}`;
      nodes.push({ key, text: name, type: "pf" });
      links.push({ from: qaKey, to: key });
    });

    const measureById = new Map<string, string>(
      (relational.measures ?? []).map((m) => [String(m.id), String(m.name)])
    );
    const measureLabelByKey = new Map<string, string>();
    (aspectPFs ?? []).forEach((pf: any) => {
      (pf?.measures ?? []).forEach((m: any) => {
        const label = String(m?.name ?? "").trim();
        if (!label) return;
        const key = measureKeyFromLabel(label).toLowerCase();
        if (!measureLabelByKey.has(key)) measureLabelByKey.set(key, label);
      });
    });

    const measureLabelById = new Map<string, string>();
    (relational.measures ?? []).forEach((m) => {
      const raw = String(m.name ?? m.id ?? "").trim();
      const key = measureKeyFromLabel(raw).toLowerCase();
      const label = measureLabelByKey.get(key) ?? raw;
      measureLabelById.set(String(m.id), label);
    });

    const measureIdsInAspect = new Set<string>();
    (relational.pfMeasures ?? []).forEach((e) => {
      const pfId = String(e.pfId ?? "").trim();
      const mid = String(e.measureId ?? "").trim();
      if (!pfId || !mid) return;
      if (!aspectPfIdSet.has(pfId)) return;
      measureIdsInAspect.add(mid);
    });
    const measureNames = new Set<string>();
    (aspectPFs ?? []).forEach((pf: any) => {
      (pf?.measures ?? []).forEach((m: any) => {
        const label = String(m?.name ?? "").trim();
        if (label) measureNames.add(label);
      });
    });
    if (measureNames.size === 0) {
      measureIdsInAspect.forEach((mid) => {
        const label = measureLabelById.get(mid) ?? measureById.get(mid) ?? mid;
        if (label) measureNames.add(label);
      });
    }
    const measureList = Array.from(measureNames).sort((a, b) =>
      a.localeCompare(b)
    );
    measureList.forEach((name) => {
      nodes.push({ key: `m:${name}`, text: name, type: "measure" });
    });

    const pfIdsByName = new Map<string, Set<string>>();
    (aspectPFs ?? []).forEach((pf) => {
      const name = String(pf?.name ?? pf?.id ?? "").trim();
      if (!name) return;
      const ids = pfIdsByName.get(name) ?? new Set<string>();
      if (pf?.id) ids.add(String(pf.id));
      if (pf?.name) ids.add(String(pf.name));
      (pf?.__ids ?? []).forEach((id: string) => {
        if (id) ids.add(String(id));
      });
      if (ids.size === 0) ids.add(name);
      pfIdsByName.set(name, ids);
    });

    pfIdsByName.forEach((ids, pfName) => {
      const pfObj = (aspectPFs ?? []).find(
        (pf: any) => String(pf?.name ?? "") === pfName
      );
      if (pfObj?.measures?.length) {
        pfObj.measures.forEach((m: any) => {
          const mName = String(m?.name ?? "").trim();
          if (!mName || !measureNames.has(mName)) return;
          links.push({ from: `pf:${pfName}`, to: `m:${mName}` });
        });
        return;
      }

      (relational.pfMeasures ?? []).forEach((e) => {
        const pfId = String(e.pfId ?? "").trim();
        const mid = String(e.measureId ?? "").trim();
        if (!pfId || !mid) return;
        if (!ids.has(pfId)) return;
        const mName =
          measureLabelById.get(mid) ?? measureById.get(mid) ?? mid;
        if (!mName || !measureNames.has(mName)) return;
        links.push({ from: `pf:${pfName}`, to: `m:${mName}` });
      });
    });

    const diagToMeasures = new Map<string, Set<string>>();
    (relational.measureDiagnostics ?? []).forEach((e) => {
      const did = String(e.diagnosticId ?? "").trim();
      const mid = String(e.measureId ?? "").trim();
      if (!did || !mid) return;
      const set = diagToMeasures.get(did) ?? new Set<string>();
      set.add(mid);
      diagToMeasures.set(did, set);
    });

    const groupedCves = new Map<string, Set<string>>();
    (relational.findings ?? []).forEach((f) => {
      const id = String(f?.id ?? "").trim();
      if (!id || !isVulnId(id)) return;
      const diagId = String(f?.diagnosticId ?? "").trim();
      const mids = Array.from(diagToMeasures.get(diagId) ?? []);
      for (const mid of mids) {
        if (!measureIdsInAspect.has(mid)) continue;
        const mName =
          measureLabelById.get(mid) ?? measureById.get(mid) ?? mid;
        if (!mName || !measureNames.has(mName)) continue;
        const set = groupedCves.get(id) ?? new Set<string>();
        set.add(mName);
        groupedCves.set(id, set);
      }
    });

    if (groupedCves.size > 0) {
      groupedCves.forEach((mset, id) => {
        nodes.push({ key: `d:${id}`, text: id, type: "diagnostic" });
        mset.forEach((mName) => {
          links.push({ from: `m:${mName}`, to: `d:${id}` });
        });
      });
    } else {
      const diagHasFindings = new Set<string>();
      (relational.findings ?? []).forEach((f) => {
        const diagId = String(f?.diagnosticId ?? "").trim();
        if (diagId) diagHasFindings.add(diagId);
      });

      const diagGroups = new Map<string, Set<string>>();
      (relational.diagnostics ?? []).forEach((d) => {
        const diagId = String(d?.id ?? "").trim();
        if (!diagId) return;
        if (diagHasFindings.has(diagId)) return;
        const diagName = parseDiagnosticName(String(d?.name ?? d?.id ?? ""));
        if (!diagName || isVulnId(diagName) || isVulnId(diagId)) return;
        const mids = Array.from(diagToMeasures.get(diagId) ?? []);
        for (const mid of mids) {
          if (!measureIdsInAspect.has(mid)) continue;
          const mName =
            measureLabelById.get(mid) ?? measureById.get(mid) ?? mid;
          if (!mName || !measureNames.has(mName)) continue;
          const set = diagGroups.get(diagName) ?? new Set<string>();
          set.add(mName);
          diagGroups.set(diagName, set);
        }
      });

      diagGroups.forEach((mset, name) => {
        nodes.push({ key: `d:${name}`, text: name, type: "diagnostic" });
        mset.forEach((mName) => {
          links.push({ from: `m:${mName}`, to: `d:${name}` });
        });
      });
    }

    return { nodes, links };
  }, [aspectName, aspectPFs, aspectPfIdSet, relational]);

  const parentsByKey = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.links.forEach((link) => {
      const parents = map.get(link.to) ?? new Set<string>();
      parents.add(link.from);
      map.set(link.to, parents);
    });
    return map;
  }, [data.links]);

  const details = useMemo(() => {
    if (!activeKey || !relational) return null;
    const describeNode = (nodeKey: string) => {
      const splitAt = nodeKey.indexOf(":");
      const type = splitAt === -1 ? "" : nodeKey.slice(0, splitAt);
      const name = splitAt === -1 ? "" : nodeKey.slice(splitAt + 1).trim();
      if (!name) return null;

      if (type === "qa") {
        return {
          title: "Quality Aspect",
          lines: [
            `Name: ${aspectName}`,
            `Score: ${
              typeof aspectScore === "number" ? aspectScore.toFixed(4) : "N/A"
            }`,
          ],
        };
      }

      if (type === "pf") {
        const pf =
          (relational.productFactors ?? []).find((p) => p.name === name) ??
          (aspectPFs ?? []).find((p: any) => String(p?.name ?? "") === name);
        return {
          title: "Product Factor",
          lines: [
            `Name: ${name}`,
            `Score: ${
              typeof (pf as any)?.value === "number"
                ? Number((pf as any).value).toFixed(4)
                : "N/A"
            }`,
            `Description: ${String((pf as any)?.description ?? "--")}`,
          ],
        };
      }

      if (type === "measure" || type === "m") {
        const normKey = measureKeyFromLabel(name).toLowerCase();
        const pfMeasureMatches = (aspectPFs ?? [])
          .flatMap((pf: any) =>
            (pf?.measures ?? []).map((m: any) => ({
              pfName: String(pf?.name ?? ""),
              score: m?.score,
              description: m?.description,
              weight: m?.weight,
              name: String(m?.name ?? ""),
            }))
          )
          .filter((m: any) => measureKeyFromLabel(String(m?.name ?? "")).toLowerCase() === normKey);
        const pfMeasure = pfMeasureMatches[0] ?? null;
        const relationalMeasure =
          (relational.measures ?? []).find(
            (m) => measureKeyFromLabel(String(m?.name ?? m?.id ?? "")).toLowerCase() === normKey
          ) ?? null;
        const measure = pfMeasure ?? relationalMeasure ?? null;
        const measureId = relationalMeasure?.id ?? null;
        const pfNameById = new Map<string, string>(
          (relational.productFactors ?? []).map((p) => [String(p.id), String(p.name)])
        );
        const weightLines = pfMeasureMatches
          .filter((m) => typeof m?.weight === "number")
          .map((m) => `${m.pfName}: ${Number(m.weight).toFixed(4)}`);
        const relWeights = (relational.pfMeasures ?? [])
          .filter((e) => measureId && String(e.measureId) === String(measureId))
          .map((e) => {
            const pfName = pfNameById.get(String(e.pfId)) ?? String(e.pfId);
            const w = typeof e.weight === "number" ? e.weight : 0;
            return `${pfName}: ${w.toFixed(4)}`;
          });
        return {
          title: "Measure",
          lines: [
            `Name: ${name}`,
            `Score: ${
              typeof (pfMeasure as any)?.score === "number"
                ? Number((pfMeasure as any).score).toFixed(4)
                : typeof (relationalMeasure as any)?.value === "number"
                ? Number((relationalMeasure as any).value).toFixed(4)
                : typeof (measure as any)?.score === "number"
                ? Number((measure as any).score).toFixed(4)
                : "N/A"
            }`,
            ...(pfMeasure?.description || relationalMeasure?.description
              ? [
                  `Description: ${String(
                    (pfMeasure?.description ?? relationalMeasure?.description) || "--"
                  )}`,
                ]
              : []),
            ...(weightLines.length || relWeights.length
              ? [
                  `Weight: ${(weightLines.length ? weightLines : relWeights).join(", ")}`,
                ]
              : []),
          ],
        };
      }

      if (type === "d") {
        if (isVulnId(name)) {
          const related = (relational.findings ?? []).filter(
            (f) => String(f?.id ?? "").trim() === name
          );
          const toolScores = new Map<string, number | null>();
          let description = "";
          related.forEach((f) => {
            if (!description && f?.description) description = String(f.description);
            (f.byTool ?? []).forEach((t: any) => {
              const tool = String(t?.tool ?? "").trim();
              if (!tool) return;
              const score = typeof t?.score === "number" ? t.score : null;
              if (!toolScores.has(tool)) toolScores.set(tool, score);
            });
          });
          const tools = Array.from(toolScores.entries())
            .map(([tool, score]) =>
              score == null ? tool : `${tool} (score: ${score})`
            )
            .sort((a, b) => a.localeCompare(b));
          return {
            title: "Diagnostic Finding",
            lines: [
              `Name: ${name}`,
              `Findings from Tool(s): ${tools.length ? tools.join(", ") : "--"}`,
              `Description: ${description || "--"}`,
            ],
          };
        }

        const matching = (relational.diagnostics ?? []).filter((d) => {
          const base = parseDiagnosticName(String(d?.name ?? d?.id ?? ""));
          return base === name;
        });
        let description = "";
        const tools = new Map<string, number | null>();
        matching.forEach((d) => {
          if (!description && d?.description) description = String(d.description);
          const tool = String(d?.toolName ?? "").trim();
          const score = typeof d?.value === "number" ? d.value : null;
          if (tool && !tools.has(tool)) tools.set(tool, score);
        });
        const toolList = Array.from(tools.entries())
          .map(([tool, score]) =>
            score == null ? tool : `${tool} (score: ${score})`
          )
          .sort((a, b) => a.localeCompare(b));
        return {
          title: "Diagnostic Finding",
          lines: [
            `Name: ${name}`,
            `Findings from Tool(s): ${toolList.length ? toolList.join(", ") : "--"}`,
            `Description: ${description || "--"}`,
          ],
        };
      }

      return null;
    };

    const activeNodes = new Set<string>();
    const stack = [activeKey];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (activeNodes.has(cur)) continue;
      activeNodes.add(cur);
      const parents = parentsByKey.get(cur);
      if (!parents) continue;
      parents.forEach((p) => {
        if (!activeNodes.has(p)) stack.push(p);
      });
    }

    const order = ["qa", "pf", "m", "d"] as const;
    const sections: { title: string; lines: string[] }[] = [];
    order.forEach((t) => {
      const keys = Array.from(activeNodes).filter((k) => k.startsWith(`${t}:`));
      keys.sort((a, b) => a.localeCompare(b));
      keys.forEach((k) => {
        const info = describeNode(k);
        if (info) sections.push(info);
      });
    });

    return sections.length ? sections : null;
  }, [
    activeKey,
    relational,
    aspectName,
    aspectScore,
    aspectPFs,
    parentsByKey,
  ]);

  const activeLinkKeys = useMemo(() => {
    const out = new Set<string>();
    if (!activeKey) return out;
    const stack = [activeKey];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop() as string;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const parents = parentsByKey.get(cur);
      if (!parents || parents.size === 0) continue;
      for (const parent of parents) {
        out.add(`${parent}=>${cur}`);
        if (!visited.has(parent)) stack.push(parent);
      }
    }
    return out;
  }, [activeKey, parentsByKey]);

  const layout = useMemo(() => {
    const columns = [
      { type: "qa" as const, title: "Quality Aspect" },
      { type: "pf" as const, title: "Product Factors" },
      { type: "measure" as const, title: "Measures" },
      { type: "diagnostic" as const, title: "Diagnostic Findings" },
    ];

    const nodeWidth = 190;
    const colGap = 80;
    const rowGap = 12;
    const padLeft = 24;
    const padTop = 18;
    const labelHeight = 18;
    const padX = 8;
    const padY = 8;
    const fontSize = 12;
    const lineHeight = 14;

    const positions = new Map<string, { x: number; y: number }>();
    const sizes = new Map<string, { width: number; height: number; lines: string[] }>();
    let maxY = 0;
    let maxX = 0;

    data.nodes.forEach((n) => {
      const font =
        n.type === "qa" ? "700 13px Arial, sans-serif" : "600 12px Arial, sans-serif";
      const lines = wrapText(n.text, nodeWidth - padX * 2, font);
      const height = padY * 2 + lines.length * lineHeight;
      sizes.set(n.key, { width: nodeWidth, height, lines });
    });

    columns.forEach((col, colIdx) => {
      const nodes = data.nodes
        .filter((n) => n.type === col.type)
        .sort((a, b) => a.text.localeCompare(b.text));
      nodes.forEach((n, idx) => {
        const size = sizes.get(n.key);
        const nodeHeight = size?.height ?? 36;
        const x = padLeft + colIdx * (nodeWidth + colGap);
        const prev = nodes.slice(0, idx).reduce((sum, nn) => {
          const h = sizes.get(nn.key)?.height ?? 36;
          return sum + h + rowGap;
        }, 0);
        const y = padTop + labelHeight + prev;
        positions.set(n.key, { x, y });
        maxY = Math.max(maxY, y + nodeHeight);
        maxX = Math.max(maxX, x + nodeWidth);
      });
    });

    return {
      columns,
      positions,
      sizes,
      nodeWidth,
      width: maxX + padLeft,
      height: Math.max(maxY + padTop, 240),
      padLeft,
      padTop,
      labelHeight,
      colGap,
      lineHeight,
      padY,
    };
  }, [data]);

  if (!relational) {
    return (
      <div className="px-4 py-3 text-[15px]">
        Upload a file to see the hierarchical tree view.
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-[15px] text-[#555]">
        Click a node to reveal its branch to the Quality Aspect. Click again to hide.
      </div>
      <div className={`flex gap-4 ${activeKey ? "items-stretch" : ""}`}>
        <div
          className={`h-[640px] rounded-lg border border-[#d0d0d0] bg-white ${
            activeKey ? "w-3/4" : "w-full"
          }`}
        >
          <div className="h-full w-full overflow-auto">
            <svg width={layout.width} height={layout.height}>
              {layout.columns.map((col, idx) => {
                const x =
                  layout.padLeft + idx * (layout.nodeWidth + layout.colGap) + 2;
                const y = layout.padTop;
                return (
                  <text
                    key={col.title}
                    x={x}
                    y={y}
                    fontFamily="Arial, sans-serif"
                    fontSize={13}
                    fontWeight={700}
                    fill="#333"
                  >
                    {col.title}
                  </text>
                );
              })}

              {data.links.map((link) => {
                const from = layout.positions.get(link.from);
                const to = layout.positions.get(link.to);
                if (!from || !to) return null;
                const fromSize = layout.sizes.get(link.from);
                const toSize = layout.sizes.get(link.to);
                const fromH = fromSize?.height ?? 36;
                const toH = toSize?.height ?? 36;
                const source: [number, number] = [
                  from.x + layout.nodeWidth,
                  from.y + fromH / 2,
                ];
                const target: [number, number] = [
                  to.x,
                  to.y + toH / 2,
                ];
                const path = d3.linkHorizontal()({ source, target } as any) as string;
                const active = activeLinkKeys.has(`${link.from}=>${link.to}`);
                return (
                  <path
                    key={`${link.from}=>${link.to}`}
                    d={path}
                    fill="none"
                    stroke="#111"
                    strokeWidth={1.5}
                    opacity={active ? 0.9 : 0}
                  />
                );
              })}

              {data.nodes.map((node) => {
                const pos = layout.positions.get(node.key);
                const size = layout.sizes.get(node.key);
                if (!pos) return null;
                const height = size?.height ?? 36;
                const lines = size?.lines ?? [node.text];
                const fill =
                  node.type === "qa"
                    ? "#111"
                    : node.type === "pf"
                    ? "#f5f5f5"
                    : node.type === "measure"
                    ? "#fff2cc"
                    : "#e7f4ff";
                const stroke = node.type === "qa" ? "#111" : "#2b2b2b";
                const textColor = node.type === "qa" ? "#fefefe" : "#111";
                return (
                  <g
                    key={node.key}
                    transform={`translate(${pos.x},${pos.y})`}
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      setActiveKey((prev) => (prev === node.key ? null : node.key))
                    }
                  >
                    <rect
                      width={layout.nodeWidth}
                      height={height}
                      rx={6}
                      ry={6}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                    />
                    <text
                      x={layout.nodeWidth / 2}
                      y={layout.padY + layout.lineHeight / 2}
                      fill={textColor}
                      fontFamily="Arial, sans-serif"
                      fontSize={12}
                      fontWeight={node.type === "qa" ? 700 : 600}
                      textAnchor="middle"
                    >
                      {lines.map((line, idx) => (
                        <tspan
                          key={`${node.key}-line-${idx}`}
                          x={layout.nodeWidth / 2}
                          dy={idx === 0 ? 0 : layout.lineHeight}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {activeKey ? (
          <div className="h-[640px] w-1/4 overflow-y-auto rounded-lg border border-[#d0d0d0] bg-white p-3">
            <h4 className="mb-2 text-[18px] font-semibold">Details</h4>
            {details ? (
              <div className="text-[14px] text-[#333]">
                {details.map((section, idx) => (
                  <div key={`${section.title}-${idx}`}>
                    {idx > 0 ? <hr className="my-2 border-[#ddd]" /> : null}
                    <div className="mb-1 font-semibold">{section.title}</div>
                    <ul className="m-0 list-disc pl-5">
                      {section.lines.map((line, lineIdx) => (
                        <li key={`${section.title}-${idx}-${lineIdx}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[14px] text-[#333]">No details available.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TreeVisual;
