import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {$ReportCreate} from '../../core/endpoints/Report'
import {createReportCreatePayload} from './reportForm'
import {ReportFormDialog} from './ReportFormDialog'

/** Public "Report score" flow for team members (and admins, who pick the team). */
export function ReportDialog({
  open,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}) {
  const auth = useAuth()
  const $create = useEndpoint($ReportCreate)
  if (!auth.season) return null
  return (
    <ReportFormDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="public"
      title="Report score"
      loading={$create.loading}
      onSubmit={(data) => {
        const payload = createReportCreatePayload(data, auth.season)
        if (!payload) return
        $create
          .fetch(payload)
          .then(onSubmitted)
          .catch(() => undefined)
      }}
    />
  )
}
