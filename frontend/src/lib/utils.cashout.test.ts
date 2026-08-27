import { estimateCashOut } from "./utils";

describe("estimateCashOut", () => {
  test("matches sample odds for a Yes position", () => {
    // stake 100 at entry 0.50 → 200 shares; live yes 0.60 → value 120, pnl +20
    const result = estimateCashOut({
      stake: 100,
      stance: "Yes",
      entryOdds: 0.5,
      live: { yes: 0.6, no: 0.4 },
      marketLocked: false,
    });
    expect(result.estimatedValue).toBeCloseTo(120, 5);
    expect(result.unrealizedPnl).toBeCloseTo(20, 5);
    expect(result.canExit).toBe(true);
    expect(result.exitBlockedReason).toBeNull();
  });

  test("uses no price for No stance", () => {
    const result = estimateCashOut({
      stake: 50,
      stance: "No",
      entryOdds: 0.4,
      live: { yes: 0.7, no: 0.3 },
      marketLocked: false,
    });
    // shares = 50/0.4 = 125; value = 125 * 0.3 = 37.5; pnl = -12.5
    expect(result.estimatedValue).toBeCloseTo(37.5, 5);
    expect(result.unrealizedPnl).toBeCloseTo(-12.5, 5);
    expect(result.canExit).toBe(true);
  });

  test("locked market disables exit", () => {
    const result = estimateCashOut({
      stake: 50,
      stance: "Yes",
      entryOdds: 0.5,
      live: { yes: 0.6, no: 0.4 },
      marketLocked: true,
    });
    expect(result.canExit).toBe(false);
    expect(result.exitBlockedReason).toMatch(/locked/i);
  });

  test("missing live odds disables exit", () => {
    const result = estimateCashOut({
      stake: 50,
      stance: "Yes",
      entryOdds: 0.5,
      live: null,
      marketLocked: false,
    });
    expect(result.canExit).toBe(false);
    expect(result.exitBlockedReason).toMatch(/odds/i);
  });
});
