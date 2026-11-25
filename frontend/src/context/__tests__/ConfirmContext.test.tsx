import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmProvider } from "../ConfirmContext";
import { useConfirm } from "@/hooks/useConfirm";

function ConfirmTrigger({ onResult }: { onResult: (result: boolean) => void }) {
  const confirm = useConfirm();

  return (
    <button
      type="button"
      onClick={async () => onResult(await confirm({ title: "Confirm action?" }))}
    >
      Open confirmation
    </button>
  );
}

function renderConfirmDialog(onResult = vi.fn()) {
  render(
    <ConfirmProvider>
      <ConfirmTrigger onResult={onResult} />
    </ConfirmProvider>,
  );

  return {
    onResult,
    trigger: screen.getByRole("button", { name: "Open confirmation" }),
  };
}

describe("ConfirmProvider keyboard accessibility", () => {
  it("cancels on Escape and restores focus to the trigger", async () => {
    const { onResult, trigger } = renderConfirmDialog();
    fireEvent.click(trigger);

    await screen.findByRole("dialog", { name: "Confirm action?" });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("confirms and cancels using keyboard activation", async () => {
    const user = userEvent.setup();
    const { onResult } = renderConfirmDialog();
    fireEvent.click(screen.getByRole("button", { name: "Open confirmation" }));

    const confirmButton = await screen.findByRole("button", { name: "Confirm" });
    await waitFor(() => expect(confirmButton).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));

    onResult.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    await screen.findByRole("button", { name: "Confirm" });

    await user.tab();
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toHaveFocus();
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancelButton).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});

describe("ConfirmProvider async confirm support", () => {
  it("stays pending with loading state until async action resolves", async () => {
    let resolveAction!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const onResult = vi.fn();

    function AsyncTrigger() {
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={async () =>
            onResult(await confirm({ title: "Delete item?", onConfirm }))
          }
        >
          Trigger async
        </button>
      );
    }

    render(
      <ConfirmProvider>
        <AsyncTrigger />
      </ConfirmProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger async" }));
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveAttribute("aria-busy", "true");
    expect(onResult).not.toHaveBeenCalled();

    resolveAction();

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open and shows an error when the async action rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Server unavailable"));
    const onResult = vi.fn();

    function AsyncTrigger() {
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={async () =>
            onResult(await confirm({ title: "Delete item?", onConfirm }))
          }
        >
          Trigger async
        </button>
      );
    }

    render(
      <ConfirmProvider>
        <AsyncTrigger />
      </ConfirmProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger async" }));
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server unavailable");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirmBtn).not.toBeDisabled();
    expect(onResult).not.toHaveBeenCalled();
  });
});