import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InteractiveChart, ChartSeries } from "./interactive-chart";

const seriesWithData: ChartSeries[] = [
  {
    id: "a",
    name: "Series A",
    color: "#4FD1C5",
    data: [
      { label: "Mon", value: 10, date: "2024-01-01" },
      { label: "Tue", value: 20, date: "2024-01-02" },
      { label: "Wed", value: 15, date: "2024-01-03" },
    ],
  },
];

describe("InteractiveChart", () => {
  it("renders a loading skeleton and no chart content when isLoading is true", () => {
    render(<InteractiveChart series={seriesWithData} title="Volume" isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders an empty state when series is an empty array", () => {
    render(<InteractiveChart series={[]} title="Volume" />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders an empty state when every series has zero data points", () => {
    render(
      <InteractiveChart
        series={[{ id: "a", name: "Series A", color: "#4FD1C5", data: [] }]}
        title="Volume"
      />,
    );

    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders a custom empty message when provided", () => {
    render(
      <InteractiveChart
        series={[]}
        emptyMessage="Predictions will appear here once submitted."
      />,
    );

    expect(
      screen.getByText("Predictions will appear here once submitted."),
    ).toBeInTheDocument();
  });

  it("renders safely for a single-point series without breaking scaling", () => {
    const singlePointSeries: ChartSeries[] = [
      {
        id: "a",
        name: "Series A",
        color: "#4FD1C5",
        data: [{ label: "Mon", value: 42, date: "2024-01-01" }],
      },
    ];

    render(<InteractiveChart series={singlePointSeries} title="Volume" />);

    // The chart renders (not the empty state) and does not produce NaN/Infinity styles.
    expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
    const chart = screen.getByRole("img", { name: "Volume" });
    expect(chart).toBeInTheDocument();
  });

  it("renders safely when every visible value is zero", () => {
    const zeroValueSeries: ChartSeries[] = [
      {
        id: "a",
        name: "Series A",
        color: "#4FD1C5",
        data: [
          { label: "Mon", value: 0 },
          { label: "Tue", value: 0 },
        ],
      },
    ];

    render(<InteractiveChart series={zeroValueSeries} title="Volume" />);

    expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Volume" })).toBeInTheDocument();
  });

  it("renders the chart with data and includes an accessible summary for screen readers", () => {
    render(<InteractiveChart series={seriesWithData} title="Volume" />);

    expect(screen.getByRole("img", { name: "Volume" })).toBeInTheDocument();
    expect(
      screen.getByText(/Series A: 3 points, from 10\.00 at 2024-01-01 to 15\.00 at 2024-01-03/),
    ).toBeInTheDocument();
  });

  it("includes a single-value accessible summary for a single-point series", () => {
    const singlePointSeries: ChartSeries[] = [
      {
        id: "a",
        name: "Series A",
        color: "#4FD1C5",
        data: [{ label: "Mon", value: 42, date: "2024-01-01" }],
      },
    ];

    render(<InteractiveChart series={singlePointSeries} />);

    expect(
      screen.getByText("Series A: single value 42.00 at 2024-01-01"),
    ).toBeInTheDocument();
  });

  it("includes a no-data accessible summary for a series with an empty array alongside a populated one", () => {
    const mixedSeries: ChartSeries[] = [
      ...seriesWithData,
      { id: "b", name: "Series B", color: "#F56565", data: [] },
    ];

    render(<InteractiveChart series={mixedSeries} />);

    expect(screen.getByText(/Series B: no data/)).toBeInTheDocument();
  });
});
