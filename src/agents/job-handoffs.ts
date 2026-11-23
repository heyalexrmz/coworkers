import type { BotTask, MessageMeta, TaskOutcome } from "@/lib/types"

export type JobHandoff =
  | { kind: "board-result"; task: BotTask; outcome: TaskOutcome }
  | {
      kind: "routine-submit"
      name: string
      text: string
      routine: NonNullable<MessageMeta["routine"]>
    }

const PREFIX = "job_handoff:"

/** An open approval has not executed. An admitted write with no result may have. */
export function hasUnconfirmedWrite(
  parts: ReadonlyArray<unknown>,
  isReadOnly: (name: string) => boolean,
  startedWrites: ReadonlyArray<string> = []
) {
  const toolParts = parts as ReadonlyArray<{
    toolCallId?: string
    state?: string
  }>
  if (
    startedWrites.some(
      (id) =>
        !toolParts.some(
          (part) => part.toolCallId === id && part.state === "output-available"
        )
    )
  )
    return true
  return parts.some((value) => {
    const part = value as {
      type?: string
      toolName?: string
      state?: string
      approval?: { approved?: boolean }
    }
    const name =
      part.type === "dynamic-tool"
        ? (part.toolName ?? "")
        : part.type?.startsWith("tool-")
          ? part.type.slice(5)
          : null
    return (
      name !== null &&
      !isReadOnly(name) &&
      (part.state === "input-available" ||
        (part.state === "approval-responded" &&
          part.approval?.approved === true))
    )
  })
}

/** The receiver deduplicates by the same run ID. A failed (or ambiguous) ACK keeps the job. */
export class JobHandoffs {
  constructor(
    private kv: Pick<SyncKvStorage, "get" | "put" | "list" | "delete">
  ) {}

  stage(job: JobHandoff) {
    const id = job.kind === "board-result" ? job.task.id : job.routine.runId
    const key = `${PREFIX}${job.kind}:${id}`
    if (this.kv.get(key) === undefined) this.kv.put(key, job)
  }

  hasBoardResult(runId: string) {
    return this.kv.get(`${PREFIX}board-result:${runId}`) !== undefined
  }

  get pending() {
    return !this.kv.list({ prefix: PREFIX, limit: 1 })[Symbol.iterator]().next()
      .done
  }

  async flush(
    deliver: (job: JobHandoff) => Promise<void>,
    onFailure: (error: unknown) => void
  ) {
    // Walk past failed jobs so a temporarily unreachable receiver doesn't block others.
    for (const [key, job] of [
      ...this.kv.list<JobHandoff>({ prefix: PREFIX }),
    ]) {
      try {
        await deliver(job)
        this.kv.delete(key)
      } catch (error) {
        onFailure(error)
      }
    }
  }
}
