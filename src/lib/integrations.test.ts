import { describe, expect, it } from "vitest"
import {
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
  integrationEndpoint,
  integrationFor,
  integrationHeaders,
} from "./integrations"

describe("remote MCP catalog", () => {
  it.each([
    ["circleback", "Meetings", "https://circleback.ai/api/mcp"],
    ["granola", "Meetings", "https://mcp.granola.ai/mcp"],
    ["paper", "Design", "https://mcp.paper.design/"],
    ["canva", "Design", "https://mcp.canva.com/mcp"],
    ["stripe", "Finance", "https://mcp.stripe.com/"],
  ])("recognizes %s and uses OAuth", (id, category, endpoint) => {
    expect(INTEGRATION_CATEGORIES).toContain(category)
    expect(integrationFor(endpoint)).toMatchObject({
      id,
      category,
      auth: "oauth",
    })
  })
})

describe("Exa connection settings", () => {
  const exa = INTEGRATIONS.find((integration) => integration.id === "exa")!

  it("starts OAuth rather than attempting keyless access from the Worker", () => {
    expect(exa.auth).toBe("oauth")
    expect(integrationEndpoint(exa, " ")).toBe("https://mcp.exa.ai/mcp?login")
    expect(integrationHeaders(exa, " ")).toEqual({})
  })

  it("uses the normal endpoint with a key header and recognizes either endpoint", () => {
    const keyEndpoint = integrationEndpoint(exa, " example-key ")
    expect(keyEndpoint).toBe("https://mcp.exa.ai/mcp")
    expect(integrationHeaders(exa, " example-key ")).toEqual({
      "x-api-key": "example-key",
    })
    expect(integrationFor(keyEndpoint)).toBe(exa)
    expect(integrationFor(exa.url)).toBe(exa)
  })
})
