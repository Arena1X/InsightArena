import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PublicProfilePage from "./page";

vi.mock("@/component/Header", () => ({
  default: () => <header data-testid="mock-header">Header</header>,
}));

vi.mock("@/component/Footer", () => ({
  default: () => <footer data-testid="mock-footer">Footer</footer>,
}));

vi.mock("@/component/PageBackground", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("PublicProfilePage", () => {
  const sampleAddress = "GA1234567890ABCDEF1234567890ABCDEF";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders stats card from a sample public profile", () => {
    render(<PublicProfilePage params={{ address: sampleAddress }} />);

    expect(screen.getByTestId("public-stats-card")).toBeInTheDocument();
    expect(screen.getByText("Total Predictions")).toBeInTheDocument();
    expect(screen.getByText("312")).toBeInTheDocument();

    expect(screen.getByText("Accuracy %")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument();

    expect(screen.getByText("Best Season")).toBeInTheDocument();
    expect(screen.getByText("Season 1 (#3)")).toBeInTheDocument();

    expect(screen.getByText("Current Streak")).toBeInTheDocument();
    expect(screen.getByText("5 Wins")).toBeInTheDocument();
  });

  it("handles private/hidden profile gracefully with a fallback", () => {
    const privateAddress = "private-user-address-9999999999";
    render(<PublicProfilePage params={{ address: privateAddress }} />);

    expect(screen.queryByTestId("public-stats-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("private-profile-fallback")).toBeInTheDocument();
    expect(screen.getByText("This profile is private")).toBeInTheDocument();
    expect(screen.getByText(/User performance stats are hidden/i)).toBeInTheDocument();
  });

  it("renders copy address and share profile buttons and actions", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<PublicProfilePage params={{ address: sampleAddress }} />);

    const copyButton = screen.getByRole("button", { name: /copy address/i });
    expect(copyButton).toBeInTheDocument();

    fireEvent.click(copyButton);
    expect(writeTextMock).toHaveBeenCalledWith(sampleAddress);

    expect(screen.getByRole("group", { name: /share profile/i })).toBeInTheDocument();
  });
});
