import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
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

// Type for missing reports data structure
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

const formatRoundLabel = (round: TMissingReportRound) =>
  `${round.title} - ${dayjs(round.date).format('MMM D')}`

const formatTeamLabel = (
  team: TMissingReportRound['missingTeams'][number]
) => {
  return team.name
}

const formatMissingReportsText = (rounds: TMissingReportRound[]) =>
  rounds
    .map((round) =>
      [formatRoundLabel(round), ...round.missingTeams.map((team) => `- ${formatTeamLabel(team)}`)].join(
        '\n'
      )
    )
    .join('\n\n')

export const MissingReportsControl: FC<{
  seasonId: string
  label?: string
  grow?: boolean
}> = ({seasonId, label = 'View Missing Reports', grow = true}) => {
  const [open, openSet] = useState(false)

  return $(Fragment, {
    children: addkeys([
      $(FormBadge, {
        grow,
        label,
        background: theme.bgAdminButton,
        click: () => openSet(true),
      }),
      open &&
        $(MissingReportsModal, {
          seasonId,
          close: () => openSet(false),
        }),
    ]),
  })
}

export const MissingReportsModal: FC<{
  seasonId: string
  close: () => void
}> = ({seasonId, close}) => {
  const $missingReports = useEndpoint($ReportMissingList)
  const [rounds, roundsSet] = useState<TMissingReportRound[]>([])
  const [loading, loadingSet] = useState(true)
  const [openFixtureIds, openFixtureIdsSet] = useState<string[]>([])

  useEffect(() => {
    loadingSet(true)
    $missingReports
      .fetch({seasonId})
      .then((data) => {
        roundsSet(data)
        openFixtureIdsSet(data.length ? [data[0].fixtureId] : [])
        loadingSet(false)
      })
      .catch((error) => {
        console.error('Failed to fetch missing reports:', error)
        loadingSet(false)
      })
  }, [seasonId])

  const missingReportsText = formatMissingReportsText(rounds)

  return $(Modal, {
    width: theme.fib[14],
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
        className: css({
          maxHeight: '75vh',
          overflow: 'hidden',
        }),
        children: loading
          ? $(Spinner)
          : rounds.length === 0
          ? $(FormLabel, {
              label: 'No missing reports found.',
              background: theme.bgMinor,
            })
          : $('div', {
              className: css({
                display: 'grid',
                overflow: 'hidden',
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
                gap: theme.fib[5],
                minHeight: theme.fib[12],
                height: '100%',
                [theme.ltMedia(theme.fib[13])]: {
                  gridTemplateColumns: '1fr',
                },
              }),
              children: addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: theme.fib[5],
                    overflow: 'auto',
                    minWidth: 0,
                  }),
                  children: addkeys(
                    rounds.map((round) => {
                      const open = openFixtureIds.includes(round.fixtureId)
                      return $(FormColumn, {
                        key: round.fixtureId,
                        children: addkeys([
                          $(FormBadge, {
                            label: formatRoundLabel(round),
                            background: theme.bg,
                            suffixIcon: open ? 'angle-up' : 'angle-down',
                            grow: true,
                            wrap: true,
                            style: {
                              justifyContent: 'space-between',
                              textAlign: 'left',
                              alignItems: 'center',
                            },
                            click: () =>
                              openFixtureIdsSet((current) =>
                                current.includes(round.fixtureId)
                                  ? current.filter((id) => id !== round.fixtureId)
                                  : current.concat(round.fixtureId)
                              ),
                          }),
                          ...(
                            open
                              ? round.missingTeams.map((team) =>
                                  $(FormBadge, {
                                    key: team.id,
                                    label: formatTeamLabel(team),
                                    background: theme.bgMinor,
                                    grow: true,
                                    select: 'text',
                                    wrap: true,
                                  })
                                )
                              : []
                          ),
                        ]),
                      })
                    })
                  ),
                }),
                $(FormColumn, {
                  grow: true,
                  className: css({
                    overflow: 'hidden',
                  }),
                  children: addkeys([
                    $(FormBadge, {
                      noshrink: true,
                      label: 'Text Copy',
                      background: theme.bg,
                    }),
                    $('div', {
                      children: missingReportsText,
                      onClick: (e) => {
                        const ws = window.getSelection()
                        if (!ws) return
                        // dont select if a selection already exists (eg user is trying to copy a specific team)
                        if (ws.toString()) return
                        ws.selectAllChildren(e.currentTarget)
                      },
                      className: css({
                        flexGrow: 1,
                        overflow: 'auto',
                        minHeight: theme.fib[12],
                        border: theme.border(),
                        padding: theme.padify(theme.fib[4]),
                        background: theme.bg.string(),
                        whiteSpace: 'pre-wrap',
                      }),
                    }),
                  ]),
                }),
              ]),
            }),
      }),
    ]),
  })
}
