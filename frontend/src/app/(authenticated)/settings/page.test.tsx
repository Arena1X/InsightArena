import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "./page";
import * as api from "@/lib/api";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock intersection observer for settings page nav
global.IntersectionObserver = class IntersectionObserver {
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

describe("SettingsPage - Notification Preferences Form (#1551)", () => {
  const initialMockPrefs: api.NotificationPreferences = {
    predictions: true,
    rewards: true,
    disputes: true,
    digests: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    vi.spyOn(api, "getNotificationPreferences").mockResolvedValue({
      ...initialMockPrefs,
    });
    vi.spyOn(api, "updateNotificationPreferences").mockImplementation(
      async (prefs) => prefs
    );
  });

  it("renders notification category toggles loaded from API", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Notification Preferences" })
      ).toBeInTheDocument();
    });

    const predictionsToggle = screen.getByRole("switch", {
      name: "Predictions & Market Resolutions",
    });
    const rewardsToggle = screen.getByRole("switch", {
      name: "Rewards & Claims",
    });
    const disputesToggle = screen.getByRole("switch", {
      name: "Dispute Escalations",
    });
    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });

    expect(predictionsToggle).toHaveAttribute("aria-checked", "true");
    expect(rewardsToggle).toHaveAttribute("aria-checked", "true");
    expect(disputesToggle).toHaveAttribute("aria-checked", "true");
    expect(digestsToggle).toHaveAttribute("aria-checked", "false");
  });

  it("shows save/reset bar on dirty state when toggling categories", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("save-reset-bar")).not.toBeInTheDocument();

    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    fireEvent.click(digestsToggle);

    expect(digestsToggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("save-reset-bar")).toBeInTheDocument();
  });

  it("saving persists changes to API and clears dirty state", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    fireEvent.click(digestsToggle);

    const saveButton = screen.getByRole("button", { name: "Save Preferences" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateNotificationPreferences).toHaveBeenCalledWith({
        predictions: true,
        rewards: true,
        disputes: true,
        digests: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("save-reset-bar")).not.toBeInTheDocument();
    });
  });

  it("cancel/reset restores prior values and clears dirty state", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Predictions & Market Resolutions" })
      ).toBeInTheDocument();
    });

    const predictionsToggle = screen.getByRole("switch", {
      name: "Predictions & Market Resolutions",
    });
    expect(predictionsToggle).toHaveAttribute("aria-checked", "true");

    // Toggle off
    fireEvent.click(predictionsToggle);
    expect(predictionsToggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("save-reset-bar")).toBeInTheDocument();

    // Click Reset
    const resetButton = screen.getByRole("button", { name: "Reset" });
    fireEvent.click(resetButton);

    expect(predictionsToggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("save-reset-bar")).not.toBeInTheDocument();
  });

  it("triggers beforeunload warning when dirty", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    fireEvent.click(digestsToggle);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("SettingsPage - Unsaved Changes Navigation Guard", () => {
  const initialMockPrefs: api.NotificationPreferences = {
    predictions: true,
    rewards: true,
    disputes: true,
    digests: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    vi.spyOn(api, "getNotificationPreferences").mockResolvedValue({
      ...initialMockPrefs,
    });
    vi.spyOn(api, "updateNotificationPreferences").mockImplementation(
      async (prefs) => prefs
    );
    // Mock window.confirm
    vi.spyOn(window, "confirm");
  });

  it("navigating with unsaved changes prompts user", async () => {
    (window.confirm as any).mockReturnValue(false);
    
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    // Make changes to create unsaved state
    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    fireEvent.click(digestsToggle);

    // Verify dirty state
    expect(screen.getByTestId("save-reset-bar")).toBeInTheDocument();

    // Trigger beforeunload event (simulates navigation)
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(beforeUnloadEvent);

    // Should prevent default when there are unsaved changes
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);
  });

  it("saving then navigating does not prompt", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    // Make changes
    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    fireEvent.click(digestsToggle);

    // Save changes
    const saveButton = screen.getByRole("button", { name: "Save Preferences" });
    fireEvent.click(saveButton);

    // Wait for save to complete and dirty state to clear
    await waitFor(() => {
      expect(screen.queryByTestId("save-reset-bar")).not.toBeInTheDocument();
    });

    // Wait a bit more to ensure all state updates have propagated
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger beforeunload event
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(beforeUnloadEvent);

    // Should NOT prevent default when no unsaved changes
    expect(beforeUnloadEvent.defaultPrevented).toBe(false);
  });

  it("discard proceeds and stay cancels navigation", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    // Make changes to notifications
    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    fireEvent.click(digestsToggle);

    // Verify dirty state exists
    expect(screen.getByTestId("save-reset-bar")).toBeInTheDocument();

    // Simulate navigation attempt with beforeunload
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(beforeUnloadEvent);

    // Navigation should be prevented (user will be prompted by browser)
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    // Now reset/discard changes
    const resetButton = screen.getByRole("button", { name: "Reset" });
    fireEvent.click(resetButton);

    // Verify clean state
    await waitFor(() => {
      expect(screen.queryByTestId("save-reset-bar")).not.toBeInTheDocument();
    });

    // Try navigation again
    const secondBeforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(secondBeforeUnloadEvent);

    // Should NOT prevent navigation after discarding changes
    expect(secondBeforeUnloadEvent.defaultPrevented).toBe(false);
  });
});