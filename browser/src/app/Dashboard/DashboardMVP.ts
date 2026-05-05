import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$ReportListOfSeason} from '../../endpoints/Report'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {$UserListManyById} from '../../endpoints/User'
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
import {FormRow} from '../Form/FormRow'
import {css} from '@emotion/css'

export const DashboardMVP: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfSeason)
  const $userList = useEndpoint($UserListManyById)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()
  const [users, usersSet] = useState<TUserPublic[]>()
  const seasonId = auth.season!.id
  const useOfficialScoring = auth.season?.useOfficialScoring === true

  useEffect(() => {
    if (!auth.isAdmin()) {
      go.to('/')
      return
    }

    $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
    $reportList.fetch({seasonId}).then((i) => reportsSet(i.reports))
  }, [auth.current, seasonId])

  const calcMvp = () => {
    const tally = (reports ?? []).reduce(
      (all, report) => {
        const {mvpMale, mvpFemale, mvpMale2, mvpFemale2, teamAgainstId} = report
        if (mvpMale) {
          if (!all[mvpMale]) {
            all[mvpMale] = {points: [0, 0, 0, 0], teamId: teamAgainstId}
          }
          all[mvpMale].points[0] += useOfficialScoring ? 5 : 1
        }
        if (mvpFemale) {
          if (!all[mvpFemale]) {
            all[mvpFemale] = {points: [0, 0, 0, 0], teamId: teamAgainstId}
          }
          all[mvpFemale].points[1] += useOfficialScoring ? 5 : 1
        }
        if (useOfficialScoring) {
          if (mvpMale2) {
            if (!all[mvpMale2]) {
              all[mvpMale2] = {points: [0, 0, 0, 0], teamId: teamAgainstId}
            }
            all[mvpMale2].points[2] += 3
          }
          if (mvpFemale2) {
            if (!all[mvpFemale2]) {
              all[mvpFemale2] = {points: [0, 0, 0, 0], teamId: teamAgainstId}
            }
            all[mvpFemale2].points[3] += 3
          }
        }
        return all
      },
      {} as Record<string, {points: number[]; teamId?: string}>,
    )

    return Object.keys(tally)
      .map((i) => {
        const {points, teamId} = tally[i]
        const [male5pt, female5pt, male3pt, female3pt] = points
        const maleTotal = male5pt + male3pt
        const femaleTotal = female5pt + female3pt
        const totalPoints = maleTotal + femaleTotal
        return {
          userId: i,
          votes: totalPoints,
          teamId,
          gender: maleTotal > femaleTotal ? 0 : 1,
        }
      })
      .sort((a, b) => b.votes - a.votes)
      .filter((a) => a.votes > 0)
  }

  const userIdsAndVotes = calcMvp()

  useEffect(() => {
    if (userIdsAndVotes.length) {
      $userList
        .fetch({userIds: userIdsAndVotes.map((i) => i.userId)})
        .then(usersSet)
    } else {
      usersSet([])
    }
  }, [userIdsAndVotes.map((i) => i.userId).join()])

  const usersAndVotes = userIdsAndVotes
    .map(({userId, votes, gender, teamId}) => {
      const user = users?.find((j) => j.id === userId)
      const teamOfUser = teams?.find((t) => t.id === teamId)
      const displayName = user ? `${user.firstName} ${user.lastName}` : userId
      return {
        key: userId,
        gender:
          user?.gender === 'male' ? 0 : user?.gender === 'female' ? 1 : gender,
        data: {
          user: {
            value: displayName,
          },
          division: {value: teamOfUser?.division ?? '...'},
          team: {value: teamOfUser?.name ?? '...'},
          votes: {value: votes},
        },
      }
    })
    .sort((a, b) => {
      const diff = b.data.votes.value - a.data.votes.value
      if (diff !== 0) return diff
      return a.data.user.value.localeCompare(b.data.user.value)
    })

  return $(Form, {
    background: theme.bgAdmin,
    children:
      reports === undefined || teams === undefined
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
                '& > *:not(:last-child)': {marginRight: theme.fib[5]},
                '& > *': {flexGrow: 1},
                [theme.ltMedia(theme.fib[14])]: {
                  flexDirection: 'column',
                  '& > *': {flexGrow: 0},
                  '& > *:not(:last-child)': {
                    marginBottom: theme.fib[5],
                    marginRight: 0,
                  },
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
                      body: usersAndVotes.filter((i) => i.gender === 0),
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
                      body: usersAndVotes.filter((i) => i.gender === 1),
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
  })
}
