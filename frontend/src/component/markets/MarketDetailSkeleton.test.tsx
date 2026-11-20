import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketDetailSkeleton } from "./MarketDetailSkeleton";

describe("MarketDetailSkeleton", () => {
  it("renders with proper ARIA labels for screen readers", () => {
    render(<MarketDetailSkeleton />);

    expect(
      screen.getByRole("status", { name: "Loading market details" })
    ).toBeInTheDocument();
    expect(screen.getByText("Loading market details...")).toBeInTheDocument();
  });

  it("renders all major layout sections matching the actual market detail page", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Check for main container with correct styling
    const mainContainer = container.querySelector(
      ".min-h-screen.bg-gradient-to-br.from-gray-900"
    );
    expect(mainContainer).toBeInTheDocument();

    // Check for back button skeleton
    const backButtonSkeleton = container.querySelector(".mb-6.h-5.w-32");
    expect(backButtonSkeleton).toBeInTheDocument();

    // Check for main card with border and background
    const mainCard = container.querySelector(
      ".rounded-2xl.border.border-white\\/10.bg-slate-900\\/80"
    );
    expect(mainCard).toBeInTheDocument();
  });

  it("renders three stat cards in a responsive grid", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Stats grid container
    const statsGrid = container.querySelector(
      ".grid.grid-cols-1.gap-8.md\\:grid-cols-3"
    );
    expect(statsGrid).toBeInTheDocument();

    // Three stat card skeletons
    const statCards = container.querySelectorAll(
      ".rounded-xl.border.border-white\\/10.bg-white\\/5.p-5.text-center"
    );
    expect(statCards).toHaveLength(3);
  });

  it("renders dispute panel skeleton section", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Dispute panel with specific styling
    const disputePanel = container.querySelector(
      ".rounded-2xl.border.border-white\\/10.bg-black\\/20.p-4"
    );
    expect(disputePanel).toBeInTheDocument();
  });

  it("renders price history chart skeleton with header and range selector", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Chart header section with flex layout
    const chartHeader = container.querySelector(
      ".flex.items-center.justify-between"
    );
    expect(chartHeader).toBeInTheDocument();

    // Range selector with 4 buttons (1H, 1D, 1W, All)
    const rangeButtons = container.querySelectorAll(
      ".flex.gap-1.rounded-lg.border.border-white\\/10 [data-slot='skeleton']"
    );
    expect(rangeButtons.length).toBeGreaterThanOrEqual(4);

    // Chart canvas skeleton
    const chartCanvas = container.querySelector(".h-80.w-full.rounded-lg");
    expect(chartCanvas).toBeInTheDocument();
  });

  it("renders header section with title, badges, and predict button skeletons", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Title skeleton
    const titleSkeleton = container.querySelector(".h-8.w-full.max-w-xl");
    expect(titleSkeleton).toBeInTheDocument();

    // Badges in flex row
    const badgesRow = container.querySelector(
      ".flex.flex-wrap.items-center.gap-3"
    );
    expect(badgesRow).toBeInTheDocument();

    // Predict button skeleton with orange accent
    const predictButton = container.querySelector(
      ".rounded-full.bg-orange-500\\/30"
    );
    expect(predictButton).toBeInTheDocument();
  });

  it("renders description skeleton lines", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Description container
    const descriptionContainer = container.querySelector(".mt-6.space-y-2");
    expect(descriptionContainer).toBeInTheDocument();

    // Two description line skeletons
    const descriptionLines =
      descriptionContainer?.querySelectorAll("[data-slot='skeleton']");
    expect(descriptionLines?.length).toBeGreaterThanOrEqual(2);
  });

  it("applies motion-reduce class to all skeleton elements for accessibility", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // All skeleton elements should have motion-reduce:animate-none
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);

    skeletons.forEach((skeleton) => {
      expect(skeleton.classList.contains("motion-reduce:animate-none")).toBe(
        true
      );
    });
  });

  it("maintains responsive layout classes for mobile and desktop", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Main padding responsive classes
    const mainContainer = container.querySelector(".p-6.md\\:p-10");
    expect(mainContainer).toBeInTheDocument();

    // Stats grid responsive columns
    const statsGrid = container.querySelector(
      ".grid-cols-1.md\\:grid-cols-3"
    );
    expect(statsGrid).toBeInTheDocument();
  });

  it("uses consistent color scheme matching the design system", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Check for white/slate skeleton backgrounds
    const whiteSkeletons = container.querySelectorAll(
      "[class*='bg-white/']"
    );
    expect(whiteSkeletons.length).toBeGreaterThan(0);

    // Check for slate backgrounds
    const slateSkeletons = container.querySelectorAll(
      "[class*='bg-slate-']"
    );
    expect(slateSkeletons.length).toBeGreaterThan(0);

    // Check for orange accent (predict button)
    const orangeAccent = container.querySelector(
      "[class*='bg-orange-500']"
    );
    expect(orangeAccent).toBeInTheDocument();
  });

  it("renders chart legend skeleton", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Chart container
    const chartContainer = container.querySelector(
      ".rounded-xl.border.border-white\\/10.bg-slate-900\\/50.p-6"
    );
    expect(chartContainer).toBeInTheDocument();

    // Legend skeleton within chart
    const legendSkeleton = chartContainer?.querySelector(".h-9.w-32");
    expect(legendSkeleton).toBeInTheDocument();
  });

  it("renders x-axis label skeletons at chart bottom", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Chart container
    const chartContainer = container.querySelector(
      ".rounded-xl.border.border-white\\/10.bg-slate-900\\/50"
    );

    // X-axis labels in flex justify-between layout
    const xAxisLabels = chartContainer?.querySelector(
      ".flex.justify-between"
    );
    expect(xAxisLabels).toBeInTheDocument();

    // Three x-axis label skeletons
    const labelSkeletons = xAxisLabels?.querySelectorAll(".h-3.w-20");
    expect(labelSkeletons?.length).toBe(3);
  });

  it("matches the min-h-screen container height of the actual page", () => {
    const { container } = render(<MarketDetailSkeleton />);

    const mainContainer = container.querySelector(".min-h-screen");
    expect(mainContainer).toBeInTheDocument();
  });

  it("renders with proper spacing and gap utilities", () => {
    const { container } = render(<MarketDetailSkeleton />);

    // Check gap utilities in stats grid
    const statsGrid = container.querySelector(".gap-8");
    expect(statsGrid).toBeInTheDocument();

    // Check space-y utilities
    const spacedContainer = container.querySelector(".space-y-4");
    expect(spacedContainer).toBeInTheDocument();
  });
});
