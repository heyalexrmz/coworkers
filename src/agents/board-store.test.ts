import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { BoardStore } from "./board-store"
import type { SQLInputValue } from "node:sqlite"

let db: DatabaseSync
let board: BoardStore

beforeEach(() => {
  db = new DatabaseSync(":memory:")
  // Exercise the same SQL against a real SQLite engine outside workerd.
  const sql = {
    exec(query: string, ...bindings: SQLInputValue[]) {
      const rows = db.prepare(query).all(...bindings)
      return { toArray: () => rows }
    },
  }
  board = new BoardStore(sql as unknown as SqlStorage)
  board.init()
})

afterEach(() => db.close())

const done = { status: "done", result: "The result" } as const

describe("Board queue", () => {
  it("renews only the matching active claim and still accepts one result", () => {
    const id = board.create({ title: "Waiting for approval" }, null)
    const { runId } = board.claim("a", true)!
    const cutoff = Date.now() + 1000
    expect(board.staleClaims(cutoff)).toEqual([{ id, runId, assigneeId: "a" }])
    board.renewClaim(id, "old-run", cutoff + 1)
    expect(board.staleClaims(cutoff)).toHaveLength(1)
    board.renewClaim(id, runId, cutoff + 1)
    expect(board.expire(cutoff)).toBe(false)
    board.finish(id, runId, "a", done)
    board.finish(id, runId, "a", { ...done, result: "duplicate" })
    expect(board.list()[0].result).toBe(done.result)
  })
  it("respects explicit assignments and claims an unassigned card only once", () => {
    const assigned = board.create({ title: "Assigned", assigneeId: "a" }, null)
    const shared = board.create({ title: "Shared" }, "b")
    expect(board.claim("b", false)).toBeNull()
    expect(board.claim("a", false)?.row.id).toBe(assigned)
    expect(board.claim("a", true)).toBeNull()
    expect(board.claim("b", true)?.row).toMatchObject({
      id: shared,
      assigneeId: "b",
      createdByBotId: "b",
      status: "running",
    })
    expect(board.claim("c", true)).toBeNull()
  })

  it("restores a rejected shared claim and ignores a late result from the previous run", () => {
    const id = board.create({ title: "Self-assign this" }, null)
    const first = board.claim("a", true)!
    board.release(id, first.runId, null)
    expect(board.list()[0]).toMatchObject({
      assigneeId: null,
      status: "queued",
    })
    const second = board.claim("b", true)!
    board.finish(id, first.runId, "a", done)
    board.finish(id, second.runId, "a", done)
    expect(board.list()[0]).toMatchObject({ status: "running", result: null })
    board.finish(id, second.runId, "b", done)
    expect(board.list()[0]).toMatchObject({
      status: "review",
      result: "The result",
    })
  })

  it("prevents a stale editor from changing a claimed task and flags a timed-out run", () => {
    const id = board.create({ title: "Task" }, null)
    const initial = board.list()[0]
    const run = board.claim("a", true)!
    expect(
      board.edit({
        id,
        title: "Stale edit",
        updatedAt: initial.updatedAt,
        status: "done",
      })
    ).toBe(false)
    expect(board.expire(Date.now() + 100)).toBe(true)
    board.finish(id, run.runId, "a", done)
    expect(board.list()[0]).toMatchObject({
      status: "review",
      result: null,
      error: expect.stringContaining("No result was reported"),
    })
  })

  it("deduplicates bot retries even after removal", () => {
    const id = crypto.randomUUID()
    board.create({ title: "Task" }, "a", id)
    board.create({ title: "Retry" }, "a", id)
    expect(board.list()).toHaveLength(1)
    expect(board.archive(id, board.list()[0].updatedAt)).toBe(true)
    board.create({ title: "Another retry" }, "a", id)
    expect(board.list()).toEqual([])
  })
})
