import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./dashboard-shell";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GADDRESS",
    user: { username: "tester" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => async () => true,
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn() }),
}));

// Stub the composed sidebar cards to assert shell wiring only.
vi.mock("@/component/RewardsWalletCard", () => ({
  default: () => <div data-testid="rewards-card" />,
}));
vi.mock("@/component/NotificationsCard", () => ({
  default: () => <div data-testid="notifications-card" />,
}));
vi.mock("@/component/CoachCard", () => ({
  default: () => <div data-testid="coach-card" />,
}));

const mockedUsePathname = vi.mocked(usePathname);

describe("DashboardShell", () => {
  beforeEach(() => {
    mockedUsePathname.mockReturnValue("/dashboard");
  });

  it("composes the coach card into the dashboard sidebar alongside the existing cards", () => {
    render(
      <DashboardShell>
        <div>page content</div>
      </DashboardShell>,
    );

    const aside = screen.getByTestId("coach-card").closest("aside");
    expect(aside).not.toBeNull();

    const ids = Array.from(
      aside!.querySelectorAll("[data-testid]"),
    ).map((el) => el.getAttribute("data-testid"));

    expect(ids).toContain("rewards-card");
    expect(ids).toContain("coach-card");
    expect(ids).toContain("notifications-card");
    // Coach sits between rewards wallet and notifications.
    expect(ids.indexOf("coach-card")).toBeGreaterThan(
      ids.indexOf("rewards-card"),
    );
    expect(ids.indexOf("coach-card")).toBeLessThan(
      ids.indexOf("notifications-card"),
    );
  });

  it("does not render the sidebar cards outside /dashboard", () => {
    mockedUsePathname.mockReturnValue("/my-predictions");

    render(
      <DashboardShell>
        <div>page content</div>
      </DashboardShell>,
    );

    expect(screen.queryByTestId("coach-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rewards-card")).not.toBeInTheDocument();
  });
});
