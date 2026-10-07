import {Button, EmptyState, Spinner} from '@ui'
import {CloudOff, RotateCw} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

/** How long a load must run before the spinner appears. */
const REVEAL_DELAY = 1000
/** A spinner mounting this soon after another went away is the next stage of the same load. */
const HANDOFF_WINDOW = 100
let lastEndedAt = -Infinity
let lastStartedAt = 0

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
  /* Loads often run in stages (auth, page chunk, page data), each with its own spinner. The stages share one start time, so the spinner only appears once the load as a whole has been slow, rather than each stage flashing it briefly. */
  const [startedAt] = useState(() => {
    const now = Date.now()
    return now - lastEndedAt < HANDOFF_WINDOW ? lastStartedAt : now
  })
  const failedRef = useRef(failed)
  failedRef.current = failed
  useEffect(
    () => () => {
      lastEndedAt = failedRef.current ? -Infinity : Date.now()
      lastStartedAt = startedAt
    },
    [startedAt],
  )
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
      className="fr-loading fr-loading--pending"
      style={{animationDelay: `${Math.max(0, startedAt + REVEAL_DELAY - Date.now())}ms`}}
      role="status"
      aria-label={label}
    >
      <Spinner />
    </div>
  )
}
