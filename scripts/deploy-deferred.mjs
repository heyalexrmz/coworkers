import { readFileSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { parseArgs } from "node:util"

// Reject typos (especially a misspelled --dry-run) before any remote work.
const { values } = parseArgs({
  options: { "dry-run": { type: "boolean" }, help: { type: "boolean" } },
})
if (values.help) {
  console.log("Usage: pnpm run deploy:deferred [--dry-run]")
  process.exit(0)
}
const dry = values["dry-run"] === true
const config = JSON.parse(readFileSync("coworkers.deploy.json", "utf8"))
const { name, accountId } = config
if (
  !name ||
  !accountId ||
  !config.accessAud ||
  config.accessAud === "locked" ||
  !config.accessTeamDomain
) {
  throw new Error(
    "First configure an Access-protected deployment with pnpm run setup."
  )
}
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId }
const cf = (...args) =>
  execFileSync("pnpm", ["exec", "cf", ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })

// Upload the version without touching live traffic. Preserve existing domains
// and triggers: this is only for code releases of an already configured Worker.
if (!dry) execFileSync("pnpm", ["build"], { env, stdio: "inherit" })
let id = "00000000-0000-4000-8000-000000000000"
if (!dry) {
  const upload = spawnSync(
    "pnpm",
    [
      "exec",
      "cf",
      "workers",
      "versions",
      "create",
      "--prebuilt",
      "--worker",
      name,
      "--secrets-file",
      ".dev.vars.production",
    ],
    { env: { ...env, NO_COLOR: "1" }, encoding: "utf8" }
  )
  process.stderr.write(upload.stderr ?? "")
  process.stdout.write(upload.stdout ?? "")
  if (upload.error) throw upload.error
  if (upload.status !== 0)
    throw new Error("Version upload failed. Live traffic was not changed.")
  const output = `${upload.stdout}\n${upload.stderr}`
  id = output.match(
    /Worker Version ID:\s*([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\b/i
  )?.[1]
  if (!id)
    throw new Error(
      "Cloudflare did not return a Worker version ID. Live traffic was not changed."
    )
}
const body = JSON.stringify({
  strategy: "percentage",
  versions: [{ version_id: id, percentage: 100 }],
  code_update_strategy: { mode: "deferred", max_delay: 1_800 },
})
process.stdout.write(
  cf(
    "workers",
    "deployments",
    "create",
    "--worker",
    name,
    "--body",
    body,
    ...(dry ? ["--dry-run"] : [])
  )
)
