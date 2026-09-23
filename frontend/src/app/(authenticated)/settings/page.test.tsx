import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "./page";
import * as api from "@/lib/api";

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
