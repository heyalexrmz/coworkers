import { describe, expect, it } from "vitest"
import {
  addTeamMembers,
  botTeamInput,
  removeTeam,
  saveTeam,
  sidebarTeams,
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
