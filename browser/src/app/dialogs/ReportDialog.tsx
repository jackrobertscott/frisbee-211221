import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {$ReportCreate} from '../../endpoints/Report'
import {createReportCreatePayload} from '../report/reportForm'
import {ReportFormDialog} from '../report/ReportFormDialog'

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
