import { describe, expect, it } from "vitest";
import type { CreatorEventMatch, Prediction } from "@/context/CreatorEventsContext";
import { deriveCompetitionProgress } from "./useMyEvents";

const match = (id: string, matchTime: string): CreatorEventMatch => ({
  id, eventId: "event-1", teamA: "Alpha", teamB: "Beta", matchTime,
  outcome: "Pending", homeScore: null, awayScore: null, pointsMultiplier: 1,
});
const prediction = (matchId: string): Prediction => ({
  eventId: "event-1", matchId, outcome: "TeamA", submittedAt: "2026-06-01T12:00:00Z",
  predictedHomeScore: null, predictedAwayScore: null, pointsMultiplier: 1, pointsEarned: 0,
});

describe("deriveCompetitionProgress", () => {
  it("derives progress from unique fixture predictions and an improved rank", () => {
    const progress = deriveCompetitionProgress(
      [match("first", "2026-06-15T18:00:00Z"), match("second", "2026-06-17T18:00:00Z"), match("third", "2026-06-19T18:00:00Z")],
      [prediction("first"), prediction("first"), prediction("second"), prediction("other")],
      3, 5, new Date("2026-06-10T00:00:00Z"),
    );
    expect(progress).toMatchObject({ matchesPredicted: 2, totalMatches: 3, progressPercentage: 67, rank: 3, rankDelta: 2 });
  });

  it("selects the soonest upcoming deadline and a falling rank delta", () => {
    const progress = deriveCompetitionProgress(
      [match("past", "2026-06-08T18:00:00Z"), match("later", "2026-06-18T18:00:00Z"), match("soon", "2026-06-12T18:00:00Z")],
      [], 3, 1, new Date("2026-06-10T00:00:00Z"),
    );
    expect(progress.nextDeadline?.id).toBe("soon");
    expect(progress.rankDelta).toBe(-2);
  });
});
