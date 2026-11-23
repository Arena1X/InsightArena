import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueue, getQueue, processQueue, queueAction } from "./actionQueue";

describe("actionQueue replay ordering", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearQueue();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  it("replays queued actions in the order enqueued", async () => {
    const ids = [
      queueAction("prediction", { n: 1 }),
      queueAction("favorite", { n: 2 }),
      queueAction("custom", { n: 3 }),
    ];
    const seen: string[] = [];
    await processQueue(async (a) => {
      // later actions would finish first if replay were concurrent
      await new Promise((r) => setTimeout(r, 10 - (a.payload.n as number) * 3));
      seen.push(a.id);
    });
    expect(seen).toEqual(ids);
    expect(getQueue()).toEqual([]);
  });

  it("halts on first failure and preserves remaining actions", async () => {
    const ids = [
      queueAction("prediction", { n: 1 }),
      queueAction("prediction", { n: 2 }),
      queueAction("prediction", { n: 3 }),
    ];
    const handler = vi.fn(async (a: { id: string }) => {
      if (a.id === ids[1]) throw new Error("fail");
    });
    await processQueue(handler);

    expect(handler).toHaveBeenCalledTimes(2);
    const remaining = getQueue();
    expect(remaining.map((a) => a.id)).toEqual([ids[1], ids[2]]);
    expect(remaining[0].retries).toBe(1);
    expect(remaining[1].retries).toBe(0);
  });

  it("is a no-op for an empty queue", async () => {
    const handler = vi.fn();
    await processQueue(handler);
    expect(handler).not.toHaveBeenCalled();
    expect(getQueue()).toEqual([]);
  });

  it("does not replay concurrently when triggered twice", async () => {
    queueAction("custom", { n: 1 });
    const handler = vi.fn(async () => {});
    await Promise.all([processQueue(handler), processQueue(handler)]);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
