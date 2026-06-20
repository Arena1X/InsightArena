"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useWallet } from "@/context/WalletContext";

export type EventStatus = "Active" | "Completed" | "Cancelled";
export type MatchOutcome = "TeamA" | "TeamB" | "Draw" | "Pending";
export type PrizeCurrency = "XLM" | "USDC";
export type PayoutStatus = "Projected" | "Claimable" | "Paid" | "Voided";

export interface MoneyAmount {
  amount: number;
  currency: PrizeCurrency;
  display: string;
}

export interface RewardSplit {
  rank: number;
  percentage: number;
  label: string;
}

export interface EventBranding {
  accentColor: string;
  backgroundColor: string;
  bannerImage: string;
  logoText: string;
}

export interface CreatorEvent {
  id: string;
  title: string;
  description: string;
  creator: string;
  maxParticipants: number;
  participants: number;
  status: EventStatus;
  inviteCode: string;
  matchesCount: number;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  durationDays: number;
  prizePool: MoneyAmount;
  rewardSplit: RewardSplit[];
  entryFee: MoneyAmount;
  branding: EventBranding;
  pointsMultiplier: number;
  joined?: boolean;
  startTime?: string;
  rewardDistribution?: RewardDistribution;
  category?: string;
  bannerUrl?: string;
}

export interface CreatorEventMatch {
  id: string;
  eventId: string;
  teamA: string;
  teamB: string;
  matchTime: string;
  outcome: MatchOutcome;
<<<<<<< Updated upstream
  homeScore: number | null;
  awayScore: number | null;
  pointsMultiplier: number;
=======
  multiplier?: 1 | 2 | 3;
>>>>>>> Stashed changes
}

export interface Participant {
  address: string;
  joinedAt: string;
  score: number;
  predictions: number;
  correctPredictions: number;
  pointsEarned: number;
}

export interface Prediction {
  eventId: string;
  matchId: string;
  outcome: MatchOutcome;
  submittedAt: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  pointsMultiplier: number;
  pointsEarned: number;
}

export interface Winner {
  address: string;
  score: number;
  rank: number;
  payout: MoneyAmount;
}

export interface EventLeaderboardEntry {
  address: string;
  rank: number;
  score: number;
  predictions: number;
  correctPredictions: number;
  pointsEarned: number;
  payout: MoneyAmount | null;
}

export interface EventPayout {
  eventId: string;
  address: string;
  rank: number;
  percentage: number;
  payout: MoneyAmount;
  status: PayoutStatus;
}

export interface UserPayout {
  eventId: string;
  address: string;
  rank: number | null;
  payout: MoneyAmount;
  percentage: number;
  status: PayoutStatus;
}

export interface AddMatchInput {
  eventId: string;
  teamA: string;
  teamB: string;
  matchTime: string;
  outcome?: MatchOutcome;
  homeScore?: number | null;
  awayScore?: number | null;
  pointsMultiplier?: number;
}

export interface SubmitPredictionInput {
  eventId?: string;
  matchId: string;
  outcome: MatchOutcome;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
  pointsMultiplier?: number;
}

export interface RewardDistribution {
  rank1: number;
  rank2: number;
  rank3: number;
  rank4: number;
  rank5: number;
}

export interface CreateEventInput {
  title: string;
  description: string;
  maxParticipants: number;
  startTime: string;
  endTime: string;
  prizePool: number;
  rewardDistribution: RewardDistribution;
  entryFee: number;
  category: string;
  bannerUrl: string;
}

export interface CreatorEventsContextValue {
  myJoinedEvents: CreatorEvent[];
  myCreatedEvents: CreatorEvent[];
  eventCache: Record<string, CreatorEvent>;
  isLoading: boolean;
  error: string | null;

  createEvent: (
    input: CreateEventInput,
  ) => Promise<{ eventId: string; inviteCode: string }>;
  joinEvent: (inviteCode: string) => Promise<boolean>;
  addMatch: (
<<<<<<< Updated upstream
    input: AddMatchInput | string,
    teamA?: string,
    teamB?: string,
    matchTime?: string,
    details?: Partial<AddMatchInput>,
=======
    eventId: string,
    teamA: string,
    teamB: string,
    matchTime: string,
    multiplier: 1 | 2 | 3,
>>>>>>> Stashed changes
  ) => Promise<string>;
  submitPrediction: (
    input: SubmitPredictionInput | string,
    outcome?: MatchOutcome,
    details?: Partial<SubmitPredictionInput>,
  ) => Promise<boolean>;
  cancelEvent: (eventId: string) => Promise<boolean>;
  verifyWinners: (eventId: string) => Promise<boolean>;

  getEvent: (eventId: string) => Promise<CreatorEvent | null>;
  getEventByCode: (inviteCode: string) => Promise<CreatorEvent | null>;
  getEventMatches: (eventId: string) => Promise<CreatorEventMatch[]>;
  getUserPredictions: (eventId: string) => Promise<Prediction[]>;
  getEventParticipants: (eventId: string) => Promise<Participant[]>;
  getEventWinners: (eventId: string) => Promise<Winner[]>;
  getUserScore: (eventId: string) => Promise<number>;
  getEventLeaderboard: (eventId: string) => Promise<EventLeaderboardEntry[]>;
  getEventPayouts: (eventId: string) => Promise<EventPayout[]>;
  getUserPayout: (
    eventId: string,
    userAddress?: string,
  ) => Promise<UserPayout | null>;

  setCreationFee: (newFee: string) => Promise<boolean>;
  setTreasury: (newAddress: string) => Promise<boolean>;
  setAIAgent: (newAddress: string) => Promise<boolean>;
  verifyAddress: (address: string) => Promise<boolean>;
  batchVerifyAddresses: (addresses: string[]) => Promise<boolean>;
  unverifyAddress: (address: string) => Promise<boolean>;
  withdrawFees: (to: string, amount: string) => Promise<boolean>;
  pauseContract: () => Promise<boolean>;
  unpauseContract: () => Promise<boolean>;

  submitMatchResult: (
    matchId: string,
    outcome: MatchOutcome,
    scoreline?: { homeScore: number | null; awayScore: number | null },
  ) => Promise<boolean>;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BASE_OUTCOME_POINTS = 100;
const EXACT_SCORE_BONUS = 50;

const DEFAULT_REWARD_SPLIT: RewardSplit[] = [
  { rank: 1, percentage: 50, label: "Champion" },
  { rank: 2, percentage: 30, label: "Runner-up" },
  { rank: 3, percentage: 20, label: "Third place" },
];

const DEFAULT_BRANDING: EventBranding = {
  accentColor: "#F97316",
  backgroundColor: "#111827",
  bannerImage: "/creator-events/default-banner.jpg",
  logoText: "IA",
};

const formatTokenAmount = (amount: number) =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2);

const money = (amount: number, currency: PrizeCurrency = "XLM"): MoneyAmount => ({
  amount,
  currency,
  display: `${formatTokenAmount(amount)} ${currency}`,
});

const calculateDurationDays = (startsAt: string, endsAt: string) =>
  Math.max(
    1,
    Math.ceil((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / DAY_IN_MS),
  );

const deriveOutcomeFromScore = (
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): MatchOutcome => {
  if (homeScore == null || awayScore == null) return "Pending";
  if (homeScore > awayScore) return "TeamA";
  if (awayScore > homeScore) return "TeamB";
  return "Draw";
};

const createEventCache = (events: CreatorEvent[]) =>
  events.reduce<Record<string, CreatorEvent>>((cache, event) => {
    cache[event.id] = event;
    return cache;
  }, {});

const getPayoutStatus = (event: CreatorEvent): PayoutStatus => {
  if (event.status === "Cancelled") return "Voided";
  if (event.status === "Completed") return "Claimable";
  return "Projected";
};

const calculatePredictionPoints = (
  input: SubmitPredictionInput,
  match: CreatorEventMatch | undefined,
  event: CreatorEvent | undefined,
) => {
  if (!match || match.outcome === "Pending" || input.outcome !== match.outcome) {
    return 0;
  }

  const multiplier =
    input.pointsMultiplier ?? match.pointsMultiplier * (event?.pointsMultiplier ?? 1);
  const scoreBonus =
    input.predictedHomeScore === match.homeScore &&
    input.predictedAwayScore === match.awayScore
      ? EXACT_SCORE_BONUS
      : 0;

  return Math.round((BASE_OUTCOME_POINTS + scoreBonus) * multiplier);
};

const MOCK_EVENTS: CreatorEvent[] = [
  {
    id: "event-001",
    title: "Apollo Tournament",
    description:
      "Invite-only prediction tournament across multiple creator matches.",
    creator: "GCF5T...9V2H",
    maxParticipants: 100,
    participants: 72,
    status: "Active",
    inviteCode: "APOLLO-2026",
    matchesCount: 4,
    createdAt: "2026-06-01T09:00:00Z",
    startsAt: "2026-06-10T18:00:00Z",
    endsAt: "2026-06-24T23:59:59Z",
    durationDays: calculateDurationDays(
      "2026-06-10T18:00:00Z",
      "2026-06-24T23:59:59Z",
    ),
    prizePool: money(5000),
    rewardSplit: DEFAULT_REWARD_SPLIT,
    entryFee: money(25),
    branding: {
      accentColor: "#F59E0B",
      backgroundColor: "#111827",
      bannerImage: "/creator-events/apollo-banner.jpg",
      logoText: "AP",
    },
    pointsMultiplier: 1.5,
    joined: true,
  },
  {
    id: "event-002",
    title: "Season Finale Challenge",
    description:
      "Final creator event with exclusive insights and milestone rewards.",
    creator: "GAB7W...2CPL",
    maxParticipants: 50,
    participants: 48,
    status: "Completed",
    inviteCode: "FINALS-2026",
    matchesCount: 3,
    createdAt: "2026-05-01T09:00:00Z",
    startsAt: "2026-05-06T16:00:00Z",
    endsAt: "2026-05-12T23:59:59Z",
    durationDays: calculateDurationDays(
      "2026-05-06T16:00:00Z",
      "2026-05-12T23:59:59Z",
    ),
    prizePool: money(2500),
    rewardSplit: DEFAULT_REWARD_SPLIT,
    entryFee: money(10),
    branding: {
      accentColor: "#22C55E",
      backgroundColor: "#052E16",
      bannerImage: "/creator-events/finals-banner.jpg",
      logoText: "SF",
    },
    pointsMultiplier: 1,
    joined: false,
  },
  {
    id: "event-003",
    title: "Rising Stars Invite",
    description:
      "Small-group prediction event for emerging creators and active supporters.",
    creator: "GCT2L...45QZ",
    maxParticipants: 20,
    participants: 18,
    status: "Active",
    inviteCode: "RISING-2026",
    matchesCount: 5,
    createdAt: "2026-06-08T10:30:00Z",
    startsAt: "2026-06-15T19:00:00Z",
    endsAt: "2026-07-01T23:59:59Z",
    durationDays: calculateDurationDays(
      "2026-06-15T19:00:00Z",
      "2026-07-01T23:59:59Z",
    ),
    prizePool: money(1200),
    rewardSplit: [
      { rank: 1, percentage: 60, label: "First" },
      { rank: 2, percentage: 25, label: "Second" },
      { rank: 3, percentage: 15, label: "Third" },
    ],
    entryFee: money(5),
    branding: {
      accentColor: "#38BDF8",
      backgroundColor: "#082F49",
      bannerImage: "/creator-events/rising-stars-banner.jpg",
      logoText: "RS",
    },
    pointsMultiplier: 2,
    joined: false,
  },
  {
    id: "event-004",
    title: "Insight Arena Private Cup",
    description:
      "An invite-only series of prediction battles with high participation demand.",
    creator: "GDR8N...1BWE",
    maxParticipants: 100,
    participants: 100,
    status: "Cancelled",
    inviteCode: "PRIVATE-CUP",
    matchesCount: 2,
    createdAt: "2026-05-02T11:00:00Z",
    startsAt: "2026-05-09T18:30:00Z",
    endsAt: "2026-05-29T23:59:59Z",
    durationDays: calculateDurationDays(
      "2026-05-09T18:30:00Z",
      "2026-05-29T23:59:59Z",
    ),
    prizePool: money(7500),
    rewardSplit: [
      { rank: 1, percentage: 70, label: "Cup winner" },
      { rank: 2, percentage: 20, label: "Finalist" },
      { rank: 3, percentage: 10, label: "Semifinalist" },
    ],
    entryFee: money(50),
    branding: {
      accentColor: "#E11D48",
      backgroundColor: "#4C0519",
      bannerImage: "/creator-events/private-cup-banner.jpg",
      logoText: "PC",
    },
    pointsMultiplier: 1.25,
    joined: false,
  },
];

const MOCK_MATCHES: Record<string, CreatorEventMatch[]> = {
  "event-001": [
    {
      id: "match-001",
      eventId: "event-001",
      teamA: "Team Alpha",
      teamB: "Team Beta",
      matchTime: "2026-06-12T18:00:00Z",
      outcome: "TeamA",
      homeScore: 2,
      awayScore: 1,
      pointsMultiplier: 1,
    },
    {
      id: "match-002",
      eventId: "event-001",
      teamA: "Team Gamma",
      teamB: "Team Delta",
      matchTime: "2026-06-14T20:00:00Z",
      outcome: "Draw",
      homeScore: 1,
      awayScore: 1,
      pointsMultiplier: 1.25,
    },
    {
      id: "match-003",
      eventId: "event-001",
      teamA: "Team Alpha",
      teamB: "Team Gamma",
      matchTime: "2026-06-19T18:00:00Z",
      outcome: "Pending",
      homeScore: null,
      awayScore: null,
      pointsMultiplier: 1.5,
    },
    {
      id: "match-004",
      eventId: "event-001",
      teamA: "Team Beta",
      teamB: "Team Delta",
      matchTime: "2026-06-21T20:00:00Z",
      outcome: "Pending",
      homeScore: null,
      awayScore: null,
      pointsMultiplier: 1,
    },
  ],
  "event-002": [
    {
      id: "match-005",
      eventId: "event-002",
      teamA: "Red Eagles",
      teamB: "Blue Hawks",
      matchTime: "2026-05-08T16:00:00Z",
      outcome: "TeamB",
      homeScore: 0,
      awayScore: 2,
      pointsMultiplier: 1,
    },
    {
      id: "match-006",
      eventId: "event-002",
      teamA: "Green Vipers",
      teamB: "Red Eagles",
      matchTime: "2026-05-10T16:00:00Z",
      outcome: "TeamA",
      homeScore: 3,
      awayScore: 1,
      pointsMultiplier: 1.5,
    },
    {
      id: "match-007",
      eventId: "event-002",
      teamA: "Blue Hawks",
      teamB: "Green Vipers",
      matchTime: "2026-05-11T16:00:00Z",
      outcome: "TeamA",
      homeScore: 2,
      awayScore: 0,
      pointsMultiplier: 1,
    },
  ],
  "event-003": [
    {
      id: "match-008",
      eventId: "event-003",
      teamA: "Stars FC",
      teamB: "Nova SC",
      matchTime: "2026-06-16T19:00:00Z",
      outcome: "TeamA",
      homeScore: 1,
      awayScore: 0,
      pointsMultiplier: 1,
    },
    {
      id: "match-009",
      eventId: "event-003",
      teamA: "Apex United",
      teamB: "Stars FC",
      matchTime: "2026-06-20T19:00:00Z",
      outcome: "Pending",
      homeScore: null,
      awayScore: null,
      pointsMultiplier: 1.25,
    },
    {
      id: "match-010",
      eventId: "event-003",
      teamA: "Nova SC",
      teamB: "Rising Sun",
      matchTime: "2026-06-24T19:00:00Z",
      outcome: "Pending",
      homeScore: null,
      awayScore: null,
      pointsMultiplier: 1,
    },
    {
      id: "match-011",
      eventId: "event-003",
      teamA: "Stars FC",
      teamB: "Rising Sun",
      matchTime: "2026-06-27T19:00:00Z",
      outcome: "Pending",
      homeScore: null,
      awayScore: null,
      pointsMultiplier: 1.5,
    },
    {
      id: "match-012",
      eventId: "event-003",
      teamA: "Apex United",
      teamB: "Nova SC",
      matchTime: "2026-06-30T19:00:00Z",
      outcome: "Pending",
      homeScore: null,
      awayScore: null,
      pointsMultiplier: 1,
    },
  ],
  "event-004": [
    {
      id: "match-013",
      eventId: "event-004",
      teamA: "North Guild",
      teamB: "South Guild",
      matchTime: "2026-05-12T18:30:00Z",
      outcome: "TeamB",
      homeScore: 1,
      awayScore: 3,
      pointsMultiplier: 1,
    },
    {
      id: "match-014",
      eventId: "event-004",
      teamA: "East Guild",
      teamB: "West Guild",
      matchTime: "2026-05-15T18:30:00Z",
      outcome: "Draw",
      homeScore: 2,
      awayScore: 2,
      pointsMultiplier: 1.25,
    },
  ],
};

const MOCK_PARTICIPANTS: Record<string, Participant[]> = {
  "event-001": [
    {
      address: "GCF5T...9V2H",
      joinedAt: "2026-06-01T10:00:00Z",
      score: 420,
      predictions: 4,
      correctPredictions: 3,
      pointsEarned: 420,
    },
    {
      address: "GAB7W...2CPL",
      joinedAt: "2026-06-02T11:30:00Z",
      score: 340,
      predictions: 4,
      correctPredictions: 2,
      pointsEarned: 340,
    },
    {
      address: "GCT2L...45QZ",
      joinedAt: "2026-06-03T09:15:00Z",
      score: 260,
      predictions: 3,
      correctPredictions: 2,
      pointsEarned: 260,
    },
  ],
  "event-002": [
    {
      address: "GAB7W...2CPL",
      joinedAt: "2026-05-01T11:30:00Z",
      score: 510,
      predictions: 3,
      correctPredictions: 3,
      pointsEarned: 510,
    },
    {
      address: "GDR8N...1BWE",
      joinedAt: "2026-05-02T09:10:00Z",
      score: 375,
      predictions: 3,
      correctPredictions: 2,
      pointsEarned: 375,
    },
    {
      address: "GCF5T...9V2H",
      joinedAt: "2026-05-03T13:45:00Z",
      score: 300,
      predictions: 3,
      correctPredictions: 2,
      pointsEarned: 300,
    },
  ],
  "event-003": [
    {
      address: "GCT2L...45QZ",
      joinedAt: "2026-06-10T14:00:00Z",
      score: 180,
      predictions: 2,
      correctPredictions: 1,
      pointsEarned: 180,
    },
    {
      address: "GCF5T...9V2H",
      joinedAt: "2026-06-11T12:00:00Z",
      score: 150,
      predictions: 2,
      correctPredictions: 1,
      pointsEarned: 150,
    },
    {
      address: "GAB7W...2CPL",
      joinedAt: "2026-06-12T16:20:00Z",
      score: 90,
      predictions: 1,
      correctPredictions: 1,
      pointsEarned: 90,
    },
  ],
  "event-004": [
    {
      address: "GDR8N...1BWE",
      joinedAt: "2026-05-04T10:00:00Z",
      score: 240,
      predictions: 2,
      correctPredictions: 2,
      pointsEarned: 240,
    },
    {
      address: "GCT2L...45QZ",
      joinedAt: "2026-05-05T10:45:00Z",
      score: 170,
      predictions: 2,
      correctPredictions: 1,
      pointsEarned: 170,
    },
    {
      address: "GAB7W...2CPL",
      joinedAt: "2026-05-06T08:30:00Z",
      score: 120,
      predictions: 2,
      correctPredictions: 1,
      pointsEarned: 120,
    },
  ],
};

const MOCK_USER_PREDICTIONS: Record<string, Prediction[]> = {
  "event-001": [
    {
      eventId: "event-001",
      matchId: "match-001",
      outcome: "TeamA",
      submittedAt: "2026-06-11T08:00:00Z",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      pointsMultiplier: 1.5,
      pointsEarned: 225,
    },
    {
      eventId: "event-001",
      matchId: "match-002",
      outcome: "Draw",
      submittedAt: "2026-06-13T08:00:00Z",
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      pointsMultiplier: 1.875,
      pointsEarned: 281,
    },
  ],
  "event-002": [
    {
      eventId: "event-002",
      matchId: "match-005",
      outcome: "TeamB",
      submittedAt: "2026-05-07T08:00:00Z",
      predictedHomeScore: 0,
      predictedAwayScore: 2,
      pointsMultiplier: 1,
      pointsEarned: 150,
    },
  ],
  "event-003": [
    {
      eventId: "event-003",
      matchId: "match-008",
      outcome: "TeamA",
      submittedAt: "2026-06-15T08:00:00Z",
      predictedHomeScore: 1,
      predictedAwayScore: 0,
      pointsMultiplier: 2,
      pointsEarned: 300,
    },
  ],
};

const DEFAULT_CONTEXT_VALUE: CreatorEventsContextValue = {
  myJoinedEvents: [],
  myCreatedEvents: [],
  eventCache: {},
  isLoading: false,
  error: null,
  createEvent: async () => ({ eventId: "", inviteCode: "" }),
  joinEvent: async () => false,
  addMatch: async () => "",
  submitPrediction: async () => false,
  cancelEvent: async () => false,
  verifyWinners: async () => false,
  getEvent: async () => null,
  getEventByCode: async () => null,
  getEventMatches: async () => [],
  getUserPredictions: async () => [],
  getEventParticipants: async () => [],
  getEventWinners: async () => [],
  getUserScore: async () => 0,
  getEventLeaderboard: async () => [],
  getEventPayouts: async () => [],
  getUserPayout: async () => null,
  setCreationFee: async () => false,
  setTreasury: async () => false,
  setAIAgent: async () => false,
  verifyAddress: async () => false,
  batchVerifyAddresses: async () => false,
  unverifyAddress: async () => false,
  withdrawFees: async () => false,
  pauseContract: async () => false,
  unpauseContract: async () => false,
  submitMatchResult: async () => false,
};

const CreatorEventsContext =
  createContext<CreatorEventsContextValue>(DEFAULT_CONTEXT_VALUE);

export function CreatorEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address } = useWallet();
  const [events, setEvents] = useState<CreatorEvent[]>(MOCK_EVENTS);
  const [eventCache, setEventCache] = useState<Record<string, CreatorEvent>>(
    () => createEventCache(MOCK_EVENTS),
  );
  const [matchesCache, setMatchesCache] =
    useState<Record<string, CreatorEventMatch[]>>(MOCK_MATCHES);
  const [participantsCache, setParticipantsCache] =
    useState<Record<string, Participant[]>>(MOCK_PARTICIPANTS);
  const [predictionsCache, setPredictionsCache] =
    useState<Record<string, Prediction[]>>(MOCK_USER_PREDICTIONS);

  const updateEvent = useCallback((eventId: string, patch: Partial<CreatorEvent>) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId ? { ...event, ...patch } : event,
      ),
    );
    setEventCache((current) => ({
      ...current,
      [eventId]: { ...current[eventId], ...patch },
    }));
  }, []);

  const findMatch = useCallback(
    (matchId: string) =>
      Object.values(matchesCache)
        .flat()
        .find((match) => match.id === matchId),
    [matchesCache],
  );

  const buildPayouts = useCallback(
    (eventId: string, leaderboard: EventLeaderboardEntry[]) => {
      const event = eventCache[eventId];
      if (!event || event.status === "Cancelled") return [];

      return event.rewardSplit
        .map<EventPayout | null>((split) => {
          const participant = leaderboard.find((entry) => entry.rank === split.rank);
          if (!participant) return null;

          const payout = money(
            Math.round(event.prizePool.amount * split.percentage) / 100,
            event.prizePool.currency,
          );

          return {
            eventId,
            address: participant.address,
            rank: split.rank,
            percentage: split.percentage,
            payout,
            status: getPayoutStatus(event),
          };
        })
        .filter((payout): payout is EventPayout => Boolean(payout));
    },
    [eventCache],
  );
  const getEventLeaderboard = useCallback(
    async (eventId: string) => {
      const event = eventCache[eventId];
      const participants = [...(participantsCache[eventId] ?? [])].sort(
        (a, b) => b.score - a.score,
      );

      const baseLeaderboard = participants.map<EventLeaderboardEntry>(
        (participant, index) => ({
          address: participant.address,
          rank: index + 1,
          score: participant.score,
          predictions: participant.predictions,
          correctPredictions: participant.correctPredictions,
          pointsEarned: participant.pointsEarned,
          payout: null,
        }),
      );

      if (!event || event.status === "Cancelled") return baseLeaderboard;

      const payouts = buildPayouts(eventId, baseLeaderboard);
      return baseLeaderboard.map((entry) => {
        const payout = payouts.find((item) => item.address === entry.address);
        return {
          ...entry,
          payout: payout?.payout ?? null,
        };
      });
    },
    [buildPayouts, eventCache, participantsCache],
  );

  const getEventPayouts = useCallback(
    async (eventId: string) => {
      const leaderboard = await getEventLeaderboard(eventId);
      return buildPayouts(eventId, leaderboard);
    },
    [buildPayouts, getEventLeaderboard],
  );

  const getUserPayout = useCallback(
    async (eventId: string, userAddress?: string) => {
      const lookupAddress = userAddress ?? address;
      if (!lookupAddress) return null;

      const payouts = await getEventPayouts(eventId);
      const payout = payouts.find((item) => item.address === lookupAddress);

      if (payout) {
        return {
          eventId,
          address: lookupAddress,
          rank: payout.rank,
          payout: payout.payout,
          percentage: payout.percentage,
          status: payout.status,
        };
      }

      const leaderboard = await getEventLeaderboard(eventId);
      const participant = leaderboard.find((entry) => entry.address === lookupAddress);
      if (!participant) return null;

      return {
        eventId,
        address: lookupAddress,
        rank: participant.rank,
        payout: money(0, eventCache[eventId]?.prizePool.currency ?? "XLM"),
        percentage: 0,
        status: getPayoutStatus(eventCache[eventId]),
      };
    },
    [address, eventCache, getEventLeaderboard, getEventPayouts],
  );

  const createEvent = useCallback(
    async (input: CreateEventInput): Promise<{ eventId: string; inviteCode: string }> => {
      const eventId = `event-${Date.now()}`;
      const inviteCode = `${input.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 12)
        .toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const startsAt = input.startTime || new Date().toISOString();
      const endsAt = input.endTime || new Date(new Date(startsAt).getTime() + 7 * DAY_IN_MS).toISOString();
      const prizePoolAmount = input.prizePool || 0;
      const entryFeeAmount = input.entryFee || 0;
      const prizePool = money(prizePoolAmount);
      const entryFee = money(entryFeeAmount);

      const rewardSplit: RewardSplit[] = input.rewardDistribution
        ? [
            { rank: 1, percentage: input.rewardDistribution.rank1, label: "#1" },
            { rank: 2, percentage: input.rewardDistribution.rank2, label: "#2" },
            { rank: 3, percentage: input.rewardDistribution.rank3, label: "#3" },
            { rank: 4, percentage: input.rewardDistribution.rank4, label: "#4" },
            { rank: 5, percentage: input.rewardDistribution.rank5, label: "#5" },
          ].filter((r) => r.percentage > 0)
        : DEFAULT_REWARD_SPLIT;

      const event: CreatorEvent = {
        id: eventId,
        title: input.title,
        description: input.description,
        creator: address ?? "GUEST-CREATOR",
        maxParticipants: input.maxParticipants,
        participants: 0,
        status: "Active",
        inviteCode,
        matchesCount: 0,
        createdAt: new Date().toISOString(),
        startsAt,
        endsAt,
        durationDays: calculateDurationDays(startsAt, endsAt),
        prizePool,
        rewardSplit,
        entryFee,
        branding: DEFAULT_BRANDING,
        pointsMultiplier: 1,
        joined: false,
        startTime: input.startTime,
        rewardDistribution: input.rewardDistribution,
        category: input.category,
        bannerUrl: input.bannerUrl,
      };

      setEvents((current) => [event, ...current]);
      setEventCache((current) => ({ ...current, [eventId]: event }));
      setMatchesCache((current) => ({ ...current, [eventId]: [] }));
      setParticipantsCache((current) => ({ ...current, [eventId]: [] }));
      setPredictionsCache((current) => ({ ...current, [eventId]: [] }));

      return { eventId, inviteCode };
    },
    [address],
  );

  const joinEvent = useCallback(
    async (inviteCode: string) => {
      const event = events.find(
        (item) => item.inviteCode.toLowerCase() === inviteCode.toLowerCase(),
      );
      if (!event || event.participants >= event.maxParticipants) return false;

<<<<<<< Updated upstream
      updateEvent(event.id, {
        joined: true,
        participants: event.participants + 1,
      });

      const joinedAddress = address ?? "GUEST-PARTICIPANT";
      setParticipantsCache((current) => ({
        ...current,
        [event.id]: [
          ...(current[event.id] ?? []),
          {
            address: joinedAddress,
            joinedAt: new Date().toISOString(),
            score: 0,
            predictions: 0,
            correctPredictions: 0,
            pointsEarned: 0,
          },
        ],
      }));
=======
  const addMatch = useCallback(
    async (
      eventId: string,
      teamA: string,
      teamB: string,
      matchTime: string,
      multiplier: 1 | 2 | 3,
    ): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        const matchId = `match-${Date.now()}`;
        const newMatch: CreatorEventMatch = {
          id: matchId,
          eventId,
          teamA,
          teamB,
          matchTime,
          outcome: "Pending",
          multiplier,
        };
        setMatchesCache((prev) => ({
          ...prev,
          [eventId]: [...(prev[eventId] ?? []), newMatch],
        }));
        setEventCache((prev) => {
          const event = prev[eventId];
          if (!event) return prev;
          return {
            ...prev,
            [eventId]: { ...event, matchesCount: event.matchesCount + 1 },
          };
        });
        return matchId;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );
>>>>>>> Stashed changes

      return true;
    },
    [address, events, updateEvent],
  );

  const addMatch = useCallback<CreatorEventsContextValue["addMatch"]>(
    async (input, teamA, teamB, matchTime, details = {}) => {
      const payload: AddMatchInput =
        typeof input === "string"
          ? {
              eventId: input,
              teamA: teamA ?? "Team A",
              teamB: teamB ?? "Team B",
              matchTime: matchTime ?? new Date().toISOString(),
              ...details,
            }
          : input;

      const matchId = `match-${Date.now()}`;
      const homeScore = payload.homeScore ?? null;
      const awayScore = payload.awayScore ?? null;
      const match: CreatorEventMatch = {
        id: matchId,
        eventId: payload.eventId,
        teamA: payload.teamA,
        teamB: payload.teamB,
        matchTime: payload.matchTime,
        outcome: payload.outcome ?? deriveOutcomeFromScore(homeScore, awayScore),
        homeScore,
        awayScore,
        pointsMultiplier: payload.pointsMultiplier ?? 1,
      };

      setMatchesCache((current) => ({
        ...current,
        [payload.eventId]: [...(current[payload.eventId] ?? []), match],
      }));
      updateEvent(payload.eventId, {
        matchesCount: (matchesCache[payload.eventId]?.length ?? 0) + 1,
      });

      return matchId;
    },
    [matchesCache, updateEvent],
  );

  const submitPrediction = useCallback<
    CreatorEventsContextValue["submitPrediction"]
  >(
    async (input, outcome, details = {}) => {
      const payload: SubmitPredictionInput =
        typeof input === "string"
          ? {
              matchId: input,
              outcome: outcome ?? "Pending",
              ...details,
            }
          : input;
      const match = findMatch(payload.matchId);
      const eventId = payload.eventId ?? match?.eventId;
      if (!eventId) return false;

      const event = eventCache[eventId];
      const pointsMultiplier =
        payload.pointsMultiplier ??
        (match?.pointsMultiplier ?? 1) * (event?.pointsMultiplier ?? 1);
      const prediction: Prediction = {
        eventId,
        matchId: payload.matchId,
        outcome: payload.outcome,
        submittedAt: new Date().toISOString(),
        predictedHomeScore: payload.predictedHomeScore ?? null,
        predictedAwayScore: payload.predictedAwayScore ?? null,
        pointsMultiplier,
        pointsEarned: calculatePredictionPoints(
          { ...payload, eventId, pointsMultiplier },
          match,
          event,
        ),
      };

      setPredictionsCache((current) => ({
        ...current,
        [eventId]: [prediction, ...(current[eventId] ?? [])],
      }));

      return true;
    },
    [eventCache, findMatch],
  );

  const cancelEvent = useCallback(
    async (eventId: string) => {
      updateEvent(eventId, { status: "Cancelled" });
      return true;
    },
    [updateEvent],
  );

  const verifyWinners = useCallback(
    async (eventId: string) => {
      updateEvent(eventId, { status: "Completed" });
      return true;
    },
    [updateEvent],
  );

  const getEvent = useCallback(
    async (eventId: string) => eventCache[eventId] ?? null,
    [eventCache],
  );

  const getEventByCode = useCallback(
    async (inviteCode: string) =>
      events.find(
        (event) => event.inviteCode.toLowerCase() === inviteCode.toLowerCase(),
      ) ?? null,
    [events],
  );

  const getEventMatches = useCallback(
    async (eventId: string) => matchesCache[eventId] ?? [],
    [matchesCache],
  );

  const getUserPredictions = useCallback(
    async (eventId: string) => predictionsCache[eventId] ?? [],
    [predictionsCache],
  );

  const getEventParticipants = useCallback(
    async (eventId: string) => participantsCache[eventId] ?? [],
    [participantsCache],
  );

  const getEventWinners = useCallback(
    async (eventId: string) => {
      const payouts = await getEventPayouts(eventId);
      return payouts.map((payout) => {
        const participant = participantsCache[eventId]?.find(
          (item) => item.address === payout.address,
        );

        return {
          address: payout.address,
          score: participant?.score ?? 0,
          rank: payout.rank,
          payout: payout.payout,
        };
      });
    },
    [getEventPayouts, participantsCache],
  );

  const getUserScore = useCallback(
    async (eventId: string) => {
      const lookupAddress = address ?? "GCF5T...9V2H";
      return (
        participantsCache[eventId]?.find((item) => item.address === lookupAddress)
          ?.score ?? 0
      );
    },
    [address, participantsCache],
  );

  const submitMatchResult = useCallback<
    CreatorEventsContextValue["submitMatchResult"]
  >(async (matchId, outcome, scoreline) => {
    setMatchesCache((current) => {
      const next = { ...current };

      Object.entries(current).forEach(([eventId, matches]) => {
        next[eventId] = matches.map((match) =>
          match.id === matchId
            ? {
                ...match,
                outcome,
                homeScore: scoreline?.homeScore ?? match.homeScore,
                awayScore: scoreline?.awayScore ?? match.awayScore,
              }
            : match,
        );
      });

      return next;
    });

    return true;
  }, []);

  const setCreationFee = useCallback(async () => true, []);
  const setTreasury = useCallback(async () => true, []);
  const setAIAgent = useCallback(async () => true, []);
  const verifyAddress = useCallback(async () => true, []);
  const batchVerifyAddresses = useCallback(async () => true, []);
  const unverifyAddress = useCallback(async () => true, []);
  const withdrawFees = useCallback(async () => true, []);
  const pauseContract = useCallback(async () => true, []);
  const unpauseContract = useCallback(async () => true, []);

  const myJoinedEvents = useMemo(
    () => events.filter((event) => event.joined),
    [events],
  );

  const myCreatedEvents = useMemo(
    () =>
      events.filter(
        (event) => event.creator === address || event.creator === "GCF5T...9V2H",
      ),
    [address, events],
  );

  const value = useMemo<CreatorEventsContextValue>(
    () => ({
      myJoinedEvents,
      myCreatedEvents,
      eventCache,
      isLoading: false,
      error: null,
      createEvent,
      joinEvent,
      addMatch,
      submitPrediction,
      cancelEvent,
      verifyWinners,
      getEvent,
      getEventByCode,
      getEventMatches,
      getUserPredictions,
      getEventParticipants,
      getEventWinners,
      getUserScore,
      getEventLeaderboard,
      getEventPayouts,
      getUserPayout,
      setCreationFee,
      setTreasury,
      setAIAgent,
      verifyAddress,
      batchVerifyAddresses,
      unverifyAddress,
      withdrawFees,
      pauseContract,
      unpauseContract,
      submitMatchResult,
    }),
    [
      myJoinedEvents,
      myCreatedEvents,
      eventCache,
      createEvent,
      joinEvent,
      addMatch,
      submitPrediction,
      cancelEvent,
      verifyWinners,
      getEvent,
      getEventByCode,
      getEventMatches,
      getUserPredictions,
      getEventParticipants,
      getEventWinners,
      getUserScore,
      getEventLeaderboard,
      getEventPayouts,
      getUserPayout,
      setCreationFee,
      setTreasury,
      setAIAgent,
      verifyAddress,
      batchVerifyAddresses,
      unverifyAddress,
      withdrawFees,
      pauseContract,
      unpauseContract,
      submitMatchResult,
    ],
  );

  return (
    <CreatorEventsContext.Provider value={value}>
      {children}
    </CreatorEventsContext.Provider>
  );
}

export function useCreatorEvents() {
  return useContext(CreatorEventsContext);
}
