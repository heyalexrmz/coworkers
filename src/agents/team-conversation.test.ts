import { describe, expect, it, vi } from "vitest"
import { teamConversation } from "./team-conversation"
import type { TeamTurn } from "./team-conversation"
import type {
  TeamContribution,
  TeamParticipant,
  TeamReplyResult,
} from "@/lib/types"

const member = (id: string, name: string, paused = false): TeamParticipant => ({
  id,
  name,
  paused,
  avatar: "blue-rectangle",
})
const members = [
  member("olivia", "Olivia"),
  member("marco", "Marco"),
  member("theo", "Theo"),
  member("sasha", "Sasha", true),
]
const reply = (text: string): TeamContribution => ({ text, requests: [] })
async function collect(input: Parameters<typeof teamConversation>[0]) {
  const snapshots: TeamReplyResult[] = []
  for await (const snapshot of teamConversation(input)) snapshots.push(snapshot)
  return snapshots
}

describe("team conversation", () => {
  it("runs real handoffs in order, shares earlier replies, and gives the lead the findings", async () => {
    const contribute = vi.fn(
      async (id: string, tick: TeamTurn): Promise<TeamContribution> => {
        if (tick.phase === "lead")
          return {
            text: "I’ll get a second opinion.",
            requests: [
              { botId: "olivia", task: "Invalid self-assignment" },
              { botId: "stranger", task: "Not on the team" },
              { botId: "sasha", task: "Currently paused" },
              { botId: "marco", task: "Check the numbers" },
              { botId: "marco", task: "Duplicate" },
              { botId: "theo", task: "Review the conclusion" },
            ],
          }
        if (id === "marco") {
          expect(tick.history).toContain("I’ll get a second opinion.")
          expect(tick.task).toBe("Check the numbers")
          return reply("The total is 15.")
        }
        if (id === "theo") {
          expect(tick.history).toContain("Marco: The total is 15.")
          return reply("The units are correct.")
        }
        expect(tick.history).toContain("Theo: The units are correct.")
        expect(tick.history).toContain("Olivia → Marco: Check the numbers")
        return reply("We checked the result: it is 15.")
      }
    )
    const snapshots = await collect({
      members,
      question: "@Olivia, work with the team",
      history: "",
      contribute,
    })
    expect(contribute.mock.calls.map(([id, turn]) => [id, turn.phase])).toEqual(
      [
        ["olivia", "lead"],
        ["marco", "teammate"],
        ["theo", "teammate"],
        ["olivia", "wrap-up"],
      ]
    )
    expect(snapshots[0].working).toEqual(["Olivia"])
    expect(
      snapshots.at(-1)?.handoffs?.map(({ to, after }) => [to, after])
    ).toEqual([
      ["Marco", 1],
      ["Theo", 2],
    ])
    expect(snapshots.at(-1)?.replies.map(({ name }) => name)).toEqual([
      "Olivia",
      "Marco",
      "Theo",
      "Olivia",
    ])
    expect(snapshots.at(-1)?.working).toBeUndefined()
  })

  it("answers a standalone greeting without exposing or reopening unfinished work", async () => {
    const contribute = vi.fn(
      async (_id: string, turn: TeamTurn): Promise<TeamContribution> => {
        expect(turn.phase).toBe("greeting")
        expect(turn.history).toBe("")
        expect(turn.available).toEqual([])
        return {
          text: "¡Hola!",
          requests: [{ botId: "marco", task: "Resume the CRUD spec" }],
        }
      }
    )
    const snapshots = await collect({
      members,
      question: "¡Hola equipo! 👋",
      history: "Marco: The CRUD spec is unfinished.",
      contribute,
    })
    expect(contribute).toHaveBeenCalledTimes(1)
    expect(snapshots.at(-1)?.replies.map((reply) => reply.text)).toEqual([
      "¡Hola!",
    ])
    expect(snapshots.at(-1)?.handoffs).toEqual([])
  })

  it("still gives the lead context when the user explicitly asks to continue", async () => {
    const contribute = vi.fn(async (id: string, turn: TeamTurn) => {
      expect(id).toBe("marco")
      expect(turn.phase).toBe("lead")
      expect(turn.history).toContain("CRUD spec")
      return reply("Retomo la especificación.")
    })
    await collect({
      members,
      question: "Hola @Marco, continúa la especificación",
      history: "Olivia: The CRUD spec is unfinished.",
      contribute,
    })
    expect(contribute).toHaveBeenCalledTimes(1)
  })

  it("does not fan out an ordinary room question", async () => {
    const contribute = vi.fn(async () => reply("Here’s the answer."))
    await collect({
      members,
      question: "What is 3 × 5?",
      history: "",
      contribute,
    })
    expect(contribute).toHaveBeenCalledTimes(1)
  })

  it("includes explicitly addressed peers and stops issuing calls after cancellation", async () => {
    const controller = new AbortController()
    const contribute = vi.fn(async (_id: string, turn: TeamTurn) => {
      if (turn.phase === "teammate") controller.abort()
      return reply("OK")
    })
    const snapshots = await collect({
      members,
      question: "@Marco and @Olivia, weigh in",
      history: "",
      signal: controller.signal,
      contribute,
    })
    expect(contribute.mock.calls.map(([id]) => id)).toEqual(["marco", "olivia"])
    expect(snapshots.at(-1)?.note).toContain("stopped")
  })
})
