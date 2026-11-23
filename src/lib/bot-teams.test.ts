import { describe, expect, it } from "vitest"
import {
  addTeamMembers,
  botTeamInput,
  isDirectTeamRequest,
  removeTeam,
  saveTeam,
  sidebarTeams,
  teamRecipients,
  teamReplyOutput,
} from "./bot-teams"
import type { BotSummary } from "./types"

const bot = (id: string, name: string, teamId?: string): BotSummary => ({
  id,
  name,
  teamId,
  avatar: "blue-rectangle",
  status: "idle",
  preview: "",
  updatedAt: 0,
  unread: false,
})
const newId = () => "product"

it("routes direct team requests without treating questions or instructions about other tasks as a write", () => {
  const agents = [
    { name: "CTO" },
    { name: "Staff Engineer" },
    { name: "Solutions Engineer" },
  ]
  expect(
    isDirectTeamRequest("Create a team with the CTO and Staff Engineer", agents)
  ).toBe(true)
  expect(
    isDirectTeamRequest(
      "Please create a team called Product with [@CTO](coworkers://bot/ct0), @Staff Engineer, and Solutions Engineer.",
      agents
    )
  ).toBe(true)
  expect(
    isDirectTeamRequest(
      "Create a team with the CTO and Staff Engineer?",
      agents
    )
  ).toBe(false)
  expect(
    isDirectTeamRequest(
      "Don't create a team with the CTO and Staff Engineer.",
      agents
    )
  ).toBe(false)
  expect(
    isDirectTeamRequest(
      "Create a team with the CTO and have them draft a spec.",
      agents
    )
  ).toBe(false)
  expect(
    isDirectTeamRequest("Create a team with the CTO and Staff Engineer", [
      ...agents,
      { name: "CTO" },
    ])
  ).toBe(false)
})

describe("team conversations", () => {
  const members = [bot("1", "CTO"), bot("2", "Staff Engineer")]

  it("routes general messages to the team and mentions only to current members", () => {
    expect(teamRecipients("What do you think?", members)).toEqual(members)
    expect(teamRecipients("@Former Member, hello", members)).toEqual([])
    expect(teamRecipients("What about alex@example.com?", members)).toEqual(
      members
    )
    expect(
      teamRecipients("@Staff Engineer, what do you think?", members)
    ).toEqual([members[1]])
    expect(
      teamRecipients("[@Other](coworkers://bot/3) hello", members)
    ).toEqual([])
    expect(
      teamRecipients(
        "[@CTO](coworkers://bot/1) and [@Other](coworkers://bot/3)",
        members
      )
    ).toEqual([members[0]])
  })

  it("preserves the thread preview when a team changes name or membership", () => {
    const thread = {
      author: "CTO",
      preview: "Proposal received",
      unread: true,
      updatedAt: 1,
    }
    const directory = {
      bots: members,
      teams: [{ id: "product", name: "Product", thread }],
    }
    const edited = saveTeam(
      directory,
      { id: "product", name: "Engineering", botIds: ["2"] },
      newId
    )
    expect(edited.teams[0].thread).toEqual(thread)
    expect(sidebarTeams(edited, "proposal").groups[0].team.name).toBe(
      "Engineering"
    )
  })

  it("uses only recorded member replies for attributed messages", () => {
    const output = {
      replies: [
        { botId: "1", name: "CTO", avatar: "blue-rectangle", text: "Hello" },
      ],
    }
    expect(
      teamReplyOutput([
        { type: "tool-ask_team", state: "input-available", output },
      ])
    ).toBeUndefined()
    expect(
      teamReplyOutput([
        { type: "tool-ask_team", state: "output-available", output },
      ])
    ).toBe(output)
  })
})

describe("sidebar teams", () => {
  it("creates a group on a legacy directory and searches by team and by bot", () => {
    const original = {
      bots: [
        bot("1", "CTO"),
        bot("2", "Staff Engineer"),
        bot("3", "Chief of Staff"),
      ],
    }
    const grouped = saveTeam(
      original,
      botTeamInput.parse({ name: " Product ", botIds: ["1", "2"] }),
      newId
    )
    expect(grouped.teams).toEqual([{ id: "product", name: "Product" }])
    expect(
      sidebarTeams(grouped, "product").groups[0].bots.map((b) => b.id)
    ).toEqual(["1", "2"])
    expect(
      sidebarTeams(grouped, "engineer").groups[0].bots.map((b) => b.id)
    ).toEqual(["2"])
    expect(sidebarTeams(grouped, "").ungrouped.map((b) => b.id)).toEqual(["3"])
  })

  it("moves membership when editing and preserves agents on removal", () => {
    const grouped = {
      teams: [
        { id: "product", name: "Product" },
        { id: "ops", name: "Ops" },
      ],
      bots: [bot("1", "CTO", "product"), bot("2", "Engineer", "ops")],
    }
    const edited = saveTeam(
      grouped,
      { id: "product", name: "Engineering", botIds: ["2"] },
      newId
    )
    expect(edited.bots.map((b) => b.teamId)).toEqual([undefined, "product"])
    const removed = removeTeam(edited, "product")
    expect(removed.bots.map((b) => [b.id, b.teamId])).toEqual([
      ["1", undefined],
      ["2", undefined],
    ])
    expect(removed.teams).toEqual([{ id: "ops", name: "Ops" }])
  })

  it("adds agents from chat without overwriting a team's other members", () => {
    const initial = {
      teams: [{ id: "product", name: "Product" }],
      bots: [bot("1", "CTO", "product"), bot("2", "Engineer")],
    }
    const result = addTeamMembers(initial, "product", ["2"], () => "unexpected")
    expect(result.directory.teams).toEqual(initial.teams)
    expect(result.members.map(({ id }) => id)).toEqual(["1", "2"])
    const retry = addTeamMembers(
      result.directory,
      "Product",
      ["2"],
      () => "unexpected"
    )
    expect(retry.directory).toEqual(result.directory)
  })

  it("rejects duplicate names and agents outside the directory", () => {
    const grouped = { teams: [{ id: "product", name: "Product" }], bots: [] }
    expect(() =>
      saveTeam(grouped, { name: "product", botIds: [] }, newId)
    ).toThrow("already exists")
    expect(() =>
      saveTeam(grouped, { name: "Ops", botIds: ["not-mine"] }, newId)
    ).toThrow("no longer available")
  })
})
