import dayjs from 'dayjs'
import {createElement as $, FC, useEffect, useState} from 'react'
import {$ReportMissingList} from '../../endpoints/Report'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {Modal} from '../Modal'
import {Spinner} from '../Spinner'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'

/**
 * Type for missing reports data structure
 */
type TMissingReportRound = {
  title: string
  fixtureId: string
  date: string
  missingTeams: Array<{
    id: string
    name: string
    color?: string
    againstId?: string
    againstName?: string
  }>
}

/**
 * Modal component to display missing reports by round
 */
export const MissingReportsModal: FC<{
  seasonId: string
  close: () => void
}> = ({seasonId, close}) => {
  const $missingReports = useEndpoint($ReportMissingList)
  const [rounds, roundsSet] = useState<TMissingReportRound[]>([])
  const [loading, loadingSet] = useState(true)

  useEffect(() => {
    loadingSet(true)
    $missingReports
      .fetch({seasonId})
      .then((data) => {
        roundsSet(data)
        loadingSet(false)
      })
      .catch((error) => {
        console.error('Failed to fetch missing reports:', error)
        loadingSet(false)
      })
  }, [seasonId])

  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Missing Reports',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: loading
          ? $(Spinner)
          : rounds.length === 0
          ? $(FormLabel, {
              label: 'No missing reports found.',
              background: theme.bgMinor,
            })
          : addkeys([
              ...rounds.map((round) => {
                return $(FormColumn, {
                  key: round.fixtureId,
                  children: addkeys([
                    $(FormBadge, {
                      label: `${round.title} - ${dayjs(round.date).format(
                        'MMM D'
                      )}`,
                      background: theme.bgMinor,
                      icon: 'calendar',
                    }),
                    ...round.missingTeams.map((team) => {
                      return $(FormBadge, {
                        key: team.id,
                        label: team.name,
                        background: team.color,
                        grow: true,
                      })
                    }),
                  ]),
                })
              }),
            ]),
      }),
    ]),
  })
}
