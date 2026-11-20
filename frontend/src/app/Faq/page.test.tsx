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
