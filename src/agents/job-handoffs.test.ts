import { describe, expect, it, vi } from "vitest"
import { hasUnconfirmedWrite, JobHandoffs } from "./job-handoffs"
import type { JobHandoff } from "./job-handoffs"

function storage() {
  const saved = new Map<string, unknown>()
  return {
    get: <T>(key: string) => saved.get(key) as T | undefined,
    put: (key: string, value: unknown) => {
      saved.set(key, value)
    },
    delete: (key: string) => saved.delete(key),
    list: <T>({ prefix, limit }: { prefix?: string; limit?: number } = {}) =>
      [...saved]
        .filter(([key]) => key.startsWith(prefix ?? ""))
        .slice(0, limit)
        .map(([key, value]): [string, T] => [key, value as T]),
  }
}

const boardResult: JobHandoff = {
  kind: "board-result",
  task: { id: "claim-123", replyTo: { kind: "board", cardId: "card-1" } },
  outcome: { status: "done", result: "Saved result" },
}
const routine: JobHandoff = {
  kind: "routine-submit",
  name: "Daily report",
  text: "Read and summarize",
  routine: { id: "daily", runId: "routine:alarm:123:1", attempt: 1 },
}

describe("durable job handoffs", () => {
  it("stops on uncertain writes, not on reads or approvals that have not run", () => {
    const readOnly = (name: string) => name === "search"
    expect(
      hasUnconfirmedWrite(
        [
          { type: "tool-search", state: "input-available" },
          { type: "tool-send", state: "approval-requested" },
          {
            type: "tool-send",
            state: "approval-responded",
            approval: { approved: false },
          },
          { type: "tool-send", state: "output-available" },
        ],
        readOnly
      )
    ).toBe(false)
    expect(
      hasUnconfirmedWrite(
        [{ type: "dynamic-tool", toolName: "send", state: "input-available" }],
        readOnly
      )
    ).toBe(true)
    expect(
      hasUnconfirmedWrite(
        [
          {
            type: "tool-send",
            state: "approval-responded",
            approval: { approved: true },
          },
        ],
        readOnly
      )
    ).toBe(true)
  })
  it("checks write checkpoints even if the interrupted stream lost its tool parts", () => {
    const readOnly = () => false
    expect(hasUnconfirmedWrite([], readOnly, ["write-1"])).toBe(true)
    expect(
      hasUnconfirmedWrite(
        [
          {
            type: "tool-send",
            toolCallId: "write-1",
            state: "output-available",
          },
        ],
        readOnly,
        ["write-1"]
      )
    ).toBe(false)
  })

  it("survives a restart before delivery and does not overwrite the original outcome", async () => {
    const kv = storage()
    new JobHandoffs(kv).stage(boardResult)
    const restarted = new JobHandoffs(kv)
    restarted.stage({
      ...boardResult,
      outcome: { status: "stopped", result: "" },
    })
    const deliver = vi.fn(async () => {})
    expect(restarted.hasBoardResult("claim-123")).toBe(true)
    await restarted.flush(deliver, vi.fn())
    expect(deliver).toHaveBeenCalledExactlyOnceWith(boardResult)
    expect(restarted.pending).toBe(false)
  })

  it("retries a lost ACK with the same routine submission ID without blocking other jobs", async () => {
    const kv = storage()
    const first = new JobHandoffs(kv)
    first.stage(routine)
    first.stage(boardResult)
    const admitted = new Set<string>()
    const board = vi.fn()
    await first.flush(async (job) => {
      if (job.kind === "board-result") {
        board(job)
        return
      }
      admitted.add(job.routine.runId)
      throw new Error("Worker reset before recording the acknowledgment")
    }, vi.fn())
    expect(board).toHaveBeenCalledExactlyOnceWith(boardResult)
    const restarted = new JobHandoffs(kv)
    const retried = vi.fn(async (job: JobHandoff) => {
      if (job.kind === "routine-submit") admitted.add(job.routine.runId)
    })
    await restarted.flush(retried, vi.fn())
    expect(retried).toHaveBeenCalledExactlyOnceWith(routine)
    expect([...admitted]).toEqual([routine.routine.runId])
    expect(restarted.pending).toBe(false)
  })
})
