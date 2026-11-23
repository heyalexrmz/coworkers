import { BotAvatar } from "@/components/bot-avatar"
import { BotIcon } from "@/components/icons"
import type { BotSummary } from "@/lib/types"

/** Four faces at most, in a compact contact-style mosaic. */
export function TeamAvatars({ members }: { members: readonly BotSummary[] }) {
  if (!members.length) {
    return (
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center text-kumo-subtle"
      >
        <BotIcon size={23} />
      </span>
    )
  }
  if (members.length === 1)
    return <BotAvatar avatar={members[0].avatar} size={48} staticPose />
  return (
    <span aria-hidden="true" className="relative block size-12 shrink-0">
      {members.slice(0, 4).map((member, index) => (
        <span
          key={member.id}
          className={`absolute ${
            members.length === 2
              ? ["top-0 left-0", "right-0 bottom-0"][index]
              : [
                  "top-0.5 left-0.5",
                  "top-0.5 right-0.5",
                  `bottom-0.5 ${members.length === 3 ? "left-1/2 -translate-x-1/2" : "left-0.5"}`,
                  "right-0.5 bottom-0.5",
                ][index]
          }`}
        >
          <BotAvatar
            avatar={member.avatar}
            size={members.length === 2 ? 29 : 25}
            staticPose
          />
        </span>
      ))}
    </span>
  )
}
