import { useId, useState } from "react"
import type { FormEvent } from "react"
import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog"
import { TEAM_NAME_MAX } from "@/lib/bot-teams"
import { useHub } from "@/lib/hub-context"
import type { BotTeam } from "@/lib/types"

export function BotTeamDialog({
  team,
  onClose,
}: {
  team?: BotTeam
  onClose: () => void
}) {
  const hub = useHub()
  const formId = useId()
  const [name, setName] = useState(team?.name ?? "")
  const [members, setMembers] = useState(
    () =>
      new Set(
        hub.state.bots
          .filter((bot) => team && bot.teamId === team.id)
          .map((bot) => bot.id)
      )
  )
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function update(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update this team."
      )
      setBusy(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !name.trim()) return
    void update(() =>
      hub.saveBotTeam({
        ...(team ? { id: team.id } : {}),
        name,
        botIds: [...members],
      })
    )
  }

  return (
    <LayerDialog.Root
      open
      dismissDisabled={busy}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{team ? "Edit team" : "New team"}</LayerDialog.Title>
        <LayerDialog.Description>
          Group agents together in your sidebar.
        </LayerDialog.Description>
        <LayerDialog.Body>
          <form id={formId} onSubmit={save} className="space-y-4 pt-1">
            <label className="block text-sm font-medium text-kumo-default">
              Team name
              <input
                className="mt-1.5 block min-h-10 w-full rounded-xl border border-kumo-line bg-kumo-base px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus"
                name="name"
                required
                maxLength={TEAM_NAME_MAX}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Product"
              />
            </label>
            <fieldset className="space-y-1" disabled={busy}>
              <legend className="text-sm font-medium text-kumo-default">
                Agents
              </legend>
              {hub.state.bots.length ? (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-kumo-line">
                  {hub.state.bots.map((bot) => {
                    const other =
                      bot.teamId !== team?.id &&
                      hub.state.teams?.find(({ id }) => id === bot.teamId)
                    return (
                      <label
                        key={bot.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-kumo-default hover:bg-(--fill-hover)"
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-kumo-contrast"
                          checked={members.has(bot.id)}
                          onChange={({ target }) =>
                            setMembers((prev) => {
                              const next = new Set(prev)
                              if (target.checked) next.add(bot.id)
                              else next.delete(bot.id)
                              return next
                            })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {bot.name}
                        </span>
                        {other ? (
                          <span className="max-w-[45%] truncate text-xs text-kumo-subtle">
                            {other.name}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-kumo-subtle">
                  No agents yet. You can add them later.
                </p>
              )}
              {hub.state.teams?.some(({ id }) => id !== team?.id) ? (
                <p className="text-xs text-kumo-subtle">
                  Selecting an agent from another team moves it here.
                </p>
              ) : null}
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-kumo-danger">
                {error}
              </p>
            ) : null}
            {team ? (
              <div>
                {confirmDelete ? (
                  <p className="text-xs text-kumo-subtle">
                    This removes the team conversation. Its agents move to
                    Ungrouped and keep their individual chats.
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy || !hub.live}
                  onClick={() =>
                    confirmDelete
                      ? void update(() => hub.deleteBotTeam(team.id))
                      : setConfirmDelete(true)
                  }
                  className="min-h-11 text-sm font-medium text-kumo-danger hover:underline disabled:opacity-50"
                >
                  {confirmDelete ? "Confirm removal" : "Remove team"}
                </button>
              </div>
            ) : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel="Cancel">
          <LayerDialog.Actions.Primary
            type="submit"
            form={formId}
            loading={busy}
            disabled={busy || !hub.live || !name.trim()}
          >
            {team ? "Save changes" : "Create team"}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  )
}
