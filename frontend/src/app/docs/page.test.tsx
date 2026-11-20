import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import DocsPage from "./page";

// Header/Footer pull in wallet context, toast, and routing hooks that aren't
// relevant to the TOC/search behavior under test, so stub them out.
vi.mock("@/component/Header", () => ({
  default: () => <div data-testid="mock-header" />,
}));
vi.mock("@/component/Footer", () => ({
  default: () => <div data-testid="mock-footer" />,
}));

// framer-motion's exit animations only resolve on real animation frames,
// which jsdom doesn't drive. Swap in plain passthrough elements so
// search-driven removals from the grid are synchronous and deterministic.
vi.mock("framer-motion", () => {
  const MotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MotionDiv(
      { initial, animate, exit, transition, layout, ...rest },
      ref
    ) {
      return <div ref={ref} {...rest} />;
    }
  );

  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

// jsdom doesn't implement IntersectionObserver; DocsPage uses it to
// highlight the active TOC entry while scrolling.
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
});

describe("DocsPage table of contents", () => {
  it("renders one TOC entry per documentation heading, in the same order", () => {
    render(<DocsPage />);

    const toc = screen.getByRole("navigation", { name: /table of contents/i });
    const tocLinks = within(toc).getAllByRole("link");

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .filter(
        (heading) =>
          heading.textContent &&
          tocLinks.some((link) => link.textContent === heading.textContent)
      );

    expect(tocLinks).toHaveLength(headings.length);

    tocLinks.forEach((link, idx) => {
      const heading = headings[idx];
      expect(link.textContent).toBe(heading.textContent);

      const targetId = link.getAttribute("href")?.replace("#", "");
      expect(targetId).toBeTruthy();
      expect(document.getElementById(targetId as string)).not.toBeNull();
    });
  });

  it("highlights the first TOC entry as active by default", () => {
    render(<DocsPage />);

    const toc = screen.getByRole("navigation", { name: /table of contents/i });
    const tocLinks = within(toc).getAllByRole("link");

    expect(tocLinks[0]).toHaveAttribute("aria-current", "true");
    tocLinks.slice(1).forEach((link) => {
      expect(link).not.toHaveAttribute("aria-current");
    });
  });
});

describe("DocsPage search", () => {
  it("filters visible sections and the TOC down to the matching entry", () => {
    render(<DocsPage />);

    const searchInput = screen.getByPlaceholderText("Search documentation...");
    // "non-custodial" only appears in the Wallet Connection section's body
    // content, so it exercises content matching without also hitting the
    // other sections that happen to mention "wallet" in passing.
    fireEvent.change(searchInput, { target: { value: "non-custodial" } });

    // The matching section is still shown.
    expect(
      screen.getByRole("heading", { level: 3, name: "Wallet Connection" })
    ).toBeInTheDocument();

    // Non-matching sections are filtered out of the grid.
    expect(
      screen.queryByRole("heading", { level: 3, name: "How to Trade" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "API Documentation" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Getting Started" })
    ).not.toBeInTheDocument();

    // The TOC narrows down to the same matching entry.
    const toc = screen.getByRole("navigation", { name: /table of contents/i });
    const tocLinks = within(toc).getAllByRole("link");
    expect(tocLinks).toHaveLength(1);
    expect(tocLinks[0]).toHaveTextContent("Wallet Connection");
  });

  it("shows an empty state and an empty TOC when nothing matches", () => {
    render(<DocsPage />);

    const searchInput = screen.getByPlaceholderText("Search documentation...");
    fireEvent.change(searchInput, {
      target: { value: "nonexistent-topic-xyz" },
    });

    expect(
      screen.getByText(/no documentation sections match/i)
    ).toBeInTheDocument();

    const toc = screen.getByRole("navigation", { name: /table of contents/i });
    expect(within(toc).queryAllByRole("link")).toHaveLength(0);
    expect(within(toc).getByText(/no matching sections/i)).toBeInTheDocument();
  });

  it("matches sections by description text, not just the title", () => {
    render(<DocsPage />);

    const searchInput = screen.getByPlaceholderText("Search documentation...");
    fireEvent.change(searchInput, {
      target: { value: "step-by-step guide" },
    });

    expect(
      screen.getByRole("heading", { level: 3, name: "How to Trade" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Getting Started" })
    ).not.toBeInTheDocument();
  });
});
