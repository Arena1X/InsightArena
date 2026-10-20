import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileGateWrapper } from "./ProfileGateWrapper";
import { useWallet } from "@/context/WalletContext";
import { usePathname } from "next/navigation";

vi.mock("@/context/WalletContext", () => ({
  useWallet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/component/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

vi.mock("@/component/PageBackground", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/component/Header", () => ({ default: () => <div>header</div> }));
vi.mock("@/component/Footer", () => ({ default: () => <div>footer</div> }));

const mockedUseWallet = vi.mocked(useWallet);
const mockedUsePathname = vi.mocked(usePathname);

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("ProfileGateWrapper", () => {
  it("renders children unchanged on routes that aren't profile-gated", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: true,
      user: { username: "" },
    } as unknown as ReturnType<typeof useWallet>);

    render(
      <ProfileGateWrapper>
        <div>page content</div>
      </ProfileGateWrapper>,
    );

    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("lists exactly the missing profile fields with a CTA to complete them", () => {
    mockedUsePathname.mockReturnValue("/my-markets");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: true,
      user: { username: "Alex" }, // avatarUrl and bio are missing
    } as unknown as ReturnType<typeof useWallet>);

    render(
      <ProfileGateWrapper>
        <div>my markets page</div>
      </ProfileGateWrapper>,
    );

    expect(screen.queryByText("my markets page")).not.toBeInTheDocument();
    expect(screen.getByText("Profile picture")).toBeInTheDocument();
    expect(screen.getByText("Bio")).toBeInTheDocument();
    expect(screen.queryByText("Username")).not.toBeInTheDocument();

    const cta = screen.getByRole("link", { name: /complete profile/i });
    expect(cta).toHaveAttribute("href", "/settings#profile");
  });

  it("keeps the dashboard chrome around the gate prompt", () => {
    mockedUsePathname.mockReturnValue("/my-markets");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: true,
      user: { username: "Alex" },
    } as unknown as ReturnType<typeof useWallet>);

    render(
      <ProfileGateWrapper>
        <div>my markets page</div>
      </ProfileGateWrapper>,
    );

    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
  });

  it("does not allow dismissing a critical gate", () => {
    mockedUsePathname.mockReturnValue("/my-markets");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: true,
      user: { username: "Alex" },
    } as unknown as ReturnType<typeof useWallet>);

    render(
      <ProfileGateWrapper>
        <div>gated</div>
      </ProfileGateWrapper>,
    );

    expect(screen.queryByRole("button", { name: /not now/i })).not.toBeInTheDocument();
  });

  it("allows dismiss-for-now on a non-critical gate and remembers the choice", () => {
    mockedUsePathname.mockReturnValue("/competitions");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: true,
      user: { username: "Alex" },
    } as unknown as ReturnType<typeof useWallet>);

    const { rerender } = render(
      <ProfileGateWrapper>
        <div>competitions</div>
      </ProfileGateWrapper>,
    );
    expect(screen.queryByText("competitions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(screen.getByText("competitions")).toBeInTheDocument();

    rerender(
      <ProfileGateWrapper>
        <div>competitions</div>
      </ProfileGateWrapper>,
    );
    expect(screen.getByText("competitions")).toBeInTheDocument();
  });

  it("renders normally once the profile is complete", () => {
    mockedUsePathname.mockReturnValue("/my-markets");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: true,
      user: { username: "Alex", avatarUrl: "https://example.com/a.png", bio: "hi" },
    } as unknown as ReturnType<typeof useWallet>);

    render(
      <ProfileGateWrapper>
        <div>my markets page</div>
      </ProfileGateWrapper>,
    );

    expect(screen.getByText("my markets page")).toBeInTheDocument();
  });

  it("bypasses DashboardShell for unauthenticated visitors to /profile", () => {
    mockedUsePathname.mockReturnValue("/profile");
    mockedUseWallet.mockReturnValue({
      isAuthenticated: false,
      user: null,
    } as unknown as ReturnType<typeof useWallet>);

    render(
      <ProfileGateWrapper>
        <div>profile gate card</div>
      </ProfileGateWrapper>,
    );

    expect(screen.getByText("profile gate card")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-shell")).not.toBeInTheDocument();
  });
});
