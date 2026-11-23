import { hasTeamMention, isTeamGreeting, teamRecipients } from "@/lib/bot-teams"
import type {
  TeamContribution,
  TeamParticipant,
  TeamReplyResult,
} from "@/lib/types"

export interface TeamTurn {
  phase: "greeting" | "lead" | "teammate" | "wrap-up"
  question: string
  history: string
  task?: string
  from?: string
  available: TeamParticipant[]
  timeLimitMs: number
}

const MAX_HANDOFFS = 2
const TURN_TIMEOUT_MS = 60_000
const CALL_TIMEOUT_MS = 18_000

/** The room coordinates one lead, a bounded set of handoffs, and a follow-up.
 * Member calls are conversational only; no private chat or external actions. */
export async function* teamConversation({
  members,
  question,
  history,
  signal,
  contribute,
}: {
  members: TeamParticipant[]
  question: string
  history: string
  signal?: AbortSignal
  contribute: (botId: string, turn: TeamTurn) => Promise<TeamContribution>
}): AsyncGenerator<TeamReplyResult> {
  const addressed = teamRecipients(question, members)
  if (!addressed.length) {
    yield {
      replies: [],
      note: members.length
        ? "Those mentions don’t match any current team members."
        : "Add agents to start a team conversation.",
    }
    return
  }
  const available = members.filter((member) => !member.paused)
  const explicit = hasTeamMention(question)
  const lead = !explicit
    ? (addressed.find(
        (bot) => !bot.paused && /chief of staff|team lead/i.test(bot.name)
      ) ?? addressed.find((bot) => !bot.paused))
    : addressed.find((bot) => !bot.paused)
  if (!lead) {
    yield {
      replies: [],
      note: "The addressed agents are paused. Resume an agent to continue.",
    }
    return
  }
  const deadline = Date.now() + TURN_TIMEOUT_MS
  const replies: TeamReplyResult["replies"] = []
  const handoffs: NonNullable<TeamReplyResult["handoffs"]> = []
  const stopped = () => signal?.aborted || Date.now() >= deadline
  const snapshot = (working?: string[], note?: string): TeamReplyResult => ({
    replies: [...replies],
    handoffs: [...handoffs],
    ...(working?.length ? { working } : {}),
    ...(note ? { note } : {}),
  })
  const speak = async (
    bot: TeamParticipant,
    turn: Pick<TeamTurn, "phase" | "task" | "from" | "available">,
    context = history
  ) => {
    if (stopped()) return { text: "", requests: [] }
    const response = await contribute(bot.id, {
      question,
      history: context,
      timeLimitMs: Math.min(
        CALL_TIMEOUT_MS,
        Math.max(1, deadline - Date.now())
      ),
      ...turn,
    }).catch((error) => {
      console.error(`Team contribution from ${bot.id} failed`, error)
      return {
        text: "Couldn’t reply to this part of the conversation.",
        requests: [],
        unavailable: true,
      }
    })
    if (signal?.aborted) return { text: "", requests: [] }
    if (response.text)
      replies.push({
        botId: bot.id,
        name: bot.name,
        avatar: bot.avatar,
        text: response.text,
        unavailable: response.unavailable,
      })
    return response
  }

  yield snapshot([lead.name])
  if (isTeamGreeting(question, members)) {
    // Keep a simple hello independent of any unfinished work in the room.
    await speak(lead, { phase: "greeting", available: [] }, "")
    yield snapshot()
    return
  }
  const peers = available.filter((member) => member.id !== lead.id)
  const opening = await speak(lead, { phase: "lead", available: peers })
  if (stopped() || opening.unavailable) {
    yield snapshot(
      undefined,
      stopped() ? "The team turn stopped before it finished." : undefined
    )
    return
  }

  const selected = new Map<
    string,
    { bot: TeamParticipant; task: string; from: string }
  >()
  // If the user mentioned several agents, include those peers even when the
  // lead didn't request them. A plain group message doesn't invite every bot.
  const assign = (botId: string, task: string, from = lead.name) => {
    const bot = peers.find((member) => member.id === botId)
    if (
      !bot ||
      !task.trim() ||
      selected.has(botId) ||
      selected.size >= MAX_HANDOFFS
    )
      return
    selected.set(botId, { bot, task: task.trim().slice(0, 1200), from })
  }
  if (explicit && addressed.length > 1) {
    for (const member of addressed) {
      const delegated = opening.requests.find(
        (request) => request.botId === member.id
      )
      assign(
        member.id,
        delegated?.task ??
          "Give your perspective on the user’s request and review the lead’s contribution.",
        delegated ? lead.name : "You"
      )
    }
  }
  for (const request of opening.requests) assign(request.botId, request.task)
  if (!selected.size) {
    yield snapshot(
      undefined,
      opening.requests.length || !replies.length
        ? "No teammate was available to take that handoff. Try mentioning someone directly."
        : undefined
    )
    return
  }

  const trail = () => {
    const discussion = replies
      .map((reply) => `${reply.name}: ${reply.text}`)
      .join("\n")
      .slice(-10_000)
    const sent = handoffs
      .map(({ from, to, task }) => `${from} → ${to}: ${task}`)
      .join("\n")
    return `${history.slice(-3_000)}\n\nRecorded handoffs in this turn:\n${sent}\n\nReplies in this turn:\n${discussion}`
  }
  for (const { bot, task, from } of selected.values()) {
    if (stopped()) break
    handoffs.push({
      from,
      to: bot.name,
      task,
      after: replies.length,
    })
    yield snapshot([bot.name])
    // Sequential calls let a second teammate see and build on the first.
    await speak(bot, { phase: "teammate", task, from, available: [] }, trail())
  }
  if (!stopped()) {
    yield snapshot([lead.name])
    await speak(lead, { phase: "wrap-up", available: [] }, trail())
  }
  yield snapshot(
    undefined,
    stopped()
      ? "The team turn stopped before it finished."
      : explicit &&
          addressed.filter((member) => !member.paused).length > MAX_HANDOFFS + 1
        ? "This turn reached its handoff limit. Mention the remaining agents in a follow-up."
        : undefined
  )
}
