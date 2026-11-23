import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CryptoFAQ from "./page";

vi.mock("@/component/Header", () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock("@/component/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock("@/component/PageBackground", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("FAQ accordion deep links", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("auto-opens the accordion item matching the URL hash on load", () => {
    window.location.hash = "#how-does-blockchain-work";

    render(<CryptoFAQ />);

    const button = screen.getByRole("button", {
      name: /How Does Blockchain Work\?/i,
    });
    expect(button).toHaveAttribute("aria-expanded", "true");

    const panel = document.getElementById("faq-panel-how-does-blockchain-work");
    expect(panel).not.toBeNull();
    expect(panel).not.toHaveAttribute("hidden");
  });

  it("updates the URL hash when an accordion item is toggled open", () => {
    render(<CryptoFAQ />);

    const button = screen.getByRole("button", {
      name: /Do I Need Coding Skills To Learn Crypto\?/i,
    });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(window.location.hash).toBe("#do-i-need-coding-skills-to-learn-crypto");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(window.location.hash).toBe("");
  });
});

describe("FAQ search", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("filters the FAQ entries as the user types", () => {
    render(<CryptoFAQ />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);

    fireEvent.change(screen.getByLabelText("Search FAQ"), {
      target: { value: "blockchain" },
    });

    const headings = screen.getAllByRole("heading", { level: 2 });
    // "blockchain" appears in the "How Does Blockchain Work?" question and in
    // the "What Is Cryptocurrency?" answer, but nowhere in the other two.
    expect(headings.map((h) => h.textContent)).toEqual([
      "1. What Is Cryptocurrency?",
      "2. How Does Blockchain Work?",
    ]);
    expect(
      screen.queryByRole("button", { name: /Tournament For Tutors/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Coding Skills/i })
    ).not.toBeInTheDocument();
  });

  it("highlights the matching text in results", () => {
    render(<CryptoFAQ />);

    fireEvent.change(screen.getByLabelText("Search FAQ"), {
      target: { value: "coding" },
    });

    const highlights = screen.getAllByTestId("faq-highlight");
    expect(highlights.length).toBeGreaterThan(0);
    highlights.forEach((mark) => {
      expect(mark.tagName).toBe("MARK");
      expect(mark.textContent?.toLowerCase()).toBe("coding");
    });

    // The question heading carries a highlight, and the matching answer is
    // expanded so its highlighted text is visible.
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.querySelector("mark")).toHaveTextContent("Coding");

    const panel = document.getElementById(
      "faq-panel-do-i-need-coding-skills-to-learn-crypto"
    );
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel?.querySelector("mark")).toHaveTextContent("coding");
  });

  it("shows a no-results message when nothing matches", () => {
    render(<CryptoFAQ />);

    fireEvent.change(screen.getByLabelText("Search FAQ"), {
      target: { value: "nonexistent-topic-xyz" },
    });

    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      /No questions match .*nonexistent-topic-xyz/
    );
  });

  it("restores every entry when the search is cleared", () => {
    render(<CryptoFAQ />);

    fireEvent.change(screen.getByLabelText("Search FAQ"), {
      target: { value: "nonexistent-topic-xyz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(screen.queryByTestId("faq-highlight")).not.toBeInTheDocument();
  });
});
