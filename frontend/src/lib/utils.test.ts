import { describe, expect, it } from "vitest";
import { buildTableOfContents, cn, filterDocSections } from "./utils";

describe("cn", () => {
  it("merges plain class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("applies conditional classes based on truthiness", () => {
    expect(cn("base", false && "hidden", true && "visible")).toBe(
      "base visible"
    );
  });

  it("resolves conflicting tailwind spacing classes by keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("resolves conflicting tailwind color classes by keeping the last one", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

const docSections = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Learn the basics of the platform.",
    content: "Welcome! You'll need a compatible wallet to begin.",
  },
  {
    id: "wallet-connection",
    title: "Wallet Connection",
    description: "Connect your digital wallet.",
    content: "Download a supported wallet and click connect.",
  },
  {
    id: "trading-guide",
    title: "How to Trade",
    description: "Step-by-step guide to placing a trade.",
    content: "Select a market, choose an outcome, and stake credits.",
  },
];

describe("buildTableOfContents", () => {
  it("maps each section to a TOC entry with the same id and title, preserving order", () => {
    expect(buildTableOfContents(docSections)).toEqual([
      { id: "getting-started", title: "Getting Started" },
      { id: "wallet-connection", title: "Wallet Connection" },
      { id: "trading-guide", title: "How to Trade" },
    ]);
  });

  it("returns one heading-anchored entry per section, with no extras or omissions", () => {
    const toc = buildTableOfContents(docSections);
    expect(toc).toHaveLength(docSections.length);
    expect(toc.map((entry) => entry.id)).toEqual(
      docSections.map((section) => section.id)
    );
  });

  it("returns an empty list for an empty input", () => {
    expect(buildTableOfContents([])).toEqual([]);
  });
});

describe("filterDocSections", () => {
  it("returns every section when the query is empty or whitespace", () => {
    expect(filterDocSections(docSections, "")).toEqual(docSections);
    expect(filterDocSections(docSections, "   ")).toEqual(docSections);
  });

  it("matches case-insensitively against the title", () => {
    const result = filterDocSections(docSections, "WALLET connection");
    expect(result.map((s) => s.id)).toEqual(["wallet-connection"]);
  });

  it("matches against the description when the title doesn't match", () => {
    const result = filterDocSections(docSections, "digital wallet");
    expect(result.map((s) => s.id)).toEqual(["wallet-connection"]);
  });

  it("matches against the body content when neither title nor description match", () => {
    const result = filterDocSections(docSections, "stake credits");
    expect(result.map((s) => s.id)).toEqual(["trading-guide"]);
  });

  it("returns multiple matches when more than one section matches the query", () => {
    const result = filterDocSections(docSections, "wallet");
    expect(result.map((s) => s.id)).toEqual([
      "getting-started",
      "wallet-connection",
    ]);
  });

  it("returns an empty array when no section matches", () => {
    expect(filterDocSections(docSections, "nonexistent-topic")).toEqual([]);
  });
});
