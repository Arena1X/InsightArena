import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { PriceAlertProvider, usePriceAlerts } from "../PriceAlertContext";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

let mockWallet = {
  address: "GTESTADDRESS" as string | null,
  token: "test-token" as string | null,
};

let mockNotifications = {
  notifications: [],
  setNotifications: vi.fn(),
  unreadCount: 0,
  updateNotification: vi.fn(),
  markAllAsRead: vi.fn(),
};

vi.mock("../WalletContext", () => ({
  useWallet: () => mockWallet,
}));

vi.mock("../NotificationContext", () => ({
  useNotifications: () => mockNotifications,
}));

const mockApiClientGet = vi.mocked(api.apiClient.get);
const mockApiClientPatch = vi.mocked(api.apiClient.patch);

function wrapper({ children }: { children: ReactNode }) {
  return <PriceAlertProvider>{children}</PriceAlertProvider>;
}

afterEach(() => {
  mockWallet = { address: "GTESTADDRESS", token: "test-token" };
  mockNotifications = {
    notifications: [],
    setNotifications: vi.fn(),
    unreadCount: 0,
    updateNotification: vi.fn(),
    markAllAsRead: vi.fn(),
  };
});

describe("PriceAlertContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockApiClientGet.mockResolvedValue({ price_alerts: null });
    mockApiClientPatch.mockResolvedValue({ price_alerts: [] });
  });

  describe("Adding alerts", () => {
    it("should add a new alert", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      expect(result.current.alerts).toHaveLength(1);
      expect(result.current.alerts[0]).toMatchObject({
        marketId: "market-1",
        outcome: "YES",
        targetOdds: 0.6,
        direction: "above",
        enabled: true,
      });
      expect(result.current.alerts[0].id).toBeDefined();
      expect(result.current.alerts[0].createdAt).toBeDefined();
    });

    it("should sync new alert to server", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      expect(mockApiClientPatch).toHaveBeenCalledWith(
        "/api/users/preferences/notifications",
        expect.objectContaining({
          price_alerts: expect.arrayContaining([
            expect.objectContaining({
              marketId: "market-1",
              outcome: "YES",
              targetOdds: 0.6,
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it("should rollback on server error", async () => {
      mockApiClientPatch.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(async () => {
        await act(async () => {
          await result.current.addAlert({
            marketId: "market-1",
            outcome: "YES",
            targetOdds: 0.6,
            direction: "above",
            enabled: true,
          });
        });
      }).rejects.toThrow();

      expect(result.current.alerts).toHaveLength(0);
    });
  });

  describe("Updating alerts", () => {
    it("should update an existing alert", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let alertId: string;

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
        alertId = result.current.alerts[0].id;
      });

      await act(async () => {
        await result.current.updateAlert(alertId, { enabled: false });
      });

      expect(result.current.alerts[0].enabled).toBe(false);
    });
  });

  describe("Removing alerts", () => {
    it("should remove an alert", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let alertId: string;

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
        alertId = result.current.alerts[0].id;
      });

      expect(result.current.alerts).toHaveLength(1);

      await act(async () => {
        await result.current.removeAlert(alertId);
      });

      expect(result.current.alerts).toHaveLength(0);
    });
  });

  describe("Alert triggering", () => {
    it("should trigger alert when odds cross threshold from below", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      act(() => {
        result.current.checkAlert("market-1", 0.65, 0.35, 0.55, 0.45);
      });

      await waitFor(() => {
        expect(mockNotifications.setNotifications).toHaveBeenCalled();
      });
    });

    it("should NOT trigger alert when odds cross threshold from above", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      act(() => {
        // Crossing from above (0.65 -> 0.55) should NOT trigger
        result.current.checkAlert("market-1", 0.55, 0.45, 0.65, 0.35);
      });

      expect(mockNotifications.setNotifications).not.toHaveBeenCalled();
    });

    it("should trigger alert when odds fall below threshold", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.4,
          direction: "below",
          enabled: true,
        });
      });

      act(() => {
        result.current.checkAlert("market-1", 0.35, 0.65, 0.45, 0.55);
      });

      await waitFor(() => {
        expect(mockNotifications.setNotifications).toHaveBeenCalled();
      });
    });

    it("should NOT trigger alert without previous odds", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      act(() => {
        // Initial load - no previous odds
        result.current.checkAlert("market-1", 0.65, 0.35);
      });

      expect(mockNotifications.setNotifications).not.toHaveBeenCalled();
    });

    it("should NOT trigger same alert twice", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      act(() => {
        result.current.checkAlert("market-1", 0.65, 0.35, 0.55, 0.45);
      });

      await waitFor(() => {
        expect(mockNotifications.setNotifications).toHaveBeenCalledTimes(1);
      });

      // Try to trigger again
      act(() => {
        result.current.checkAlert("market-1", 0.7, 0.3, 0.65, 0.35);
      });

      // Should still be called only once
      expect(mockNotifications.setNotifications).toHaveBeenCalledTimes(1);
    });

    it("should NOT trigger disabled alerts", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: false,
        });
      });

      act(() => {
        result.current.checkAlert("market-1", 0.65, 0.35, 0.55, 0.45);
      });

      expect(mockNotifications.setNotifications).not.toHaveBeenCalled();
    });

    it("should handle NO outcome alerts", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "NO",
          targetOdds: 0.5,
          direction: "above",
          enabled: true,
        });
      });

      act(() => {
        // NO odds crossing from 0.45 to 0.55
        result.current.checkAlert("market-1", 0.45, 0.55, 0.55, 0.45);
      });

      await waitFor(() => {
        expect(mockNotifications.setNotifications).toHaveBeenCalled();
      });
    });
  });

  describe("Filtering alerts by market", () => {
    it("should return alerts for specific market", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
        await result.current.addAlert({
          marketId: "market-2",
          outcome: "YES",
          targetOdds: 0.5,
          direction: "below",
          enabled: true,
        });
      });

      const market1Alerts = result.current.getAlertsForMarket("market-1");
      const market2Alerts = result.current.getAlertsForMarket("market-2");

      expect(market1Alerts).toHaveLength(1);
      expect(market1Alerts[0].marketId).toBe("market-1");
      expect(market2Alerts).toHaveLength(1);
      expect(market2Alerts[0].marketId).toBe("market-2");
    });
  });

  describe("Persistence", () => {
    it("should persist alerts to localStorage", async () => {
      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.addAlert({
          marketId: "market-1",
          outcome: "YES",
          targetOdds: 0.6,
          direction: "above",
          enabled: true,
        });
      });

      const stored = window.localStorage.getItem(
        "insightarena.pricealerts.GTESTADDRESS",
      );
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].marketId).toBe("market-1");
    });

    it("should load alerts from server on mount", async () => {
      const serverAlerts = [
        {
          id: "alert-1",
          marketId: "market-1",
          outcome: "YES" as const,
          targetOdds: 0.6,
          direction: "above" as const,
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      ];

      mockApiClientGet.mockResolvedValueOnce({ price_alerts: serverAlerts });

      const { result } = renderHook(() => usePriceAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.alerts).toHaveLength(1);
      expect(result.current.alerts[0].marketId).toBe("market-1");
    });
  });
});
