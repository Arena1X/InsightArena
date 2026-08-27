import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

describe("EmptyState", () => {
  it("renders the icon, title, and description with no action", () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">icon</span>}
        title="Nothing here"
        description="Nothing to see yet."
      />,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Nothing to see yet.")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a button action and fires its onClick", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" description="desc" action={{ label: "Do it", onClick }} />);

    const button = screen.getByRole("button", { name: "Do it" });
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a link action when href is provided instead of a button", () => {
    render(<EmptyState title="Empty" description="desc" action={{ label: "Go", href: "/markets" }} />);

    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/markets");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a secondary action alongside the primary one", () => {
    const onSecondaryClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        description="desc"
        action={{ label: "Primary", href: "/a" }}
        secondaryAction={{ label: "Secondary", onClick: onSecondaryClick }}
      />,
    );

    expect(screen.getByRole("link", { name: "Primary" })).toBeInTheDocument();
    const secondary = screen.getByRole("button", { name: "Secondary" });
    secondary.click();
    expect(onSecondaryClick).toHaveBeenCalledTimes(1);
  });

  it("applies error-variant styling to the icon container", () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">icon</span>}
        title="Failed"
        description="Something broke."
        variant="error"
      />,
    );

    expect(screen.getByTestId("icon").parentElement).toHaveClass("bg-red-500/10");
  });
});
