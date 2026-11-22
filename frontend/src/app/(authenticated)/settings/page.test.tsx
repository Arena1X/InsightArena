import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  afterEach(() => {
    vi.useRealTimers();
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

  it("optimistically updates a toggle while its debounced save is pending", async () => {
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

    expect(digestsToggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving notification preferences",
    );
  });

  it("reverts the optimistic toggle when saving fails", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Weekly Activity Digests" })
      ).toBeInTheDocument();
    });

    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    vi.spyOn(api, "updateNotificationPreferences").mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    vi.useFakeTimers();
    fireEvent.click(digestsToggle);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(digestsToggle).toHaveAttribute("aria-checked", "false");
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to save preferences. Network unavailable",
    );
  });

  it("reflects the server response after a successful save", async () => {
    vi.spyOn(api, "updateNotificationPreferences").mockResolvedValueOnce({
      ...initialMockPrefs,
      predictions: false,
      digests: true,
    });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Predictions & Market Resolutions" })
      ).toBeInTheDocument();
    });

    const digestsToggle = screen.getByRole("switch", {
      name: "Weekly Activity Digests",
    });
    vi.useFakeTimers();
    fireEvent.click(digestsToggle);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(
        screen.getByRole("switch", {
          name: "Predictions & Market Resolutions",
        }),
      ).toHaveAttribute("aria-checked", "false");
      expect(digestsToggle).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Preferences saved successfully.",
      );
    });
  });

  it("debounces rapid changes into one save with the latest preferences", async () => {
    render(<SettingsPage />);
    await screen.findByRole("switch", { name: "Weekly Activity Digests" });
    vi.useFakeTimers();

    fireEvent.click(
      screen.getByRole("switch", { name: "Weekly Activity Digests" }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Predictions & Market Resolutions",
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1);
    });
    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({
      predictions: false,
      rewards: true,
      disputes: true,
      digests: true,
    });
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

    await screen.findByText("Preferences saved successfully.");

    // Trigger beforeunload event
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(beforeUnloadEvent);

    // Should NOT prevent default when no unsaved changes
    expect(beforeUnloadEvent.defaultPrevented).toBe(false);
  });

  it("a failed save reverts the change and clears the navigation warning", async () => {
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
    vi.spyOn(api, "updateNotificationPreferences").mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    fireEvent.click(digestsToggle);

    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(digestsToggle).toHaveAttribute("aria-checked", "false");
    });

    const secondBeforeUnloadEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(secondBeforeUnloadEvent);
    expect(secondBeforeUnloadEvent.defaultPrevented).toBe(false);
  });
});