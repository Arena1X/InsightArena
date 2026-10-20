import { describe, it, expect } from "vitest";
import { formatCashOut } from "./utils";

describe("formatCashOut", () => {
  describe("non-finite values", () => {
    it("returns '—' for NaN", () => {
      expect(formatCashOut(NaN)).toBe("—");
    });

    it("returns '—' for Infinity", () => {
      expect(formatCashOut(Infinity)).toBe("—");
    });

    it("returns '—' for -Infinity", () => {
      expect(formatCashOut(-Infinity)).toBe("—");
    });
  });

  describe("zero and negative zero", () => {
    it("returns '0.00 XLM' for zero", () => {
      expect(formatCashOut(0)).toBe("0.00 XLM");
    });

    it("returns '0.00 XLM' for negative zero", () => {
      expect(formatCashOut(-0)).toBe("0.00 XLM");
    });
  });

  describe("typical amounts", () => {
    it("formats small positive amount", () => {
      expect(formatCashOut(0.5)).toBe("0.50 XLM");
    });

    it("formats typical amount", () => {
      expect(formatCashOut(10.5)).toBe("10.50 XLM");
    });

    it("formats negative amount", () => {
      expect(formatCashOut(-10.5)).toBe("-10.50 XLM");
    });
  });

  describe("large amounts", () => {
    it("formats large amount with thousand separators", () => {
      expect(formatCashOut(1000000)).toBe("1,000,000.00 XLM");
    });

    it("formats very large amount without precision loss", () => {
      expect(formatCashOut(999999999.99)).toBe("999,999,999.99 XLM");
    });

    it("formats billion-scale amount", () => {
      expect(formatCashOut(1000000000)).toBe("1,000,000,000.00 XLM");
    });
  });

  describe("sub-unit amounts", () => {
    it("shows non-zero value for very small positive amounts", () => {
      const result = formatCashOut(0.000001);
      // Should not be "0.00 XLM" and should contain the actual value
      expect(result).not.toBe("0.00 XLM");
      expect(result).toContain("XLM");
      expect(result).toContain("0.000001");
    });

    it("shows non-zero value for amounts smaller than digits threshold", () => {
      const result = formatCashOut(0.001, "en-US", 2);
      expect(result).not.toBe("0.00 XLM");
      expect(result).toContain("XLM");
    });

    it("formats sub-unit amounts with up to 7 significant digits", () => {
      const result = formatCashOut(0.0000001);
      expect(result).toContain("XLM");
      // Should be a very small but non-zero number
      expect(result).not.toBe("0.00 XLM");
    });
  });

  describe("locale formatting", () => {
    it("uses en-US locale by default with comma thousand separator", () => {
      const result = formatCashOut(1000.5, "en-US");
      expect(result).toBe("1,000.50 XLM");
    });

    it("applies German locale formatting with dot thousand separator and comma decimal", () => {
      const result = formatCashOut(1000.5, "de-DE");
      expect(result).toContain("1.000");
      expect(result).toContain(",5");
      expect(result).toContain("XLM");
    });

    it("applies French locale formatting", () => {
      const result = formatCashOut(1000.5, "fr-FR");
      // French uses narrow no-break space as thousand separator and comma as decimal
      expect(result).toContain(",5");
      expect(result).toContain("XLM");
    });

    it("handles large German locale amount", () => {
      const result = formatCashOut(1000000.25, "de-DE");
      expect(result).toContain("1.000.000");
      expect(result).toContain(",25");
      expect(result).toContain("XLM");
    });

    it("handles large French locale amount", () => {
      const result = formatCashOut(1000000.25, "fr-FR");
      expect(result).toContain(",25");
      expect(result).toContain("XLM");
    });
  });

  describe("custom digits parameter", () => {
    it("formats with 4 decimal places", () => {
      expect(formatCashOut(10.123, "en-US", 4)).toBe("10.1230 XLM");
    });

    it("formats with 0 decimal places", () => {
      const result = formatCashOut(10.5, "en-US", 0);
      // 10.5 rounds to 11 with 0 decimal places
      expect(result).toBe("11 XLM");
    });

    it("formats with 1 decimal place", () => {
      expect(formatCashOut(10.55, "en-US", 1)).toBe("10.6 XLM");
    });

    it("formats with 6 decimal places", () => {
      expect(formatCashOut(1.123456, "en-US", 6)).toBe("1.123456 XLM");
    });
  });

  describe("edge cases", () => {
    it("handles very small negative amounts", () => {
      const result = formatCashOut(-0.000001);
      expect(result).toContain("-");
      expect(result).toContain("XLM");
      expect(result).not.toBe("-0.00 XLM");
    });

    it("handles scientific notation input", () => {
      const result = formatCashOut(1e6);
      expect(result).toBe("1,000,000.00 XLM");
    });

    it("handles scientific notation with small exponent", () => {
      const result = formatCashOut(1e-7);
      expect(result).toContain("XLM");
      expect(result).not.toBe("0.00 XLM");
    });

    it("preserves existing digits default when not specified", () => {
      const result = formatCashOut(10.5);
      expect(result).toBe("10.50 XLM");
    });

    it("handles amounts with many trailing zeros", () => {
      expect(formatCashOut(100.00)).toBe("100.00 XLM");
    });

    it("handles amounts requiring rounding", () => {
      expect(formatCashOut(10.555)).toBe("10.56 XLM");
    });
  });

  describe("locale with digits combination", () => {
    it("applies German locale with custom digits", () => {
      const result = formatCashOut(1000.5678, "de-DE", 3);
      expect(result).toContain("1.000");
      expect(result).toContain(",568");
      expect(result).toContain("XLM");
    });

    it("applies French locale with 0 digits", () => {
      const result = formatCashOut(1000.9, "fr-FR", 0);
      expect(result).toContain("1");
      expect(result).toContain("XLM");
    });
  });
});
