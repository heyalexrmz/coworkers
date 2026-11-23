import { useEffect, useId, useState } from "react"
import type { FormEvent } from "react"
import { Link, createFileRoute, useLocation } from "@tanstack/react-router"
import { Button } from "@cloudflare/kumo/components/button"
import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog"
import { BotAvatar } from "@/components/bot-avatar"
import { BoardIcon, PlusIcon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { BOARD_STATUSES, boardDraftSchema } from "@/lib/board"
import type { BoardStatus, BoardTask } from "@/lib/board"
import { useHub } from "@/lib/hub-context"
import type { BotSummary } from "@/lib/types"

export const Route = createFileRoute("/_app/board")({ component: BoardPage })

const LANES: Record<
  BoardStatus,
  { label: string; empty: string; dot: string }
> = {
  queued: { label: "To do", empty: "No tasks waiting", dot: "bg-kumo-subtle" },
  running: {
    label: "In progress",
    empty: "No tasks running",
    dot: "bg-sky-500",
  },
  review: {
    label: "Review",
    empty: "No results to review",
    dot: "bg-amber-500",
  },
  done: {
    label: "Done",
    empty: "No completed tasks yet",
    dot: "bg-emerald-500",
  },
}

const FIELD =
  "min-h-11 w-full rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2.5 text-base font-normal text-kumo-default outline-none placeholder:text-kumo-subtle focus:border-kumo-focus/60 focus:bg-kumo-base focus:ring-2 focus:ring-kumo-focus/15 disabled:opacity-70 sm:text-sm"
const FIELD_LABEL =
  "flex min-w-0 flex-col gap-1.5 text-sm font-medium text-kumo-default"

function BoardPage() {
  const { state, board } = useHub()
  const tasks = state.board ?? []
  const bots = state.bots
  const hash = useLocation({ select: (location) => location.hash })
  const linked = hash
    ? tasks.find((task) => `card-${task.id}` === hash)
    : undefined
  const [editor, setEditor] = useState<{ task?: BoardTask } | null>(null)

  useEffect(() => {
    if (linked)
      document
        .getElementById(`card-${linked.id}`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [linked?.id])

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Board"
        back
        actions={
          <Button
            variant="primary"
            className="btn-ink rounded-full"
            disabled={!board}
            onClick={() => setEditor({})}
          >
            <PlusIcon size={16} /> New task
          </Button>
        }
      />
      <div className="flex items-center gap-3 px-4 py-4 md:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-kumo-recessed text-kumo-default">
          <BoardIcon size={21} />
        </span>
        <p className="text-sm text-pretty text-kumo-subtle">
          {bots.length
            ? "Assign a task or leave it open for an idle bot to pick up. Completed runs land in Review."
            : "Add tasks now. Add a bot when you’re ready for your team to start picking them up."}
        </p>
      </div>
      <div
        className="flex min-h-0 flex-1 snap-x snap-proximity gap-3 overflow-x-auto px-4 pb-4 md:px-6 md:pb-6"
        aria-label="Task columns"
      >
        {BOARD_STATUSES.map((status) => {
          const lane = LANES[status]
          const cards = tasks.filter((task) => task.status === status)
          if (status === "done") cards.sort((a, b) => b.updatedAt - a.updatedAt)
          return (
            <section
              key={status}
              aria-labelledby={`lane-${status}`}
              className="flex min-h-0 w-[min(76vw,18rem)] shrink-0 snap-start scroll-ms-4 flex-col rounded-2xl border border-kumo-line bg-kumo-recessed md:min-w-52 md:flex-1 md:basis-0 md:scroll-ms-6"
            >
              <div className="flex h-12 shrink-0 items-center gap-2 px-3.5">
                <span
                  className={`size-2 shrink-0 rounded-full ${lane.dot}`}
                  aria-hidden="true"
                />
                <h2
                  id={`lane-${status}`}
                  className="truncate text-sm font-semibold text-kumo-default"
                >
                  {lane.label}
                </h2>
                <span className="text-xs text-kumo-subtle tabular-nums">
                  {cards.length}
                </span>
                {status === "queued" ? (
                  <button
                    type="button"
                    aria-label="Add a task to To do"
                    disabled={!board}
                    onClick={() => setEditor({})}
                    className="icon-btn ml-auto"
                  >
                    <PlusIcon size={16} />
                  </button>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5">
                {cards.length ? (
                  cards.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      bots={bots}
                      highlighted={linked?.id === task.id}
                      onOpen={() => setEditor({ task })}
                    />
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-kumo-line px-2 py-5 text-center text-xs text-kumo-subtle">
                    {lane.empty}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
      {editor ? (
        <TaskEditor task={editor.task} onClose={() => setEditor(null)} />
      ) : null}
    </section>
  )
}

function TaskCard({
  task,
  bots,
  highlighted,
  onOpen,
}: {
  task: BoardTask
  bots: BotSummary[]
  highlighted: boolean
  onOpen: () => void
}) {
  const bot = bots.find((entry) => entry.id === task.assigneeId)
  const creator = bots.find((entry) => entry.id === task.createdByBotId)
  return (
    <button
      id={`card-${task.id}`}
      type="button"
      onClick={onOpen}
      className={`pressable block w-full rounded-xl border bg-kumo-base p-3 text-left outline-none hover:border-kumo-focus focus-visible:ring-2 focus-visible:ring-kumo-focus ${highlighted ? "border-kumo-focus" : "border-kumo-line"}`}
    >
      <span className="block text-sm font-medium wrap-anywhere text-kumo-default">
        {task.title}
      </span>
      {task.description ? (
        <span className="mt-1 line-clamp-2 text-xs leading-relaxed wrap-anywhere text-kumo-subtle">
          {task.description}
        </span>
      ) : null}
      {task.error ? (
        <span className="mt-2 block text-xs font-medium text-kumo-danger">
          Needs attention
        </span>
      ) : null}
      <span className="mt-3 flex min-w-0 items-center gap-1.5 text-xs text-kumo-subtle">
        {bot ? <BotAvatar avatar={bot.avatar} size={16} /> : null}
        <span className="truncate">{bot?.name ?? "Unassigned"}</span>
        {creator ? (
          <span className="ml-auto truncate text-right">By {creator.name}</span>
        ) : null}
      </span>
    </button>
  )
}

function TaskEditor({
  task,
  onClose,
}: {
  task?: BoardTask
  onClose: () => void
}) {
  const { state, board } = useHub()
  const formId = useId()
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [error, setError] = useState("")
  const running = task?.status === "running"
  const bot = state.bots.find((entry) => entry.id === task?.assigneeId)

  async function archive() {
    if (!board || !task || running || saving) return
    if (!confirmArchive) {
      setConfirmArchive(true)
      return
    }
    setSaving(true)
    setError("")
    try {
      await board.archive(task.id, task.updatedAt)
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove this task."
      )
      setConfirmArchive(false)
    } finally {
      setSaving(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!board || saving || running) return
    const form = new FormData(event.currentTarget)
    const parsed = boardDraftSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      assigneeId: form.get("assigneeId") || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the task details.")
      return
    }
    const draft = parsed.data
    setSaving(true)
    setError("")
    try {
      if (task) {
        await board.edit({
          ...draft,
          id: task.id,
          updatedAt: task.updatedAt,
          status: form.get("status") as "queued" | "review" | "done",
        })
      } else {
        await board.create(draft)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this task.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <LayerDialog.Root
      open
      dismissDisabled={saving}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          {task ? "Task details" : "New task"}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {running
            ? "Follow this run in the bot’s chat."
            : task
              ? "Manage the assignment and review the latest run."
              : "Add a card to your team’s Board."}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <form
            id={formId}
            className="space-y-4 pt-1"
            onSubmit={(event) => void save(event)}
          >
            <label className={FIELD_LABEL}>
              <span>Title</span>
              <input
                name="title"
                defaultValue={task?.title}
                maxLength={160}
                required
                readOnly={running}
                className={FIELD}
                placeholder="Draft the weekly team update"
              />
            </label>
            <label className={FIELD_LABEL}>
              <span>
                Description{" "}
                <span className="ml-1 font-normal text-kumo-subtle">
                  Optional
                </span>
              </span>
              <textarea
                name="description"
                defaultValue={task?.description}
                maxLength={4000}
                readOnly={running}
                rows={3}
                className={`${FIELD} resize-y leading-relaxed`}
                placeholder="Add context, links, or a clear outcome"
              />
            </label>
            <div className={task ? "grid grid-cols-2 gap-3" : undefined}>
              <label className={FIELD_LABEL}>
                <span>Assignee</span>
                <select
                  name="assigneeId"
                  defaultValue={task?.assigneeId ?? ""}
                  disabled={running}
                  className={FIELD}
                >
                  <option value="">Unassigned</option>
                  {state.bots.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                      {entry.paused ? " (paused)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {task ? (
                <label className={FIELD_LABEL}>
                  <span>Status</span>
                  <select
                    name="status"
                    defaultValue={task.status}
                    disabled={running}
                    className={FIELD}
                  >
                    {(running
                      ? (["running"] as const)
                      : (["queued", "review", "done"] as const)
                    ).map((value) => (
                      <option key={value} value={value}>
                        {LANES[value].label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {!task ? (
              <p className="-mt-2 text-xs text-kumo-subtle">
                Leave unassigned to let an idle bot pick it up.
              </p>
            ) : null}
            {task?.result || task?.error ? (
              <div className="space-y-1.5 rounded-xl bg-kumo-recessed p-3 text-sm">
                <p className="font-medium text-kumo-default">Latest run</p>
                {task.error ? (
                  <p className="wrap-anywhere text-kumo-danger">{task.error}</p>
                ) : null}
                {task.result ? (
                  <p className="wrap-anywhere whitespace-pre-wrap text-kumo-default">
                    {task.result}
                  </p>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="text-sm wrap-anywhere text-kumo-danger"
              >
                {error}
              </p>
            ) : null}
            {task && ((bot && task.status !== "queued") || !running) ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-kumo-line pt-2">
                {bot && task.status !== "queued" ? (
                  <Link
                    to="/bots/$botId"
                    params={{ botId: bot.id }}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-kumo-default underline underline-offset-4"
                    onClick={onClose}
                  >
                    Open bot chat
                  </Link>
                ) : null}
                {!running ? (
                  <button
                    type="button"
                    disabled={!board || saving}
                    onClick={() => void archive()}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-kumo-danger hover:underline"
                  >
                    {confirmArchive ? "Confirm removal" : "Remove task"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
        </LayerDialog.Body>
        {!running ? (
          <LayerDialog.Actions dismissLabel="Cancel">
            <LayerDialog.Actions.Primary
              type="submit"
              form={formId}
              loading={saving}
              disabled={!board || saving}
            >
              {saving ? "Saving…" : task ? "Save changes" : "Create task"}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        ) : null}
      </LayerDialog.Content>
    </LayerDialog.Root>
  )
}
