"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";

export interface ChartDataPoint {
  label: string;
  value: number;
  date?: string;
}

export interface ChartSeries {
  id: string;
  name: string;
  data: ChartDataPoint[];
  color: string;
  secondaryColor?: string;
}

interface InteractiveChartProps {
  series: ChartSeries[];
  title?: string;
  description?: string;
  tooltipFormatter?: (value: number, series: ChartSeries) => string;
  height?: number;
  /** When true, renders a loading skeleton instead of the chart. */
  isLoading?: boolean;
  /** Message shown in the empty state when there is no data to plot. */
  emptyMessage?: string;
}

/**
 * True when there is no plottable data at all: no series, or every series
 * has an empty data array.
 */
function hasNoData(series: ChartSeries[]): boolean {
  return series.length === 0 || series.every((s) => s.data.length === 0);
}

/**
 * A human-readable summary of the chart's series for screen readers, since
 * the bars themselves are decorative/interactive rather than semantic text.
 */
function buildAccessibleSummary(
  series: ChartSeries[],
  formatter: (value: number, series: ChartSeries) => string,
): string {
  return series
    .map((s) => {
      if (s.data.length === 0) {
        return `${s.name}: no data`;
      }
      if (s.data.length === 1) {
        const point = s.data[0];
        return `${s.name}: single value ${formatter(point.value, s)} at ${point.date || point.label}`;
      }
      const first = s.data[0];
      const last = s.data[s.data.length - 1];
      return `${s.name}: ${s.data.length} points, from ${formatter(first.value, s)} at ${first.date || first.label} to ${formatter(last.value, s)} at ${last.date || last.label}`;
    })
    .join(". ");
}

function ChartSkeleton({
  title,
  description,
  height,
}: {
  title?: string;
  description?: string;
  height: number;
}) {
  return (
    <div
      className="space-y-4 rounded-xl border border-white/10 bg-slate-900/50 p-6"
      role="status"
      aria-label={title ? `Loading ${title}` : "Loading chart"}
    >
      {title && (
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-24 bg-white/5" />
        <Skeleton className="h-9 w-24 bg-white/5" />
      </div>
      <Skeleton
        className="w-full rounded-lg bg-slate-950/50"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

export function InteractiveChart({
  series,
  title,
  description,
  tooltipFormatter,
  height = 300,
  isLoading = false,
  emptyMessage = "No data yet. Check back once activity comes in.",
}: InteractiveChartProps) {
  const [visibleSeries, setVisibleSeries] = useState(
    new Set(series.map((s) => s.id)),
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleSeriesVisibility = useCallback((seriesId: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setTooltipPos({ x, y });

      // Calculate which data point we're hovering over
      const chartArea = rect.width * 0.85; // Approximate chart width
      const pointWidth = chartArea / (series[0]?.data.length || 1);
      const index = Math.floor(x / pointWidth);

      setHoveredIndex(Math.max(0, Math.min(index, series[0]?.data.length - 1)));
    },
    [series],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    setTooltipPos(null);
  }, []);

  const defaultFormatter = (value: number) => value.toFixed(2);
  const formatter = tooltipFormatter || defaultFormatter;

  if (isLoading) {
    return (
      <ChartSkeleton title={title} description={description} height={height} />
    );
  }

  if (hasNoData(series)) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
        {title && (
          <div className="mb-2">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            )}
          </div>
        )}
        <EmptyState
          title="No data yet"
          description={emptyMessage}
          className="py-8"
        />
      </div>
    );
  }

  // Calculate chart dimensions. Guard against every visible value being 0
  // or the visible series having only a single point, either of which would
  // otherwise produce a maxValue of 0/-Infinity and break percentage-based
  // scaling (division by zero, NaN heights).
  const visibleValues = series
    .filter((s) => visibleSeries.has(s.id))
    .flatMap((s) => s.data.map((d) => d.value));
  const rawMaxValue = visibleValues.length > 0 ? Math.max(...visibleValues) : 0;
  const maxValue = rawMaxValue > 0 ? rawMaxValue : 1;

  const visibleData = series.filter((s) => visibleSeries.has(s.id));
  const dataPoints = series[0]?.data.length || 0;
  const accessibleSummary = buildAccessibleSummary(series, formatter);

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-slate-900/50 p-6">
      <p className="sr-only">{accessibleSummary}</p>
      {title && (
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {series.map((s) => {
          const isVisible = visibleSeries.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSeriesVisibility(s.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isVisible
                  ? "bg-white/10 text-white"
                  : "bg-white/5 text-slate-500 opacity-50"
              } hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#4FD1C5] focus:ring-offset-2 focus:ring-offset-slate-900`}
              aria-pressed={isVisible}
              title={isVisible ? `Hide ${s.name}` : `Show ${s.name}`}
            >
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative overflow-hidden rounded-lg bg-slate-950/50"
        style={{ height: `${height}px` }}
        role="img"
        aria-label={title}
      >
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 flex h-full flex-col justify-between bg-gradient-to-r from-slate-900 to-transparent px-3 py-2 text-xs text-slate-500">
          <span>{maxValue.toFixed(0)}</span>
          <span>{(maxValue * 0.5).toFixed(0)}</span>
          <span>0</span>
        </div>

        {/* Chart bars/lines */}
        <div className="relative h-full">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-full border-b border-white/5" />
            ))}
          </div>

          {/* Data visualization */}
          <div className="absolute inset-0 flex items-end gap-0.5 overflow-x-auto px-12 py-4">
            {Array.from({ length: dataPoints }).map((_, idx) => {
              const isHovered = hoveredIndex === idx;
              return (
                <div
                  key={idx}
                  className="relative flex flex-1 items-end gap-0.5"
                >
                  {visibleData.map((s) => {
                    const dataPoint = s.data[idx];
                    if (!dataPoint) return null;

                    const heightPercent = (dataPoint.value / maxValue) * 100;

                    return (
                      <div
                        key={s.id}
                        className="relative flex-1"
                        style={{ height: `${heightPercent}%` }}
                      >
                        <div
                          className={`h-full w-full transition-all ${
                            isHovered ? "opacity-100" : "opacity-70"
                          }`}
                          style={{
                            backgroundColor: s.color,
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${s.name}: ${formatter(dataPoint.value, s)} on ${dataPoint.date || dataPoint.label}`}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Tooltip */}
          {hoveredIndex !== null && tooltipPos && visibleData.length > 0 && (
            <div
              className="pointer-events-none absolute rounded-lg border border-white/20 bg-slate-900/95 p-3 shadow-lg"
              style={{
                left: `${Math.min(
                  tooltipPos.x,
                  (containerRef.current?.clientWidth || 0) - 200,
                )}px`,
                top: `${tooltipPos.y - 80}px`,
              }}
              role="tooltip"
            >
              <div className="text-xs text-slate-400">
                {series[0]?.data[hoveredIndex]?.date ||
                  series[0]?.data[hoveredIndex]?.label}
              </div>
              <div className="mt-2 space-y-1">
                {visibleData.map((s) => {
                  const value = s.data[hoveredIndex]?.value;
                  if (value === undefined) return null;
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-white">{s.name}:</span>
                      <span className="font-semibold text-[#4FD1C5]">
                        {formatter(value, s)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* X-axis labels (sample) */}
      <div className="mt-3 flex justify-between text-xs text-slate-500">
        <span>{series[0]?.data[0]?.label}</span>
        <span>{series[0]?.data[Math.floor(dataPoints / 2)]?.label}</span>
        <span>{series[0]?.data[dataPoints - 1]?.label}</span>
      </div>
    </div>
  );
}
