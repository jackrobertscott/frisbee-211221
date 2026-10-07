import {Button, EmptyState, Spinner} from '@ui'
import {CloudOff, RotateCw} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

/** How long the spinner waits before appearing (matches `fr-loading-reveal` in app.css). */
const REVEAL_DELAY = 250
/** A spinner mounting this soon after a visible one went away continues it instead of waiting again. */
const HANDOFF_WINDOW = 100
let lastVisibleAt = -Infinity

/** Centered spinner for page and panel loading states; shows a retry state once loading failed. */
export function Loading({
  label = 'Loading',
  failed,
  onRetry,
}: {
  label?: string
  failed?: boolean
  onRetry?: () => void
}) {
  /* Loads often run in stages (auth, page chunk, page data), each with its own spinner. Without this, every stage would hide for the reveal delay and the spinner would blink on and off. */
  const [immediate] = useState(() => Date.now() - lastVisibleAt < HANDOFF_WINDOW)
  const failedRef = useRef(failed)
  failedRef.current = failed
  useEffect(() => {
    const mountedAt = Date.now()
    return () => {
      const shown = immediate || Date.now() - mountedAt >= REVEAL_DELAY
      if (shown && !failedRef.current) lastVisibleAt = Date.now()
    }
  }, [immediate])
  if (failed)
    return (
      <div className="fr-loading">
        <EmptyState
          icon={<CloudOff />}
          title="Couldn’t load this"
          description="Check your connection and try again."
          actions={
            onRetry && (
              <Button leading={<RotateCw />} onClick={onRetry}>
                Try again
              </Button>
            )
          }
        />
      </div>
    )
  return (
    <div
      className={immediate ? 'fr-loading' : 'fr-loading fr-loading--pending'}
      role="status"
      aria-label={label}
    >
      <Spinner />
    </div>
  )
}
