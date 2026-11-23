"use client";

import { useContext, useState } from "react";
import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";
import {
  type PriceAlert,
  type PriceAlertDirection,
  type PriceAlertOutcome,
  usePriceAlerts,
} from "@/context/PriceAlertContext";
import { ToastContext } from "@/context/ToastContext";

interface PriceAlertManagerProps {
  marketId: string;
  marketTitle: string;
}

export default function PriceAlertManager({
  marketId,
  marketTitle,
}: PriceAlertManagerProps) {
  const { getAlertsForMarket, addAlert, updateAlert, removeAlert } =
    usePriceAlerts();
  const toastContext = useContext(ToastContext);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState<{
    outcome: PriceAlertOutcome;
    targetOdds: string;
    direction: PriceAlertDirection;
  }>({
    outcome: "YES",
    targetOdds: "50",
    direction: "above",
  });

  const marketAlerts = getAlertsForMarket(marketId);

  const showToast = (message: string, variant: "success" | "error") => {
    if (toastContext) {
      toastContext.show({ description: message, variant });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetOddsValue = parseFloat(formData.targetOdds);

    if (isNaN(targetOddsValue) || targetOddsValue < 0 || targetOddsValue > 100) {
      showToast("Target odds must be between 0 and 100", "error");
      return;
    }

    try {
      await addAlert({
        marketId,
        outcome: formData.outcome,
        targetOdds: targetOddsValue / 100, // Convert percentage to decimal
        direction: formData.direction,
        enabled: true,
      });

      showToast("Price alert created successfully", "success");
      setShowForm(false);
      setFormData({
        outcome: "YES",
        targetOdds: "50",
        direction: "above",
      });
    } catch (error) {
      showToast("Failed to create price alert", "error");
      console.error("Failed to create alert:", error);
    }
  };

  const handleToggleAlert = async (alert: PriceAlert) => {
    try {
      await updateAlert(alert.id, { enabled: !alert.enabled });
      showToast(
        `Alert ${alert.enabled ? "disabled" : "enabled"}`,
        "success",
      );
    } catch (error) {
      showToast("Failed to update alert", "error");
      console.error("Failed to toggle alert:", error);
    }
  };

  const handleRemoveAlert = async (alertId: string) => {
    try {
      await removeAlert(alertId);
      showToast("Alert removed", "success");
    } catch (error) {
      showToast("Failed to remove alert", "error");
      console.error("Failed to remove alert:", error);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Price Alerts</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
        >
          {showForm ? (
            <>
              <X size={16} />
              Cancel
            </>
          ) : (
            <>
              <Plus size={16} />
              Add Alert
            </>
          )}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-300">
                Outcome
              </label>
              <select
                value={formData.outcome}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    outcome: e.target.value as PriceAlertOutcome,
                  })
                }
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-300">
                Target Odds (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.targetOdds}
                onChange={(e) =>
                  setFormData({ ...formData, targetOdds: e.target.value })
                }
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">
              Direction
            </label>
            <select
              value={formData.direction}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  direction: e.target.value as PriceAlertDirection,
                })
              }
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="above">Rises above target</option>
              <option value="below">Falls below target</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
          >
            Create Alert
          </button>
        </form>
      )}

      {marketAlerts.length > 0 ? (
        <div className="space-y-2">
          {marketAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 p-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${alert.enabled ? "text-white" : "text-gray-500"}`}
                  >
                    {alert.outcome} odds {alert.direction === "above" ? "↑" : "↓"}{" "}
                    {(alert.targetOdds * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {alert.direction === "above"
                    ? "Alert when odds rise above target"
                    : "Alert when odds fall below target"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAlert(alert)}
                  className="rounded p-1.5 hover:bg-white/10 transition-colors"
                  aria-label={alert.enabled ? "Disable alert" : "Enable alert"}
                >
                  {alert.enabled ? (
                    <Bell size={16} className="text-orange-400" />
                  ) : (
                    <BellOff size={16} className="text-gray-500" />
                  )}
                </button>
                <button
                  onClick={() => handleRemoveAlert(alert.id)}
                  className="rounded p-1.5 text-red-400 hover:bg-white/10 transition-colors"
                  aria-label="Remove alert"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-white/20 bg-white/5 p-6 text-center">
          <Bell size={24} className="mx-auto mb-2 text-gray-500" />
          <p className="text-sm text-gray-400">
            No price alerts configured for this market
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Create an alert to get notified when odds reach your target
          </p>
        </div>
      )}
    </div>
  );
}
