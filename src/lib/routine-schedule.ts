import { z } from "zod"
import type { Routine } from "./types"

const timestamp = z.iso.datetime({ offset: true })

/** Validate a routine before it is handed to the durable scheduler. */
export function routineScheduleTime(
  kind: Routine["kind"],
  when: string,
  now = Date.now()
): Date | string {
  const value = when.trim()
  if (kind === "cron") {
    const fields = value.split(/\s+/)
    if (fields.length !== 5 || value.length > 120) {
      throw new Error(
        "Use a five-field UTC cron expression, such as 0 16 * * 1-5."
      )
    }
    return fields.join(" ")
  }
  if (!timestamp.safeParse(value).success) {
    throw new Error(
      "Use a date and time with a UTC offset, such as 2026-12-01T09:00:00-08:00."
    )
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) {
    throw new Error("Choose a time in the future.")
  }
  return date
}
