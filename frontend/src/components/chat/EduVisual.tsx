"use client";

import { useId } from "react";
import type { DiagramSpec, EduVisual as EduVisualData, GraphSpec } from "@/lib/eduVisual";

const SERIES_COLORS = ["#e88b42", "#60a5fa", "#34d399", "#f87171"];
const NAMED_COLORS = {
  orange: "#e88b42",
  blue: "#60a5fa",
  green: "#34d399",
  red: "#f87171",
  purple: "#c084fc",
  gray: "#a1a1aa",
} as const;

function numberLabel(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 4 }).format(value);
}

function axisTicks(min: number, max: number): number[] {
  return Array.from({ length: 6 }, (_, index) => min + ((max - min) * index) / 5);
}

function axisName(label: string, unit?: string): string {
  return unit ? `${label} (${unit})` : label;
}

function GraphFigure({ spec }: { spec: GraphSpec }) {
  const uniqueId = useId().replace(/:/g, "");
  const titleId = `${uniqueId}-title`;
  const descriptionId = `${uniqueId}-description`;
  const width = 720;
  const height = 420;
  const margin = { top: 42, right: 24, bottom: 74, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (value: number) => margin.left + ((value - spec.xAxis.min) / (spec.xAxis.max - spec.xAxis.min)) * plotWidth;
  const y = (value: number) => margin.top + plotHeight - ((value - spec.yAxis.min) / (spec.yAxis.max - spec.yAxis.min)) * plotHeight;
  const xTicks = axisTicks(spec.xAxis.min, spec.xAxis.max);
  const yTicks = axisTicks(spec.yAxis.min, spec.yAxis.max);

  return (
    <figure className="edu-visual my-4 w-full max-w-3xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
      <figcaption id={titleId} className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
        {spec.title ?? "Graphique"}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <desc id={descriptionId}>
          {`${axisName(spec.yAxis.label, spec.yAxis.unit)} en fonction de ${axisName(spec.xAxis.label, spec.xAxis.unit)}.`}
        </desc>
        {xTicks.map((tick, index) => (
          <g key={`x-${index}`}>
            <line x1={x(tick)} y1={margin.top} x2={x(tick)} y2={margin.top + plotHeight} stroke="currentColor" opacity="0.12" />
            <text x={x(tick)} y={margin.top + plotHeight + 20} textAnchor="middle" className="fill-[var(--color-muted)] text-[12px]">
              {numberLabel(tick)}
            </text>
          </g>
        ))}
        {yTicks.map((tick, index) => (
          <g key={`y-${index}`}>
            <line x1={margin.left} y1={y(tick)} x2={margin.left + plotWidth} y2={y(tick)} stroke="currentColor" opacity="0.12" />
            <text x={margin.left - 10} y={y(tick) + 4} textAnchor="end" className="fill-[var(--color-muted)] text-[12px]">
              {numberLabel(tick)}
            </text>
          </g>
        ))}
        <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="currentColor" opacity="0.7" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="currentColor" opacity="0.7" />
        {spec.series.map((series, seriesIndex) => {
          const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
          const points = series.points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
          return (
            <g key={`${series.label}-${seriesIndex}`}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {series.points.map((point, pointIndex) => (
                <circle key={pointIndex} cx={x(point.x)} cy={y(point.y)} r="4" fill={color} stroke="var(--color-surface)" strokeWidth="1.5" />
              ))}
            </g>
          );
        })}
        <text x={margin.left + plotWidth / 2} y={height - 34} textAnchor="middle" className="fill-[var(--color-foreground)] text-[14px]">
          {axisName(spec.xAxis.label, spec.xAxis.unit)}
        </text>
        <text
          x="20"
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 20 ${margin.top + plotHeight / 2})`}
          className="fill-[var(--color-foreground)] text-[14px]"
        >
          {axisName(spec.yAxis.label, spec.yAxis.unit)}
        </text>
        {spec.series.length > 1 &&
          spec.series.map((series, index) => (
            <g key={`legend-${index}`} transform={`translate(${margin.left + index * 150}, ${height - 12})`}>
              <line x1="0" y1="-4" x2="18" y2="-4" stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth="3" />
              <text x="24" y="0" className="fill-[var(--color-muted)] text-[11px]">{series.label}</text>
            </g>
          ))}
      </svg>
    </figure>
  );
}

function DiagramFigure({ spec }: { spec: DiagramSpec }) {
  const uniqueId = useId().replace(/:/g, "");
  const titleId = `${uniqueId}-title`;
  const y = (value: number) => 100 - value;
  const defaultStroke = "#a1a1aa";
  const usedArrowColors = Array.from(
    new Set(spec.elements.filter((element) => element.kind === "arrow").map((element) => element.color ?? "orange"))
  );

  return (
    <figure className="edu-visual my-4 w-full max-w-3xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
      <figcaption id={titleId} className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
        {spec.title ?? "Schéma"}
      </figcaption>
      <svg viewBox="0 0 100 100" className="block h-auto max-h-[420px] w-full" role="img" aria-labelledby={titleId}>
        <defs>
          {usedArrowColors.map((color) => (
            <marker
              key={color}
              id={`${uniqueId}-arrow-${color}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={NAMED_COLORS[color]} />
            </marker>
          ))}
        </defs>
        {spec.elements.map((element, index) => {
          const stroke = element.color ? NAMED_COLORS[element.color] : defaultStroke;
          if (element.kind === "line" || element.kind === "arrow") {
            const x1 = element.x1;
            const y1 = y(element.y1);
            const x2 = element.x2;
            const y2 = y(element.y2);
            const labelOnLeft = x2 > 75;
            const labelX = x2 + (labelOnLeft ? -2 : 2);
            const labelY = y2 < 15 ? y2 + 5 : y2 - 2;
            return (
              <g key={index}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth="1.1"
                  strokeDasharray={element.kind === "line" && element.dashed ? "3 2" : undefined}
                  markerEnd={element.kind === "arrow" ? `url(#${uniqueId}-arrow-${element.color ?? "orange"})` : undefined}
                />
                {element.label && (
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={labelOnLeft ? "end" : "start"}
                    className="fill-[var(--color-foreground)] text-[4px]"
                  >
                    {element.label}
                  </text>
                )}
              </g>
            );
          }

          if (element.kind === "point") {
            return (
              <g key={index}>
                <circle cx={element.x} cy={y(element.y)} r="1.5" fill={stroke} />
                {element.label && <text x={element.x + 2.5} y={y(element.y) - 2.5} className="fill-[var(--color-foreground)] text-[4px]">{element.label}</text>}
              </g>
            );
          }

          return (
            <g key={index}>
              <circle cx={element.x} cy={y(element.y)} r={element.radius} fill="none" stroke={stroke} strokeWidth="1.1" />
              {element.label && <text x={element.x + element.radius + 2} y={y(element.y) - 2} className="fill-[var(--color-foreground)] text-[4px]">{element.label}</text>}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-[var(--color-muted)]">Schéma vectoriel généré dans le chat.</p>
    </figure>
  );
}

export default function EduVisual({ visual }: { visual: EduVisualData }) {
  return visual.kind === "graph" ? <GraphFigure spec={visual.spec} /> : <DiagramFigure spec={visual.spec} />;
}
