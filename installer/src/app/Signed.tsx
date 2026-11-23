import { useAgent } from "agents/react"
import type { Installer } from "../installer"
import type { InstallerState } from "../shared"
import { Done } from "./Done"
import { Progress } from "./Progress"
import { Setup } from "./Setup"

export type InstallerAgent = ReturnType<
  typeof useAgent<Installer, InstallerState>
>

export default function Signed({ id }: { id: string }) {
  const agent = useAgent<Installer, InstallerState>({
    agent: "installer",
    name: id,
  })
  const state = agent.state
  if (!state)
    return (
      <p role="status" className="text-sm text-kumo-subtle">
        Connecting to installer…
      </p>
    )
  switch (state.phase) {
    case "setup":
      return <Setup key="setup" agent={agent} state={state} />
    case "installing":
    case "failed":
      return <Progress key="progress" agent={agent} state={state} />
    case "done":
      return <Done key="done" agent={agent} state={state} />
  }
}
