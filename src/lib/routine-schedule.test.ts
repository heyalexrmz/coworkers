import { describe, expect, it } from "vitest"
import { routineScheduleTime } from "./routine-schedule"

const now = Date.parse("2026-11-23T16:00:00Z")

describe("routineScheduleTime", () => {
  it("resolves a date with an explicit offset to the exact instant", () => {
    expect(
      routineScheduleTime("once", "2026-11-23T09:30:00-08:00", now)
    ).toEqual(new Date("2026-11-23T17:30:00Z"))
  })

  it.each(["2026-11-23", "2026-11-23T09:30:00", "2027-02-30T09:30:00Z"])(
    "rejects an incomplete or invalid timestamp: %s",
    (value) => {
      expect(() => routineScheduleTime("once", value, now)).toThrow(
        /UTC offset/
      )
    }
  )

  it("rejects a one-off in the past and normalizes five-field cron", () => {
    expect(() =>
      routineScheduleTime("once", "2026-11-23T07:00:00-08:00", now)
    ).toThrow(/future/)
    expect(routineScheduleTime("cron", " 0  16 * * 1-5 ", now)).toBe(
      "0 16 * * 1-5"
    )
    expect(() => routineScheduleTime("cron", "@hourly", now)).toThrow(
      /five-field/
    )
  })
})
