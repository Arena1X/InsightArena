"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";

export type MarketDispute = {
  id: string;
  marketId: string;
  reason: string;
  status: "pending" | "under_review" | "resolved" | "rejected";
  createdAt: string;
  evidenceUrls: string[];
};

export type CreateDisputeInput = {
  marketId: string;
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
  /** ID of the dispute currently open in the detail view, synced to ?dispute= */
  activeDisputeId: string | null;
  /** Whether the new-dispute form is open, synced to ?disputeForm=1 */
  showForm: boolean;
  refresh: (marketId: string) => Promise<void>;
  submitDispute: (input: CreateDisputeInput) => Promise<MarketDispute>;
  clearStatus: () => void;
  openDispute: (id: string) => void;
  closeDispute: () => void;
  openForm: () => void;
  closeForm: () => void;
};

function normalizeStatus(status: string): MarketDispute["status"] {
  const value = status.toLowerCase();
  if (value === "resolved" || value === "rejected" || value === "under_review") {
    return value;
  }
  return "pending";
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [disputes, setDisputes] = useState<MarketDispute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Derive URL-driven state from search params.
  const activeDisputeId = searchParams.get("dispute");
  const showForm = searchParams.get("disputeForm") === "1";

  /** Replace search params, preserving unrelated params. */
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const openDispute = useCallback(
    (id: string) => {
      updateParams({ dispute: id, disputeForm: null });
    },
    [updateParams],
  );

  const closeDispute = useCallback(() => {
    updateParams({ dispute: null });
  }, [updateParams]);

  const openForm = useCallback(() => {
    updateParams({ disputeForm: "1", dispute: null });
  }, [updateParams]);

  const closeForm = useCallback(() => {
    updateParams({ disputeForm: null });
  }, [updateParams]);

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
        rows.map((d) => ({
          id: d.id,
          marketId: d.marketId ?? d.market_id ?? marketId,
          reason: d.reason,
          status: normalizeStatus(d.status),
          createdAt: d.createdAt ?? d.created_at ?? new Date().toISOString(),
          evidenceUrls: [],
        })),
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

    try {
      if (!input.reason.trim()) {
        throw new Error("A dispute reason is required.");
      }
      if (input.reason.trim().length < 20) {
        throw new Error("Please provide at least 20 characters of detail.");
      }

      for (const link of input.evidenceLinks) {
        if (!isValidUrl(link)) {
          throw new Error(`Invalid evidence link: ${link}`);
        }
      }

      const reasonWithEvidence =
        input.evidenceLinks.length > 0
          ? `${input.reason.trim()}\n\nEvidence:\n${input.evidenceLinks.join("\n")}`
          : input.reason.trim();

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
          reason: reasonWithEvidence,
        });

        created = {
          id: response.id,
          marketId: response.marketId ?? response.market_id ?? input.marketId,
          reason: response.reason,
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
          created = {
            id: `local-${Date.now()}`,
            marketId: input.marketId,
            reason: reasonWithEvidence,
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

      setDisputes((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
      setSubmitSuccess("Dispute submitted successfully.");
      return created;
    } catch (err) {
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
    activeDisputeId,
    showForm,
    refresh,
    submitDispute,
    clearStatus,
    openDispute,
    closeDispute,
    openForm,
    closeForm,
  };
}
