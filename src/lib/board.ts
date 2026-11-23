import { z } from "zod"

export const BOARD_STATUSES = ["queued", "running", "review", "done"] as const
export type BoardStatus = (typeof BOARD_STATUSES)[number]

export const boardDraftSchema = z.object({
  title: z.string().trim().min(1, "Give this task a title").max(160),
  description: z.string().trim().max(4000).default(""),
  assigneeId: z.string().min(1).max(100).nullable().default(null),
})
export const boardEditSchema = boardDraftSchema.extend({
  id: z.uuid(),
  updatedAt: z.number().int(),
  status: z.enum(["queued", "review", "done"]),
})

export type BoardDraft = z.input<typeof boardDraftSchema>
export type BoardEdit = z.input<typeof boardEditSchema>

export interface BoardTask {
  id: string
  title: string
  description: string
  assigneeId: string | null
  createdByBotId: string | null
  status: BoardStatus
  createdAt: number
  updatedAt: number
  result: string | null
  error: string | null
}
