import { describe, expect, it } from "vitest"
import {
  attachmentKey,
  safeAttachmentName,
  splitAttachments,
} from "./attachments"

const ref = "attachment://cbb312e3-e023-41a4-b6ac-7c5da964d54d/my file.pdf"

it("scopes object keys to the bot and rejects traversal or raw keys", () => {
  expect(attachmentKey("demo:a", ref)).toBe(
    "demo%3Aa/cbb312e3-e023-41a4-b6ac-7c5da964d54d/my file.pdf"
  )
  expect(attachmentKey("demo:b", ref)).not.toEqual(attachmentKey("demo:a", ref))
  expect(attachmentKey("demo:a", ref.replace("my file.pdf", ".."))).toBeNull()
  expect(attachmentKey("demo:a", "demo%3Ab/raw/key")).toBeNull()
  expect(safeAttachmentName("..")).toBe("file")
  expect(safeAttachmentName("a".repeat(119) + " x")).toBe("a".repeat(119))
})

describe("splitAttachments", () => {
  it("shows R2 references alongside legacy workspace attachments", () => {
    expect(
      splitAttachments(
        `What is this?\n\nAttached files: ${ref}, /workspace/inbox/a.pdf`
      )
    ).toEqual({
      text: "What is this?",
      paths: [ref, "/workspace/inbox/a.pdf"],
    })
  })
  it("extracts old and new inbox paths while preserving the message", () => {
    expect(
      splitAttachments(
        "What is this?\n\nAttached files: /workspace/inbox/a file.pdf, /workspace/inbox/123/photo.png"
      )
    ).toEqual({
      text: "What is this?",
      paths: ["/workspace/inbox/a file.pdf", "/workspace/inbox/123/photo.png"],
    })
  })
  it("handles attachment-only messages", () => {
    expect(splitAttachments("Attached files: /workspace/inbox/a.pdf")).toEqual({
      text: "",
      paths: ["/workspace/inbox/a.pdf"],
    })
  })
  it("leaves unrelated text alone", () => {
    const text = "Attached files: not a path"
    expect(splitAttachments(text)).toEqual({ text, paths: [] })
  })
})
