/** The filename is a single safe path component, even for shell hand-offs. */
export function safeAttachmentName(name: string) {
  const safe = name
    .replace(/[^\w.\- ]+/g, "_")
    .trim()
    .slice(0, 120)
    .trimEnd()
  return !safe || safe === "." || safe === ".." ? "file" : safe
}

export function parseAttachmentRef(ref: string) {
  const match =
    /^attachment:\/\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\/([\w.\- ]{1,120})$/.exec(
      ref
    )
  if (!match || safeAttachmentName(match[2]) !== match[2]) return null
  return { id: match[1], name: match[2] }
}

/** Derive the object key from trusted bot identity, not a client-supplied key. */
export function attachmentKey(botName: string, ref: string) {
  const attachment = parseAttachmentRef(ref)
  return attachment
    ? `${encodeURIComponent(botName)}/${attachment.id}/${attachment.name}`
    : null
}

/** Split the composer’s trailing attachment list, including older workspace uploads. */
export function splitAttachments(text: string): {
  text: string
  paths: string[]
} {
  const match = /(?:^|\n\n)Attached files: ([^\n]+)$/.exec(text)
  if (!match) return { text, paths: [] }
  const paths = match[1].split(", ")
  if (
    !paths.every(
      (path) =>
        parseAttachmentRef(path) ||
        (path.startsWith("/workspace/inbox/") &&
          !path.split("/").includes(".."))
    )
  ) {
    return { text, paths: [] }
  }
  return { text: text.slice(0, match.index).trimEnd(), paths }
}
