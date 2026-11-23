import type { ToolResultPart } from "ai"

type ToolOutput = ToolResultPart["output"]
type ContentPart = Extract<ToolOutput, { type: "content" }>["value"][number]
type JsonValue = Extract<ToolOutput, { type: "json" }>["value"]

// Leave room in persisted chat messages for multiple tool calls and their text.
const IMAGE_BUDGET = 512_000
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
])

/** Keep structured data as before, without throwing away images beside it. */
export function unwrapToolResult(result: unknown) {
  const reply = result as {
    content?: {
      type: string
      text?: string
      data?: string
      mimeType?: string
    }[]
    structuredContent?: unknown
    isError?: boolean
  }
  if (reply?.isError) {
    const text = reply.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
    throw new Error(text || "The app returned an error.")
  }
  if (reply?.content?.some((part) => part.type === "image")) {
    let budget = IMAGE_BUDGET
    const parts = reply.content.map((part) => {
      if (part.type !== "image") return part
      if (
        !part.data ||
        !part.mimeType ||
        !IMAGE_TYPES.has(part.mimeType) ||
        part.data.length > budget
      ) {
        return {
          type: "text",
          text: "[Image omitted: unsupported format or too large. Request a smaller region or lower-resolution screenshot.]",
        }
      }
      budget -= part.data.length
      return { type: "image", data: part.data, mimeType: part.mimeType }
    })
    return reply.structuredContent == null
      ? parts
      : [
          ...parts,
          { type: "text", text: JSON.stringify(reply.structuredContent) },
        ]
  }
  return reply?.structuredContent ?? reply?.content ?? result
}

/** Encode real images as AI SDK tool content, never as JSON/base64 prose. */
export function appToolModelOutput({
  output,
}: {
  output: unknown
}): ToolOutput {
  // Plain objects/arrays from tools are already JSON across the UserHub RPC.
  if (
    !Array.isArray(output) ||
    !output.some((item) => item?.type === "image")
  ) {
    return { type: "json", value: (output ?? null) as JsonValue }
  }
  let budget = IMAGE_BUDGET
  const value: ContentPart[] = []
  for (const item of output) {
    if (item?.type === "image") {
      if (
        typeof item.data === "string" &&
        item.data.length <= budget &&
        IMAGE_TYPES.has(item.mimeType)
      ) {
        budget -= item.data.length
        value.push({
          type: "image-data",
          data: item.data,
          mediaType: item.mimeType,
        })
      } else {
        value.push({
          type: "text",
          text: "[Image omitted. Request a smaller screenshot or a supported image format.]",
        })
      }
    } else if (item?.type === "text" && typeof item.text === "string") {
      value.push({ type: "text", text: item.text })
    } else {
      value.push({ type: "text", text: JSON.stringify(item) ?? "" })
    }
  }
  return { type: "content", value }
}

/** A dropped transport can be repaired for reads, but never replay a write. */
export async function callWithMcpReconnect<T>(
  call: () => Promise<T>,
  readOnly: boolean,
  reconnect: () => Promise<boolean>
) {
  try {
    return await call()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      !readOnly ||
      !/^(?:not connected|connection closed)\.?$/i.test(message.trim()) ||
      !(await reconnect())
    )
      throw error
    return call()
  }
}
