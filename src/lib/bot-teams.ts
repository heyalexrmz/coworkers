import { z } from "zod"
import { plainMentions } from "./bot-links"
import type { BotSummary, BotTeam, HubState } from "./types"

export const TEAM_NAME_MAX = 40
export const botTeamInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Enter a team name.").max(TEAM_NAME_MAX),
  botIds: z.array(z.string().min(1)),
})

type Directory = Pick<HubState, "bots" | "teams">

/** Route only direct requests whose entire member list resolves to known agents. */
export function isDirectTeamRequest(
  text: string,
  bots: readonly { name: string }[]
) {
  const clean = plainMentions(text).trim().replace(/[.!]$/, "")
  if (clean.length > 350 || /[\n?]/.test(clean)) return false
  const request =
    /^(?:please\s+)?(?:create|make|set up)\s+(?:a\s+)?(?:new\s+)?team(?:\s+(?:named|called)\s+[^,;]{1,45}?)?\s+with\s+(.+)$/i.exec(
      clean
    )
  if (!request) return false
  const normalize = (name: string) =>
    name
      .trim()
      .replace(/^(?:the\s+)?@?/i, "")
      .trim()
      .toLowerCase()
  const names = request[1]
    .replace(/,\s*(?:and\s+)?/gi, "|")
    .split(/\||\s+(?:and|&)\s+/i)
    .map(normalize)
  return (
    names.length > 0 &&
    names.every(
      (name) =>
        name && bots.filter((bot) => normalize(bot.name) === name).length === 1
    )
  )
}

export function saveTeam(
  state: Directory,
  input: z.infer<typeof botTeamInput>,
  newId: () => string
) {
  const teams = state.teams ?? []
  if (input.id && !teams.some((team) => team.id === input.id)) {
    throw new Error("This team no longer exists.")
  }
  if (
    teams.some(
      (team) =>
        team.id !== input.id &&
        team.name.toLowerCase() === input.name.toLowerCase()
    )
  ) {
    throw new Error("A team with that name already exists.")
  }
  const members = new Set(input.botIds)
  const known = new Set(state.bots.map((bot) => bot.id))
  if ([...members].some((id) => !known.has(id))) {
    throw new Error(
      "An agent is no longer available. Reopen the team and try again."
    )
  }
  const team: BotTeam = { id: input.id ?? newId(), name: input.name }
  return {
    teams: input.id
      ? teams.map((entry) => (entry.id === team.id ? team : entry))
      : [...teams, team],
    bots: state.bots.map((bot) =>
      members.has(bot.id)
        ? { ...bot, teamId: team.id }
        : bot.teamId === team.id
          ? withoutTeam(bot)
          : bot
    ),
  }
}

/** Chat adds nominated members without removing anyone already on the team. */
export function addTeamMembers(
  state: Directory,
  name: string,
  botIds: string[],
  newId: () => string
) {
  const existing = state.teams?.find(
    (team) => team.name.toLowerCase() === name.toLowerCase()
  )
  const id = existing?.id ?? newId()
  const members = existing
    ? [
        ...state.bots.filter((bot) => bot.teamId === id).map((bot) => bot.id),
        ...botIds,
      ]
    : botIds
  const directory = saveTeam(
    state,
    { id: existing?.id, name: existing?.name ?? name, botIds: members },
    () => id
  )
  const team = directory.teams.find((entry) => entry.id === id)!
  return {
    directory,
    team,
    members: directory.bots.filter((bot) => bot.teamId === id),
  }
}

export function removeTeam(state: Directory, id: string) {
  return {
    teams: (state.teams ?? []).filter((team) => team.id !== id),
    bots: state.bots.map((bot) => (bot.teamId === id ? withoutTeam(bot) : bot)),
  }
}

function withoutTeam({ teamId: _teamId, ...bot }: BotSummary): BotSummary {
  return bot
}

export function sidebarTeams(state: Directory, query: string) {
  const needle = query.trim().toLowerCase()
  const matches = (bot: BotSummary) =>
    !needle ||
    bot.name.toLowerCase().includes(needle) ||
    bot.preview.toLowerCase().includes(needle)
  const groups = new Map(
    (state.teams ?? []).map((team) => [
      team.id,
      {
        team,
        bots: [] as BotSummary[],
        nameMatches: team.name.toLowerCase().includes(needle),
      },
    ])
  )
  const ungrouped: BotSummary[] = []
  for (const bot of state.bots) {
    const group = bot.teamId ? groups.get(bot.teamId) : undefined
    if (group) {
      if (group.nameMatches || matches(bot)) group.bots.push(bot)
    } else if (matches(bot)) {
      ungrouped.push(bot)
    }
  }
  return {
    groups: [...groups.values()].filter(
      (group) => group.nameMatches || group.bots.length > 0
    ),
    ungrouped,
  }
}
