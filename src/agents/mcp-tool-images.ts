import type { ModelMessage, UserModelMessage } from "ai"

/** AI Gateway's Chat Completions wire drops images on tool-role messages.
 * Keep the tool reply, then present its images as ordinary image parts to the
 * model. This is prompt-only: no extra user message is saved or shown in chat.
 */
export function presentMcpImages(
  messages: ModelMessage[]
): ModelMessage[] | null {
  const result: ModelMessage[] = []
  let images: Exclude<UserModelMessage["content"], string> = []
  let changed = false
  const flush = () => {
    if (!images.length) return
    result.push({ role: "user", content: images })
    images = []
  }
  for (const message of messages) {
    if (message.role !== "tool") {
      flush()
      result.push(message)
      continue
    }
    const content = message.content.map((part) => {
      if (
        part.type !== "tool-result" ||
        part.output.type !== "content" ||
        (part.toolName !== "app_tool_call" &&
          !part.toolName.startsWith("tool_c"))
      )
        return part
      const kept = part.output.value.filter(
        (item) => item.type !== "image-data"
      )
      if (kept.length === part.output.value.length) return part
      changed = true
      images.push({
        type: "text",
        text: "Image returned by the connected-app tool above:",
      })
      for (const item of part.output.value) {
        if (item.type !== "image-data") continue
        images.push({
          type: "image",
          image: `data:${item.mediaType};base64,${item.data}`,
          mediaType: item.mediaType,
        })
      }
      return {
        ...part,
        output: {
          type: "content" as const,
          value: [
            ...kept,
            {
              type: "text" as const,
              text: "[Image attached after the tool results.]",
            },
          ],
        },
      }
    })
    result.push({ ...message, content })
  }
  flush()
  return changed ? result : null
}
