import type { ModelMessage } from "ai"
import { describe, expect, it, vi } from "vitest"
import { presentMcpImages } from "./mcp-tool-images"
import {
  appToolModelOutput,
  callWithMcpReconnect,
  unwrapToolResult,
} from "./mcp-tool-result"

const jpeg = { type: "image", mimeType: "image/jpeg", data: "aW1hZ2U=" }

describe("MCP results", () => {
  it("keeps screenshots as image data alongside text and structured data", () => {
    const output = unwrapToolResult({
      content: [{ type: "text", text: "Preview" }, jpeg],
      structuredContent: { width: 1440 },
    })
    expect(appToolModelOutput({ output })).toEqual({
      type: "content",
      value: [
        { type: "text", text: "Preview" },
        { type: "image-data", mediaType: jpeg.mimeType, data: jpeg.data },
        { type: "text", text: '{"width":1440}' },
      ],
    })
  })
  it("moves images after all parallel tool results so Chat Completions can see them", () => {
    const messages: ModelMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "preview",
            toolName: "app_tool_call",
            output: appToolModelOutput({ output: [jpeg] }),
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "styles",
            toolName: "app_tool_call",
            output: { type: "text", value: "color: red" },
          },
        ],
      },
    ]
    const presented = presentMcpImages(messages)
    expect(presented?.map((m) => m.role)).toEqual(["tool", "tool", "user"])
    expect(presented?.[1]).toEqual(messages[1])
    expect(presented?.[2].content).toContainEqual({
      type: "image",
      mediaType: jpeg.mimeType,
      image: `data:${jpeg.mimeType};base64,${jpeg.data}`,
    })
    expect(JSON.stringify(presented?.[0])).not.toContain(jpeg.data)
    expect(presentMcpImages(presented!)).toBeNull()
  })
  it("preserves ordinary structured data and tool errors", () => {
    expect(
      unwrapToolResult({
        structuredContent: { color: "red" },
        content: [{ type: "text", text: "Compatibility" }],
      })
    ).toEqual({ color: "red" })
    expect(() =>
      unwrapToolResult({
        isError: true,
        content: [{ type: "text", text: "File not found" }],
      })
    ).toThrow("File not found")
  })
  it("omits oversized images before persisting the tool result", () => {
    expect(
      unwrapToolResult({ content: [{ ...jpeg, data: "A".repeat(512_001) }] })
    ).toEqual([
      { type: "text", text: expect.stringContaining("Image omitted") },
    ])
  })
})

describe("MCP reconnect", () => {
  it("reconnects and repeats a disconnected read exactly once", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error("Not connected"))
      .mockResolvedValueOnce({ result: 42 })
    const reconnect = vi.fn().mockResolvedValueOnce(true)
    await expect(callWithMcpReconnect(call, true, reconnect)).resolves.toEqual({
      result: 42,
    })
    expect(call).toHaveBeenCalledTimes(2)
    expect(reconnect).toHaveBeenCalledOnce()
  })
  it("does not repeat writes, tool or authorization failures, or a second failed read", async () => {
    const reconnect = vi.fn().mockResolvedValue(true)
    for (const [reason, readOnly] of [
      ["Not connected", false],
      ["Unauthorized", true],
      ["The paper file was not found", true],
    ] as const) {
      const call = vi.fn().mockRejectedValue(new Error(reason))
      await expect(
        callWithMcpReconnect(call, readOnly, reconnect)
      ).rejects.toThrow(reason)
      expect(call).toHaveBeenCalledOnce()
    }
    expect(reconnect).not.toHaveBeenCalled()
    const read = vi.fn().mockRejectedValue(new Error("Not connected"))
    await expect(callWithMcpReconnect(read, true, reconnect)).rejects.toThrow(
      "Not connected"
    )
    expect(read).toHaveBeenCalledTimes(2)
    expect(reconnect).toHaveBeenCalledOnce()
  })
})
