import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveOddsBadge from "./LiveOddsBadge";
import type { ConnectionStatus } from "@/hooks/useLiveOdds";

describe("LiveOddsBadge", () => {
  it("renders nothing when connected and not stale", () => {
    const { container } = render(
      <LiveOddsBadge status="connected" stale={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'Reconnecting…' when disconnected", () => {
    render(<LiveOddsBadge status="disconnected" stale={false} />);
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
  });

  it("shows 'Stale' when polling", () => {
    render(<LiveOddsBadge status="polling" stale={false} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("shows 'Stale' when connected but the data is older than the stale window", () => {
    render(<LiveOddsBadge status="connected" stale={true} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("shows 'Connecting…' while connecting", () => {
    render(<LiveOddsBadge status="connecting" stale={false} />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });
});