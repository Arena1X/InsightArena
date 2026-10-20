import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CourseCompletionModal from "./CourseCompletionModal";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    submitCourseCompletion: vi.fn(),
  };
});

const mockedSubmit = vi.mocked(api.submitCourseCompletion);

describe("CourseCompletionModal", () => {
  beforeEach(() => {
    mockedSubmit.mockReset();
  });

  it("submits the course completion exactly once on a rapid double-click", async () => {
    let resolveSubmit: (value: api.CourseCompletionResponse) => void = () => {};
    mockedSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <CourseCompletionModal isOpen onClose={() => {}} courseId="crypto-101" />,
    );

    const claimButton = screen.getByRole("button", { name: /claim badge/i });

    // Two click events landing before React has a chance to re-render and
    // disable the button — the realistic shape of a genuine double-submit.
    act(() => {
      claimButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      claimButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      claimButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(claimButton).toBeDisabled();

    act(() => {
      resolveSubmit({ courseId: "crypto-101", status: "completed", awardedAt: "now" });
    });

    await waitFor(() =>
      expect(screen.getByText(/badge claimed successfully/i)).toBeInTheDocument(),
    );

    // Clicking again after success does not resubmit.
    act(() => {
      claimButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(mockedSubmit).toHaveBeenCalledTimes(1);
  });

  it("sends a stable idempotency key for the attempt", async () => {
    mockedSubmit.mockResolvedValue({
      courseId: "crypto-101",
      status: "completed",
      awardedAt: "now",
    });

    render(
      <CourseCompletionModal isOpen onClose={() => {}} courseId="crypto-101" />,
    );

    const claimButton = screen.getByRole("button", { name: /claim badge/i });
    act(() => {
      claimButton.click();
    });

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    const [calledCourseId, idempotencyKey] = mockedSubmit.mock.calls[0];
    expect(calledCourseId).toBe("crypto-101");
    expect(idempotencyKey).toContain("crypto-101");
  });

  it("shows an error with retry on failure, and reuses the same idempotency key on retry", async () => {
    mockedSubmit.mockRejectedValueOnce(new Error("network down"));
    mockedSubmit.mockResolvedValueOnce({
      courseId: "crypto-101",
      status: "completed",
      awardedAt: "now",
    });

    render(
      <CourseCompletionModal isOpen onClose={() => {}} courseId="crypto-101" />,
    );

    const claimButton = screen.getByRole("button", { name: /claim badge/i });
    act(() => {
      claimButton.click();
    });

    await waitFor(() => expect(screen.getByText(/failed to claim badge/i)).toBeInTheDocument());
    const retryButton = screen.getByRole("button", { name: /retry/i });

    act(() => {
      retryButton.click();
    });

    await waitFor(() =>
      expect(screen.getByText(/badge claimed successfully/i)).toBeInTheDocument(),
    );

    expect(mockedSubmit).toHaveBeenCalledTimes(2);
    const [, firstKey] = mockedSubmit.mock.calls[0];
    const [, secondKey] = mockedSubmit.mock.calls[1];
    expect(firstKey).toBe(secondKey);
  });

  it("generates a fresh idempotency key each time the modal is reopened", async () => {
    mockedSubmit.mockResolvedValue({
      courseId: "crypto-101",
      status: "completed",
      awardedAt: "now",
    });

    const { rerender } = render(
      <CourseCompletionModal isOpen onClose={() => {}} courseId="crypto-101" />,
    );
    act(() => {
      screen.getByRole("button", { name: /claim badge/i }).click();
    });
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    const [, firstOpenKey] = mockedSubmit.mock.calls[0];

    rerender(<CourseCompletionModal isOpen={false} onClose={() => {}} courseId="crypto-101" />);
    rerender(<CourseCompletionModal isOpen onClose={() => {}} courseId="crypto-101" />);

    act(() => {
      screen.getByRole("button", { name: /claim badge/i }).click();
    });
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(2));
    const [, secondOpenKey] = mockedSubmit.mock.calls[1];

    expect(secondOpenKey).not.toBe(firstOpenKey);
  });
});
