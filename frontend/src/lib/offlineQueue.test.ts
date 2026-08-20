import { describe, expect, it, vi } from "vitest";

import {
  createActionId,
  enqueueAction,
  readQueue,
  removeAction,
  clearQueue,
  writeQueue,
  QueuedAction,
} from "./offlineQueue";

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  };
}

function makeAction(overrides: Partial<QueuedAction> = {}): QueuedAction {
  return {
    id: "test-1",
    type: "SUBMIT_PREDICTION",
    payload: { marketId: "m1", outcome: "yes" },
    queuedAt: Date.now(),
    ...overrides,
  };
}

describe("offlineQueue (pure)", () => {
  describe("createActionId", () => {
    it("generates unique, non-empty ids", () => {
      const a = createActionId();
      const b = createActionId();
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);
    });
  });

  describe("readQueue / writeQueue", () => {
    it("returns an empty array when the key is missing", () => {
      const storage = createMockStorage();
      expect(readQueue(storage)).toEqual([]);
    });

    it("returns an empty array when the stored JSON is corrupt", () => {
      const storage = createMockStorage();
      storage.setItem("insightarena.offlineQueue", "not-json");
      expect(readQueue(storage)).toEqual([]);
    });

    it("round-trips a queue through writeQueue/readQueue", () => {
      const storage = createMockStorage();
      const actions = [makeAction({ id: "a" }), makeAction({ id: "b" })];
      writeQueue(actions, storage);
      expect(readQueue(storage)).toEqual(actions);
    });
  });

  describe("enqueueAction", () => {
    it("appends an action and persists it", () => {
      const storage = createMockStorage();
      const a1 = makeAction({ id: "a" });
      const a2 = makeAction({ id: "b" });

      const q1 = enqueueAction(a1, storage);
      expect(q1).toEqual([a1]);
      expect(readQueue(storage)).toEqual([a1]);

      const q2 = enqueueAction(a2, storage);
      expect(q2).toEqual([a1, a2]);
      expect(readQueue(storage)).toEqual([a1, a2]);
    });
  });

  describe("removeAction", () => {
    it("removes the matching action and persists", () => {
      const storage = createMockStorage();
      const a1 = makeAction({ id: "a" });
      const a2 = makeAction({ id: "b" });
      const a3 = makeAction({ id: "c" });
      writeQueue([a1, a2, a3], storage);

      const next = removeAction("b", storage);
      expect(next).toEqual([a1, a3]);
      expect(readQueue(storage)).toEqual([a1, a3]);
    });

    it("does nothing when the id is not found", () => {
      const storage = createMockStorage();
      const a1 = makeAction({ id: "a" });
      writeQueue([a1], storage);

      const next = removeAction("nonexistent", storage);
      expect(next).toEqual([a1]);
      expect(readQueue(storage)).toEqual([a1]);
    });
  });

  describe("clearQueue", () => {
    it("removes the key from storage", () => {
      const storage = createMockStorage();
      writeQueue([makeAction()], storage);
      expect(readQueue(storage)).toHaveLength(1);

      clearQueue(storage);
      expect(readQueue(storage)).toEqual([]);
    });
  });
});