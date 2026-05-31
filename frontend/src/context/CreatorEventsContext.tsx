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
  endsAt: string;
  joined?: boolean;
}

export interface CreatorEventMatch {
  id: string;
  eventId: string;
  teamA: string;
  teamB: string;
  matchTime: string;
  outcome: MatchOutcome;
}

export interface Participant {
  address: string;
  joinedAt: string;
  score: number;
}

export interface Prediction {
  matchId: string;
  outcome: MatchOutcome;
  submittedAt: string;
}

export interface Winner {
  address: string;
  score: number;
  rank: number;
}

export interface CreatorEventsContextValue {
  myJoinedEvents: CreatorEvent[];
  myCreatedEvents: CreatorEvent[];
  eventCache: Record<string, CreatorEvent>;
  isLoading: boolean;
  error: string | null;

  createEvent: (
    title: string,
    description: string,
    maxParticipants: number,
  ) => Promise<{ eventId: string; inviteCode: string }>;
  joinEvent: (inviteCode: string) => Promise<boolean>;
  addMatch: (
    eventId: string,
    teamA: string,
    teamB: string,
    matchTime: string,
  ) => Promise<string>;
  submitPrediction: (matchId: string, outcome: MatchOutcome) => Promise<boolean>;
  cancelEvent: (eventId: string) => Promise<boolean>;
  verifyWinners: (eventId: string) => Promise<boolean>;

  getEvent: (eventId: string) => Promise<CreatorEvent | null>;
  getEventByCode: (inviteCode: string) => Promise<CreatorEvent | null>;
  getEventMatches: (eventId: string) => Promise<CreatorEventMatch[]>;
  getUserPredictions: (eventId: string) => Promise<Prediction[]>;
  getEventParticipants: (eventId: string) => Promise<Participant[]>;
  getEventWinners: (eventId: string) => Promise<Winner[]>;
  getUserScore: (eventId: string) => Promise<number>;

  setCreationFee: (newFee: string) => Promise<boolean>;
  setTreasury: (newAddress: string) => Promise<boolean>;
  setAIAgent: (newAddress: string) => Promise<boolean>;
  verifyAddress: (address: string) => Promise<boolean>;
  batchVerifyAddresses: (addresses: string[]) => Promise<boolean>;
  unverifyAddress: (address: string) => Promise<boolean>;
  withdrawFees: (to: string, amount: string) => Promise<boolean>;
  pauseContract: () => Promise<boolean>;
  unpauseContract: () => Promise<boolean>;

  submitMatchResult: (matchId: string, outcome: MatchOutcome) => Promise<boolean>;
}

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
    createdAt: "2026-05-18",
    endsAt: "2026-06-04",
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
    createdAt: "2026-05-06",
    endsAt: "2026-05-12",
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
    createdAt: "2026-05-22",
    endsAt: "2026-06-14",
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
    matchesCount: 6,
    createdAt: "2026-05-09",
    endsAt: "2026-05-29",
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
      matchTime: "2026-05-28T18:00:00Z",
      outcome: "TeamA",
    },
    {
      id: "match-002",
      eventId: "event-001",
      teamA: "Team Gamma",
      teamB: "Team Delta",
      matchTime: "2026-05-29T20:00:00Z",
      outcome: "Draw",
    },
    {
      id: "match-003",
      eventId: "event-001",
      teamA: "Team Alpha",
      teamB: "Team Gamma",
      matchTime: "2026-06-01T18:00:00Z",
      outcome: "Pending",
    },
    {
      id: "match-004",
      eventId: "event-001",
      teamA: "Team Beta",
      teamB: "Team Delta",
      matchTime: "2026-06-02T20:00:00Z",
      outcome: "Pending",
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
    },
    {
      id: "match-006",
      eventId: "event-002",
      teamA: "Green Vipers",
      teamB: "Red Eagles",
      matchTime: "2026-05-10T16:00:00Z",
      outcome: "TeamA",
    },
    {
      id: "match-007",
      eventId: "event-002",
      teamA: "Blue Hawks",
      teamB: "Green Vipers",
      matchTime: "2026-05-11T16:00:00Z",
      outcome: "TeamA",
    },
  ],
  "event-003": [
    {
      id: "match-008",
      eventId: "event-003",
      teamA: "Stars FC",
      teamB: "Nova SC",
      matchTime: "2026-05-25T19:00:00Z",
      outcome: "TeamA",
    },
    {
      id: "match-009",
      eventId: "event-003",
      teamA: "Apex United",
      teamB: "Stars FC",
      matchTime: "2026-05-28T19:00:00Z",
      outcome: "Pending",
    },
    {
      id: "match-010",
      eventId: "event-003",
      teamA: "Nova SC",
      teamB: "Rising Sun",
      matchTime: "2026-05-30T19:00:00Z",
      outcome: "Pending",
    },
    {
      id: "match-011",
      eventId: "event-003",
      teamA: "Stars FC",
      teamB: "Rising Sun",
      matchTime: "2026-06-05T19:00:00Z",
      outcome: "Pending",
    },
    {
      id: "match-012",
      eventId: "event-003",
      teamA: "Apex United",
      teamB: "Nova SC",
      matchTime: "2026-06-10T19:00:00Z",
      outcome: "Pending",
    },
  ],
  "event-004": [],
};

const MOCK_PARTICIPANTS: Record<string, Participant[]> = {
  "event-001": [
    { address: "GCF5T...9V2H", joinedAt: "2026-05-18T10:00:00Z", score: 320 },
    { address: "GAB7W...2CPL", joinedAt: "2026-05-19T11:30:00Z", score: 280 },
    { address: "GCT2L...45QZ", joinedAt: "2026-05-20T09:15:00Z", score: 260 },
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

  const [myJoinedEvents, setMyJoinedEvents] = useState<CreatorEvent[]>(
    MOCK_EVENTS.filter((e) => e.joined),
  );
  const [myCreatedEvents] = useState<CreatorEvent[]>([MOCK_EVENTS[0]]);
  const [eventCache, setEventCache] = useState<Record<string, CreatorEvent>>(
    Object.fromEntries(MOCK_EVENTS.map((e) => [e.id, e])),
  );
  const [matchesCache, setMatchesCache] = useState<
    Record<string, CreatorEventMatch[]>
  >(MOCK_MATCHES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createEvent = useCallback(
    async (
      title: string,
      description: string,
      maxParticipants: number,
    ): Promise<{ eventId: string; inviteCode: string }> => {
      setIsLoading(true);
      setError(null);
      try {
        const eventId = `event-${Date.now()}`;
        const inviteCode = `ARENA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const newEvent: CreatorEvent = {
          id: eventId,
          title,
          description,
          creator: address ?? "unknown",
          maxParticipants,
          participants: 0,
          status: "Active",
          inviteCode,
          matchesCount: 0,
          createdAt: new Date().toISOString().split("T")[0],
          endsAt: "",
          joined: true,
        };
        setEventCache((prev) => ({ ...prev, [eventId]: newEvent }));
        return { eventId, inviteCode };
      } finally {
        setIsLoading(false);
      }
    },
    [address],
  );

  const joinEvent = useCallback(
    async (inviteCode: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const event = MOCK_EVENTS.find((e) => e.inviteCode === inviteCode);
        if (!event) {
          setError("Event not found.");
          return false;
        }
        if (event.status === "Cancelled") {
          setError("This event has been cancelled.");
          return false;
        }
        if (event.participants >= event.maxParticipants) {
          setError("This event is full.");
          return false;
        }
        const updated = { ...event, joined: true, participants: event.participants + 1 };
        setEventCache((prev) => ({ ...prev, [event.id]: updated }));
        setMyJoinedEvents((prev) =>
          prev.some((e) => e.id === event.id) ? prev : [updated, ...prev],
        );
        return true;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const addMatch = useCallback(
    async (
      eventId: string,
      teamA: string,
      teamB: string,
      matchTime: string,
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

  const submitPrediction = useCallback(
    async (_matchId: string, _outcome: MatchOutcome): Promise<boolean> => {
      return true;
    },
    [],
  );

  const cancelEvent = useCallback(async (eventId: string): Promise<boolean> => {
    setEventCache((prev) => {
      const event = prev[eventId];
      if (!event) return prev;
      return { ...prev, [eventId]: { ...event, status: "Cancelled" } };
    });
    return true;
  }, []);

  const verifyWinners = useCallback(
    async (_eventId: string): Promise<boolean> => true,
    [],
  );

  const getEvent = useCallback(
    async (eventId: string): Promise<CreatorEvent | null> => {
      if (eventCache[eventId]) return eventCache[eventId];
      const found = MOCK_EVENTS.find((e) => e.id === eventId) ?? null;
      if (found) setEventCache((prev) => ({ ...prev, [eventId]: found }));
      return found;
    },
    [eventCache],
  );

  const getEventByCode = useCallback(
    async (inviteCode: string): Promise<CreatorEvent | null> => {
      const cached = Object.values(eventCache).find(
        (e) => e.inviteCode === inviteCode,
      );
      if (cached) return cached;
      const found = MOCK_EVENTS.find((e) => e.inviteCode === inviteCode) ?? null;
      if (found) setEventCache((prev) => ({ ...prev, [found.id]: found }));
      return found;
    },
    [eventCache],
  );

  const getEventMatches = useCallback(
    async (eventId: string): Promise<CreatorEventMatch[]> => {
      return matchesCache[eventId] ?? [];
    },
    [matchesCache],
  );

  const getUserPredictions = useCallback(
    async (_eventId: string): Promise<Prediction[]> => [],
    [],
  );

  const getEventParticipants = useCallback(
    async (eventId: string): Promise<Participant[]> => {
      return MOCK_PARTICIPANTS[eventId] ?? [];
    },
    [],
  );

  const getEventWinners = useCallback(
    async (_eventId: string): Promise<Winner[]> => [],
    [],
  );

  const getUserScore = useCallback(
    async (_eventId: string): Promise<number> => 0,
    [],
  );

  const setCreationFee = useCallback(async (_newFee: string) => true, []);
  const setTreasury = useCallback(async (_newAddress: string) => true, []);
  const setAIAgent = useCallback(async (_newAddress: string) => true, []);
  const verifyAddress = useCallback(async (_address: string) => true, []);
  const batchVerifyAddresses = useCallback(
    async (_addresses: string[]) => true,
    [],
  );
  const unverifyAddress = useCallback(async (_address: string) => true, []);
  const withdrawFees = useCallback(
    async (_to: string, _amount: string) => true,
    [],
  );
  const pauseContract = useCallback(async () => true, []);
  const unpauseContract = useCallback(async () => true, []);
  const submitMatchResult = useCallback(
    async (_matchId: string, _outcome: MatchOutcome) => true,
    [],
  );

  const value = useMemo<CreatorEventsContextValue>(
    () => ({
      myJoinedEvents,
      myCreatedEvents,
      eventCache,
      isLoading,
      error,
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
      isLoading,
      error,
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

export function useCreatorEvents(): CreatorEventsContextValue {
  return useContext(CreatorEventsContext);
}
