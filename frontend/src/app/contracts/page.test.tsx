import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ContractsPage from "./page";
import { getStellarExplorerUrl } from "@/lib/env";

describe("ContractsPage & getStellarExplorerUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStellarExplorerUrl constructs correct explorer URL based on network", () => {
    expect(getStellarExplorerUrl("C123", "testnet")).toBe(
      "https://stellar.expert/explorer/testnet/contract/C123",
    );
    expect(getStellarExplorerUrl("C456", "public")).toBe(
      "https://stellar.expert/explorer/public/contract/C456",
    );
  });

  it("renders copy button and explorer links when contract is configured", async () => {
    process.env.NEXT_PUBLIC_PREDICTION_CONTRACT = "CCONTRACT123TESTNET";
    render(<ContractsPage />);

    expect(screen.getByText("CCONTRACT123TESTNET")).toBeInTheDocument();
    const copyButton = screen.getByRole("button", {
      name: /copy testnet contract address/i,
    });
    expect(copyButton).toBeInTheDocument();

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    fireEvent.click(copyButton);
    expect(writeTextMock).toHaveBeenCalledWith("CCONTRACT123TESTNET");

    const explorerLink = screen.getByRole("link", {
      name: /view testnet contract on stellar explorer/i,
    });
    expect(explorerLink).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/contract/CCONTRACT123TESTNET",
    );
  });
});
