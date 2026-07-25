"use client";

/**
 * Chart primitives with interactive tooltips and legend toggling.
 * Built with SVG + React — no external chart library needed.
 * Supports light and dark themes via CSS custom properties.
 * Fully keyboard-accessible (tooltips on focus, legend toggles via keyboard).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  data: number[];
}

export interface ChartConfig {
  [key: string]: { label: string; color: string };
}

interface TooltipData {
  x: number | string;
  y: number | string;
  index: number;
  values: { key: string; label: string; color: string; value: number }[];
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ChartContextValue {
  config: ChartConfig;
  hiddenSeries: Set<string>;
  toggleSeries: (key: string) => void;
}

const ChartContext = createContext<ChartContextValue>({
  config: {},
  hiddenSeries: new Set(),
  toggleSeries: () => {},
});

function useChart() {
  return useContext(ChartContext);
}

// ── ChartContainer ────────────────────────────────────────────────────────────

interface ChartContainerProps {
  config: ChartConfig;
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({
  config,
  children,
  className,
}: ChartContainerProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Inject CSS variables for chart colors so they work in both themes
  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    Object.entries(config).forEach(([key, val]) => {
      vars[`--color-${key}`] = val.color;
    });
    return vars;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config, hiddenSeries, toggleSeries }}>
      <div
        className={cn("relative", className)}
        style={cssVars as React.CSSProperties}
      >
        {children}
      </div>
    </ChartContext.Provider>
  );
}

// ── ChartTooltip ──────────────────────────────────────────────────────────────

interface ChartTooltipProps {
  data: TooltipData | null;
  formatter?: (value: number, key: string) => string;
}

export function ChartTooltipContent({ data, formatter }: ChartTooltipProps) {
  if (!data) return null;

  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-50 min-w-[120px] rounded-lg border border-white/10 px-3 py-2 text-xs shadow-xl",
        "bg-[#111726] text-gray-100",
      )}
      style={{
        left: typeof data.x === "string" ? data.x : `${data.x}px`,
        top: typeof data.y === "string" ? data.y : `${data.y}px`,
        transform: "translate(-50%, calc(-100% - 8px))",
      }}
    >
      {data.values.map((v) => (
        <div key={v.key} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: v.color }}
            aria-hidden="true"
          />
          <span className="text-gray-400">{v.label}:</span>
          <span className="font-semibold text-white">
            {formatter ? formatter(v.value, v.key) : v.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── ChartLegend ───────────────────────────────────────────────────────────────

interface ChartLegendProps {
  series: ChartSeries[];
  className?: string;
}

export function ChartLegend({ series, className }: ChartLegendProps) {
  const { hiddenSeries, toggleSeries } = useChart();

  return (
    <div
      role="group"
      aria-label="Chart legend — click or press Space/Enter to toggle series visibility"
      className={cn("flex flex-wrap items-center gap-3", className)}
    >
      {series.map((s) => {
        const hidden = hiddenSeries.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            role="checkbox"
            aria-checked={!hidden}
            aria-label={`${hidden ? "Show" : "Hide"} ${s.label}`}
            onClick={() => toggleSeries(s.key)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                toggleSeries(s.key);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
              "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60",
              hidden
                ? "border-white/10 bg-transparent text-gray-500 opacity-60"
                : "border-white/10 bg-white/5 text-gray-200",
            )}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full transition-opacity"
              style={{ background: hidden ? "#6b7280" : s.color }}
              aria-hidden="true"
            />
            <span className={hidden ? "line-through" : ""}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── LineChart ─────────────────────────────────────────────────────────────────

interface LineChartProps {
  series: ChartSeries[];
  labels: string[];
  height?: number;
  formatter?: (value: number, key: string) => string;
  className?: string;
}

export function LineChart({
  series,
  labels,
  height = 200,
  formatter,
  className,
}: LineChartProps) {
  const { hiddenSeries } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<{
    seriesKey: string;
    index: number;
  } | null>(null);

  const padding = { top: 10, right: 16, bottom: 28, left: 36 };
  const svgWidth = 600; // viewBox — scales responsively
  const svgHeight = height;
  const innerW = svgWidth - padding.left - padding.right;
  const innerH = svgHeight - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.data);
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;
  const range = maxVal - minVal || 1;

  const xStep = labels.length > 1 ? innerW / (labels.length - 1) : innerW;

  function toX(i: number) {
    return padding.left + i * xStep;
  }
  function toY(v: number) {
    return padding.top + innerH - ((v - minVal) / range) * innerH;
  }

  function buildPath(data: number[]) {
    return data
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`,
      )
      .join(" ");
  }

  function showTooltip(svgX: number, svgY: number, index: number) {
    const values = series
      .filter((s) => !hiddenSeries.has(s.key))
      .map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        value: s.data[index] ?? 0,
      }));
    if (!values.length) return;
    setTooltip({ x: svgX, y: svgY, index, values });
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = svgWidth / rect.width;
    const scaleY = svgHeight / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;

    // Snap to nearest x index
    const rawIndex = (svgX - padding.left) / xStep;
    const index = Math.max(
      0,
      Math.min(labels.length - 1, Math.round(rawIndex)),
    );
    showTooltip(svgX, svgY, index);
  }

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full"
        style={{ height }}
        aria-label="Line chart"
        role="img"
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + innerH * (1 - t);
          const val = minVal + range * t;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                x2={padding.left + innerW}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="#6b7280"
              >
                {formatter ? formatter(val, "") : val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={toX(i)}
            y={svgHeight - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
          >
            {label}
          </text>
        ))}

        {/* Series lines */}
        {series.map((s) => {
          if (hiddenSeries.has(s.key)) return null;
          return (
            <g key={s.key}>
              <path
                d={buildPath(s.data)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Data points — keyboard-focusable */}
              {s.data.map((v, i) => {
                const isFocused =
                  focusedPoint?.seriesKey === s.key &&
                  focusedPoint?.index === i;
                return (
                  <circle
                    key={i}
                    cx={toX(i)}
                    cy={toY(v)}
                    r={isFocused || tooltip?.index === i ? 5 : 3}
                    fill={s.color}
                    stroke={isFocused ? "white" : "transparent"}
                    strokeWidth={1.5}
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.label} at ${labels[i]}: ${formatter ? formatter(v, s.key) : v}`}
                    onFocus={(e) => {
                      setFocusedPoint({ seriesKey: s.key, index: i });
                      const svg = svgRef.current;
                      if (!svg) return;
                      const rect = svg.getBoundingClientRect();
                      const scaleX = rect.width / svgWidth;
                      const scaleY = rect.height / svgHeight;
                      showTooltip(
                        toX(i) / scaleX + rect.left - rect.left,
                        toY(v) * scaleY,
                        i,
                      );
                      // Use SVG coordinates relative to container
                      showTooltip(toX(i), toY(v), i);
                    }}
                    onBlur={() => {
                      setFocusedPoint(null);
                      setTooltip(null);
                    }}
                    style={{ cursor: "pointer", outline: "none" }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <ChartTooltipContent
          data={{
            ...tooltip,
            x: `${((tooltip.x as number) / svgWidth) * 100}%`,
            y: `${((tooltip.y as number) / svgHeight) * 100}%`,
          }}
          formatter={formatter}
        />
      )}
    </div>
  );
}

// ── BarChart ──────────────────────────────────────────────────────────────────

interface BarChartProps {
  series: ChartSeries[];
  labels: string[];
  height?: number;
  formatter?: (value: number, key: string) => string;
  className?: string;
}

export function BarChart({
  series,
  labels,
  height = 200,
  formatter,
  className,
}: BarChartProps) {
  const { hiddenSeries } = useChart();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [focusedBar, setFocusedBar] = useState<{
    seriesKey: string;
    index: number;
  } | null>(null);

  const padding = { top: 10, right: 16, bottom: 28, left: 36 };
  const svgWidth = 600;
  const svgHeight = height;
  const innerW = svgWidth - padding.left - padding.right;
  const innerH = svgHeight - padding.top - padding.bottom;

  const visibleSeries = series.filter((s) => !hiddenSeries.has(s.key));
  const allValues = visibleSeries.flatMap((s) => s.data);
  const maxVal = allValues.length ? Math.max(...allValues) : 1;

  const groupW = innerW / labels.length;
  const barW = Math.max(4, (groupW / (visibleSeries.length || 1)) * 0.7);
  const barGap = groupW * 0.05;

  function groupX(i: number) {
    return padding.left + i * groupW;
  }
  function toY(v: number) {
    return padding.top + innerH - (v / maxVal) * innerH;
  }
  function barHeight(v: number) {
    return (v / maxVal) * innerH;
  }

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full"
        style={{ height }}
        aria-label="Bar chart"
        role="img"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y-axis grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + innerH * (1 - t);
          const val = maxVal * t;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                x2={padding.left + innerW}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="#6b7280"
              >
                {formatter ? formatter(val, "") : val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={groupX(i) + groupW / 2}
            y={svgHeight - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
          >
            {label}
          </text>
        ))}

        {/* Bars */}
        {labels.map((_, i) => {
          const gx = groupX(i);
          const totalBarsW =
            visibleSeries.length * barW + (visibleSeries.length - 1) * barGap;
          const startX = gx + (groupW - totalBarsW) / 2;

          return visibleSeries.map((s, si) => {
            const v = s.data[i] ?? 0;
            const x = startX + si * (barW + barGap);
            const y = toY(v);
            const bh = barHeight(v);
            const isFocused =
              focusedBar?.seriesKey === s.key && focusedBar?.index === i;

            return (
              <rect
                key={`${s.key}-${i}`}
                x={x}
                y={y}
                width={barW}
                height={bh}
                rx={2}
                fill={s.color}
                opacity={isFocused || tooltip?.index === i ? 1 : 0.85}
                tabIndex={0}
                role="button"
                aria-label={`${s.label} at ${labels[i]}: ${formatter ? formatter(v, s.key) : v}`}
                onFocus={() => {
                  setFocusedBar({ seriesKey: s.key, index: i });
                  setTooltip({
                    x: x + barW / 2,
                    y,
                    index: i,
                    values: visibleSeries.map((vs) => ({
                      key: vs.key,
                      label: vs.label,
                      color: vs.color,
                      value: vs.data[i] ?? 0,
                    })),
                  });
                }}
                onBlur={() => {
                  setFocusedBar(null);
                  setTooltip(null);
                }}
                onMouseEnter={() => {
                  setTooltip({
                    x: x + barW / 2,
                    y,
                    index: i,
                    values: visibleSeries.map((vs) => ({
                      key: vs.key,
                      label: vs.label,
                      color: vs.color,
                      value: vs.data[i] ?? 0,
                    })),
                  });
                }}
                style={{ cursor: "pointer", outline: "none" }}
              />
            );
          });
        })}
      </svg>

      {tooltip && (
        <ChartTooltipContent
          data={{
            ...tooltip,
            x: `${((tooltip.x as number) / svgWidth) * 100}%`,
            y: `${((tooltip.y as number) / svgHeight) * 100}%`,
          }}
          formatter={formatter}
        />
      )}
    </div>
  );
}
