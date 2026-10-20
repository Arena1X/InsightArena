import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders a placeholder for an empty series", () => {
    const { container } = render(<Sparkline data={[]} />);

    expect(screen.getByRole("img", { name: "No data available" })).toBeInTheDocument();
    expect(container.querySelector("line")).toBeInTheDocument();
    expect(container.textContent).not.toContain("NaN");
  });

  it("renders a valid mark for a single-point series", () => {
    const { container } = render(<Sparkline data={[5]} />);

    expect(container.querySelector("circle")).toHaveAttribute("cx", "60");
    expect(container.querySelector("circle")).toHaveAttribute("cy", "12");
    expect(container.textContent).not.toContain("NaN");
  });

  it("renders the expected path for a normal series", () => {
    const { container } = render(<Sparkline data={[0, 1, 0]} />);

    expect(container.querySelector("polyline")).toHaveAttribute("points", "2,22 60,2 118,22");
  });
});