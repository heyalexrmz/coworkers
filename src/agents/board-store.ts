import { boardDraftSchema, boardEditSchema } from "@/lib/board"
import type { BoardTask } from "@/lib/board"
import type { TaskOutcome } from "@/lib/types"

type Row = BoardTask & { runId: string | null; claimedAt: number | null }

/** One store per UserHub. Claims and completions are synchronous and fenced by run ID. */
export class BoardStore {
  constructor(private sql: SqlStorage) {}

  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS board_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      assigneeId TEXT,
      createdByBotId TEXT,
      status TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      result TEXT,
      error TEXT,
      runId TEXT,
      claimedAt INTEGER
    )`)
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS board_queue ON board_tasks (status, assigneeId, createdAt)`
    )
  }

  list(): BoardTask[] {
    return this.sql
      .exec<Row & Record<string, SqlStorageValue>>(
        `SELECT * FROM board_tasks
      WHERE status NOT IN ('archived', 'done') OR id IN (
        SELECT id FROM board_tasks WHERE status = 'done' ORDER BY updatedAt DESC LIMIT 30
      ) ORDER BY createdAt ASC`
      )
      .toArray()
      .map(({ runId: _run, claimedAt: _claimed, ...task }) => task)
  }

  create(
    input: unknown,
    author: string | null,
    id: string = crypto.randomUUID()
  ) {
    const draft = boardDraftSchema.parse(input)
    if (
      this.sql.exec("SELECT 1 FROM board_tasks WHERE id = ?", id).toArray()
        .length
    )
      return id
    if (this.atCapacity())
      throw new Error(
        "Board has 100 open cards. Close or remove a card before adding another."
      )
    const now = Date.now()
    this.sql.exec(
      `INSERT INTO board_tasks (id, title, description, assigneeId, createdByBotId, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
      id,
      draft.title,
      draft.description,
      draft.assigneeId,
      author,
      now,
      now
    )
    return id
  }

  edit(input: unknown) {
    const task = boardEditSchema.parse(input)
    if (
      task.status !== "done" &&
      this.atCapacity() &&
      this.sql
        .exec(
          "SELECT 1 FROM board_tasks WHERE id = ? AND status = 'done'",
          task.id
        )
        .toArray().length
    ) {
      throw new Error(
        "Board has 100 open cards. Close or remove a card before reopening another."
      )
    }
    return (
      this.sql
        .exec(
          `UPDATE board_tasks SET title = ?, description = ?, assigneeId = ?, status = ?,
        updatedAt = MAX(updatedAt + 1, ?)
      WHERE id = ? AND updatedAt = ? AND status NOT IN ('archived', 'running') RETURNING id`,
          task.title,
          task.description,
          task.assigneeId,
          task.status,
          Date.now(),
          task.id,
          task.updatedAt
        )
        .toArray().length > 0
    )
  }

  archive(id: string, updatedAt: number) {
    // Keep a tombstone so a replay of the original bot tool cannot re-queue it.
    return (
      this.sql
        .exec(
          `UPDATE board_tasks SET status = 'archived', title = '', description = '',
       result = NULL, error = NULL, assigneeId = NULL, updatedAt = MAX(updatedAt + 1, ?)
      WHERE id = ? AND updatedAt = ? AND status NOT IN ('archived', 'running') RETURNING id`,
          Date.now(),
          id,
          updatedAt
        )
        .toArray().length > 0
    )
  }

  private atCapacity() {
    return (
      this.sql
        .exec(
          `SELECT 1 FROM board_tasks WHERE status IN ('queued', 'running', 'review') LIMIT 1 OFFSET 99`
        )
        .toArray().length > 0
    )
  }

  /** Assigned work always goes first; callers can do a second pass for shared work. */
  claim(botId: string, shared: boolean) {
    const runId = crypto.randomUUID()
    const now = Date.now()
    const row = this.sql
      .exec<Row & Record<string, SqlStorageValue>>(
        `UPDATE board_tasks
      SET status = 'running', assigneeId = ?, runId = ?, claimedAt = ?,
          updatedAt = MAX(updatedAt + 1, ?), result = NULL, error = NULL
      WHERE id = (SELECT id FROM board_tasks WHERE status = 'queued' AND ${shared ? "assigneeId IS NULL" : "assigneeId = ?"}
        ORDER BY createdAt, id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM board_tasks WHERE status = 'running' AND assigneeId = ?)
      RETURNING *`,
        botId,
        runId,
        now,
        now,
        ...(shared ? [] : [botId]),
        botId
      )
      .toArray()[0]
    return row ? { row, runId } : null
  }

  release(id: string, runId: string, assigneeId: string | null) {
    this.sql.exec(
      `UPDATE board_tasks SET status = 'queued', assigneeId = ?, runId = NULL, claimedAt = NULL,
        updatedAt = MAX(updatedAt + 1, ?)
      WHERE id = ? AND runId = ? AND status = 'running'`,
      assigneeId,
      Date.now(),
      id,
      runId
    )
  }

  finish(id: string, runId: string, botId: string, outcome: TaskOutcome) {
    this.sql.exec(
      `UPDATE board_tasks SET status = 'review', result = ?, error = ?, runId = NULL,
        claimedAt = NULL, updatedAt = MAX(updatedAt + 1, ?)
      WHERE id = ? AND runId = ? AND assigneeId = ? AND status = 'running'`,
      outcome.result.slice(0, 4000) || null,
      outcome.error?.slice(0, 1000) ??
        (outcome.status !== "done" ? "This run did not finish." : null),
      Date.now(),
      id,
      runId,
      botId
    )
  }

  staleClaims(before: number) {
    return this.sql
      .exec<{ id: string; runId: string; assigneeId: string }>(
        `SELECT id, runId, assigneeId FROM board_tasks WHERE status = 'running' AND claimedAt < ? AND runId IS NOT NULL AND assigneeId IS NOT NULL`,
        before
      )
      .toArray()
  }

  renewClaim(id: string, runId: string, now: number) {
    this.sql.exec(
      `UPDATE board_tasks SET claimedAt = ? WHERE id = ? AND runId = ? AND status = 'running'`,
      now,
      id,
      runId
    )
  }

  expire(before: number) {
    return (
      this.sql
        .exec(
          `UPDATE board_tasks SET status = 'review', runId = NULL, claimedAt = NULL,
        error = 'No result was reported. Check the bot’s chat before retrying.', updatedAt = MAX(updatedAt + 1, ?)
      WHERE status = 'running' AND claimedAt < ? RETURNING id`,
          Date.now(),
          before
        )
        .toArray().length > 0
    )
  }

  botRemoved(botId: string) {
    this.sql.exec(
      `UPDATE board_tasks SET assigneeId = NULL,
        status = CASE WHEN status IN ('queued', 'running') THEN 'review' ELSE status END,
        error = CASE WHEN status IN ('queued', 'running') THEN 'The assigned bot was removed.' ELSE error END,
        runId = NULL, claimedAt = NULL, updatedAt = MAX(updatedAt + 1, ?)
      WHERE assigneeId = ?`,
      Date.now(),
      botId
    )
  }

  hasQueue() {
    return (
      this.sql
        .exec(`SELECT 1 FROM board_tasks WHERE status = 'queued' LIMIT 1`)
        .toArray().length > 0
    )
  }
}
