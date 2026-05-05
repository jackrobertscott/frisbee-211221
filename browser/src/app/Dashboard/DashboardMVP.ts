import {authPoint} from '@shared/auth/authAccess'
import {TFeatureMvpRow} from '@shared/endpoints/FeatureDef'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FeatureDashboardMvpLoad} from '../../endpoints/Feature'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useEndpoint} from '../useEndpoint'

export const DashboardMVP: FC = () => {
  const auth = useAuth()
  const $mvpLoad = useEndpoint($FeatureDashboardMvpLoad)
  const [rows, rowsSet] = useState<TFeatureMvpRow[]>()
  const seasonId = auth.season!.id

  useEffect(() => {
    if (!auth.can(authPoint.reportManage)) {
      go.to('/')
      return
    }

    $mvpLoad.fetch({seasonId}).then((data) => rowsSet(data.rows))
  }, [auth.current, seasonId])

  return $(Form, {
    background: theme.bgAdmin,
    children:
      rows === undefined
        ? $(Spinner)
        : addkeys([
            $(Fragment, {
              children:
                auth.season?.useOfficialScoring &&
                $(FormLabel, {
                  label: 'MVP 1st Place = 5 Points & MVP 2nd Place = 3 Points',
                  background: theme.bgMinor,
                  style: {
                    justifyContent: 'center',
                  },
                }),
            }),
            $('div', {
              className: css({
                flexGrow: 1,
                display: 'flex',
                gap: theme.fib[5],
                '& > *': {flexGrow: 1},
                [theme.ltMedia(theme.fib[14])]: {
                  flexDirection: 'column',
                  '& > *': {flexGrow: 0},
                },
              }),
              children: addkeys([
                $(FormColumn, {
                  children: addkeys([
                    $(FormBadge, {
                      label: 'Male MVP Votes',
                      background: theme.bgMinor,
                    }),
                    $(Table, {
                      head: {
                        user: {label: 'User', grow: 3},
                        division: {label: 'Division', grow: 1},
                        team: {label: 'Team', grow: 2},
                        votes: {label: 'Points', grow: 1},
                      },
                      body: rows
                        .filter((row) => row.gender === 0)
                        .map((row) => ({
                          key: row.userId,
                          data: {
                            user: {value: row.userName},
                            division: {value: row.division ?? '...'},
                            team: {value: row.teamName ?? '...'},
                            votes: {value: row.votes},
                          },
                        })),
                    }),
                  ]),
                }),
                $(FormColumn, {
                  children: addkeys([
                    $(FormBadge, {
                      label: 'Female MVP Points',
                      background: theme.bgMinor,
                    }),
                    $(Table, {
                      head: {
                        user: {label: 'User', grow: 3},
                        division: {label: 'Division', grow: 1},
                        team: {label: 'Team', grow: 2},
                        votes: {label: 'Points', grow: 1},
                      },
                      body: rows
                        .filter((row) => row.gender === 1)
                        .map((row) => ({
                          key: row.userId,
                          data: {
                            user: {value: row.userName},
                            division: {value: row.division ?? '...'},
                            team: {value: row.teamName ?? '...'},
                            votes: {value: row.votes},
                          },
                        })),
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
  })
}
