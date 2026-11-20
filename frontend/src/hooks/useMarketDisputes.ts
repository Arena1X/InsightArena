"use client";

import { useCallback, useState } from "react";
import { apiClient, ApiError } from "@/lib/api";

export const DISPUTE_REASON_CATEGORIES = [
  "incorrect_outcome",
  "missing_evidence",
  "manipulation",
  "technical_error",
  "other",
] as const;

export type DisputeReasonCategory = (typeof DISPUTE_REASON_CATEGORIES)[number];

export const DISPUTE_REASON_CATEGORY_LABELS: Record<DisputeReasonCategory, string> = {
  incorrect_outcome: "Incorrect outcome",
  missing_evidence: "Missing evidence",
  manipulation: "Market manipulation",
  technical_error: "Technical error",
  other: "Other",
};

export type MarketDispute = {
  id: string;
  marketId: string;
  category: DisputeReasonCategory;
  reason: string;
  status: "pending" | "under_review" | "resolved" | "rejected";
  createdAt: string;
  evidenceUrls: string[];
  /** True while this row is an optimistic, not-yet-confirmed submission. */
  isOptimistic?: boolean;
};

export type CreateDisputeInput = {
  marketId: string;
  category: DisputeReasonCategory;
  reason: string;
  evidenceLinks: string[];
};

type UseMarketDisputesResult = {
  disputes: MarketDispute[];
  loading: boolean;
  error: string | null;
  submitting: boolean;
  submitError: string | null;
  submitSuccess: string | null;
  refresh: (marketId: string) => Promise<void>;
  submitDispute: (input: CreateDisputeInput) => Promise<MarketDispute>;
  clearStatus: () => void;
};

function normalizeStatus(status: string): MarketDispute["status"] {
  const value = status.toLowerCase();
  if (value === "resolved" || value === "rejected" || value === "under_review") {
    return value;
  }
  return "pending";
}

const CATEGORY_TAG_PATTERN = /^\[category:([a-z_]+)\]\n/;

/**
 * The backend dispute DTO only has `market_id`/`reason`, so the category is
 * encoded as a leading tag on the reason text (mirroring how evidence links
 * are appended below). This round-trips it back out for display.
 */
function encodeReasonWithCategory(
  category: DisputeReasonCategory,
  reason: string,
): string {
  return `[category:${category}]\n${reason}`;
}

function decodeReasonWithCategory(raw: string): {
  category: DisputeReasonCategory;
  reason: string;
} {
  const match = raw.match(CATEGORY_TAG_PATTERN);
  if (!match) return { category: "other", reason: raw };
  const tag = match[1] as DisputeReasonCategory;
  const category = DISPUTE_REASON_CATEGORIES.includes(tag) ? tag : "other";
  return { category, reason: raw.slice(match[0].length) };
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function guessMimeType(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return null;
}

export function useMarketDisputes(): UseMarketDisputesResult {
  const [disputes, setDisputes] = useState<MarketDispute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const refresh = useCallback(async (marketId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Use list endpoint (GET /disputes/market/:id is shadowed by /disputes/:id).
      const data = await apiClient.get<{
        disputes: Array<{
          id: string;
          marketId?: string;
          market_id?: string;
          reason: string;
          status: string;
          createdAt?: string;
          created_at?: string;
        }>;
      }>("/disputes");

      const rows = (data?.disputes ?? []).filter((d) => {
        const id = d.marketId ?? d.market_id;
        return id === marketId;
      });

      setDisputes(
        rows.map((d) => {
          const { category, reason } = decodeReasonWithCategory(d.reason);
          return {
            id: d.id,
            marketId: d.marketId ?? d.market_id ?? marketId,
            category,
            reason,
            status: normalizeStatus(d.status),
            createdAt: d.createdAt ?? d.created_at ?? new Date().toISOString(),
            evidenceUrls: [],
          };
        }),
      );
    } catch (err) {
      setDisputes((prev) => prev.filter((d) => d.marketId === marketId));
      if (err instanceof ApiError && err.status !== 401 && err.status !== 404) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const clearStatus = useCallback(() => {
    setSubmitError(null);
    setSubmitSuccess(null);
  }, []);

  const submitDispute = useCallback(async (input: CreateDisputeInput) => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!input.reason.trim()) {
      setSubmitting(false);
      const message = "A dispute reason is required.";
      setSubmitError(message);
      throw new Error(message);
    }
    if (input.reason.trim().length < 20) {
      setSubmitting(false);
      const message = "Please provide at least 20 characters of detail.";
      setSubmitError(message);
      throw new Error(message);
    }
    for (const link of input.evidenceLinks) {
      if (!isValidUrl(link)) {
        setSubmitting(false);
        const message = `Invalid evidence link: ${link}`;
        setSubmitError(message);
        throw new Error(message);
      }
    }

    const reasonWithEvidence =
      input.evidenceLinks.length > 0
        ? `${input.reason.trim()}\n\nEvidence:\n${input.evidenceLinks.join("\n")}`
        : input.reason.trim();

    // Optimistically insert the dispute immediately so the UI reflects
    // "filed" without waiting on the network. `optimisticId` lets us find and
    // roll this exact row back if the request ultimately fails.
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticDispute: MarketDispute = {
      id: optimisticId,
      marketId: input.marketId,
      category: input.category,
      reason: input.reason.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
      evidenceUrls: input.evidenceLinks,
      isOptimistic: true,
    };
    setDisputes((prev) => [optimisticDispute, ...prev]);

    try {
      let created: MarketDispute;
      try {
        const response = await apiClient.post<{
          id: string;
          marketId?: string;
          market_id?: string;
          reason: string;
          status: string;
          createdAt?: string;
          created_at?: string;
        }>("/disputes", {
          market_id: input.marketId,
          reason: encodeReasonWithCategory(input.category, reasonWithEvidence),
        });

        created = {
          id: response.id,
          marketId: response.marketId ?? response.market_id ?? input.marketId,
          category: input.category,
          reason: input.reason.trim(),
          status: normalizeStatus(response.status),
          createdAt:
            response.createdAt ?? response.created_at ?? new Date().toISOString(),
          evidenceUrls: input.evidenceLinks,
        };

        // Attach only when the URL looks like an allowed evidence file type.
        for (const link of input.evidenceLinks) {
          const mimeType = guessMimeType(link);
          if (!mimeType) continue;
          await apiClient
            .post(`/disputes/${created.id}/evidence`, {
              fileUrl: link,
              fileName: link.split("/").pop() || "evidence",
              mimeType,
              sizeBytes: Math.max(link.length, 1),
              description: "Evidence submitted from market dispute flow",
            })
            .catch(() => undefined);
        }
      } catch (err) {
        if (err instanceof ApiError && err.kind === "network") {
          // Offline: keep a locally-pending row instead of rolling back, since
          // there was never a server response confirming or rejecting this.
          created = {
            id: `local-${Date.now()}`,
            marketId: input.marketId,
            category: input.category,
            reason: input.reason.trim(),
            status: "pending",
            createdAt: new Date().toISOString(),
            evidenceUrls: input.evidenceLinks,
          };
        } else if (err instanceof ApiError) {
          throw new Error(err.message);
        } else {
          throw err;
        }
      }

      // Replace the optimistic row with the confirmed (or locally-pending) one.
      setDisputes((prev) => [
        created,
        ...prev.filter((d) => d.id !== optimisticId && d.id !== created.id),
      ]);
      setSubmitSuccess("Dispute submitted successfully.");
      return created;
    } catch (err) {
      // Roll back: the server rejected the dispute, so drop the optimistic row.
      setDisputes((prev) => prev.filter((d) => d.id !== optimisticId));
      const message =
        err instanceof Error ? err.message : "Failed to submit dispute";
      setSubmitError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    disputes,
    loading,
    error,
    submitting,
    submitError,
    submitSuccess,
    refresh,
    submitDispute,
    clearStatus,
  };
}
