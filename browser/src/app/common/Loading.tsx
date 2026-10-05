import {Button, EmptyState, Spinner} from '@ui'
import {CloudOff, RotateCw} from 'lucide-react'

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
    <div className="fr-loading fr-loading--pending" role="status" aria-label={label}>
      <Spinner />
    </div>
  )
}
