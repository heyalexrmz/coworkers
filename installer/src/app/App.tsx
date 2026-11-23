import { Suspense, lazy, useEffect, useState } from "react"
import { Landing } from "./Landing"

// Don't load the WebSocket client and setup form before sign-in.
const Signed = lazy(() => import("./Signed"))
const loading = (
  <p role="status" className="text-sm text-kumo-subtle">
    Loading installer…
  </p>
)

interface Session {
  id: string | null
  configured: boolean
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/session", { signal: controller.signal })
      .then((r) => r.json<Session>())
      .then(setSession)
      .catch(() => {
        if (!controller.signal.aborted)
          setSession({ id: null, configured: false })
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="flex min-h-full flex-col">
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-16">
        {session === null ? (
          loading
        ) : session.id ? (
          <Suspense fallback={loading}>
            <Signed id={session.id} />
          </Suspense>
        ) : (
          <Landing configured={session.configured} />
        )}
      </main>
      <footer className="pb-6 text-center text-xs text-kumo-subtle">
        Coworkers is open source.{" "}
        <a
          href="https://github.com/fayazara/coworkers"
          className="underline decoration-kumo-line underline-offset-2 hover:decoration-current"
        >
          Read the code
        </a>{" "}
        before you install it.
      </footer>
    </div>
  )
}
