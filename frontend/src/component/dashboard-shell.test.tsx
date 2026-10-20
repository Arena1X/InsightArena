import { fireEvent, render, screen } from "@testing-library/react";
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

  describe("onboarding tour", () => {
    beforeEach(() => {
      localStorage.clear();
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
    });

    function renderShell() {
      return render(
        <DashboardShell>
          <div>page content</div>
        </DashboardShell>,
      );
    }

    it("shows the tour with skip controls and resumes where the user left off", () => {
      const first = renderShell();
      const tour = screen.getByRole("dialog", { name: "Connect your wallet" });
      expect(tour).toHaveTextContent("Step 1 of 4");

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("dialog", { name: "Explore markets" })).toBeInTheDocument();
      first.unmount();

      renderShell();
      expect(screen.getByRole("dialog", { name: "Explore markets" })).toHaveTextContent("Step 2 of 4");
    });

    it("skip hides the tour and restart brings it back from step one", () => {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /restart onboarding tour/i }));
      expect(screen.getByRole("dialog", { name: "Connect your wallet" })).toHaveTextContent("Step 1 of 4");
    });

    it("hides the tour and restart control on small viewports", () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });
      renderShell();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /restart onboarding tour/i })).not.toBeInTheDocument();
    });
  });
});
