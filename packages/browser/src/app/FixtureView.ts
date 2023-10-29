import {css} from '@emotion/css'
import {createElement as $, FC, useEffect, useState} from 'react'
import {TFixture} from '../../../shared/src/schemas/ioFixture'
import {TTeam} from '../../../shared/src/schemas/ioTeam'
import {$FixtureGet} from '../endpoints/Fixture'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {Spinner} from './Spinner'
import {Table} from './Table'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const FixtureView: FC<{
  fixtureId: string
}> = ({fixtureId}) => {
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixture, fixtureSet] = useState<TFixture>()
  const $fixtureGet = useEndpoint($FixtureGet)
  useEffect(() => {
    $fixtureGet.fetch({fixtureId}).then((i) => {
      fixtureSet(i.fixture)
      teamsSet(i.teams)
    })
  }, [fixtureId])
  if (fixture === undefined || teams === undefined) {
    return $(Form, {
      children: $(Spinner),
    })
  }
  return $('div', {
    id: 'clip',
    className: css({
      width: '100%',
      flexDirection: 'column',
    }),
    children: $(FormColumn, {
      children: addkeys([
        $('div', {
          className: css({
            display: 'flex',
            justifyContent: 'center',
            background: theme.bgMinor.string(),
            padding: theme.padify(theme.fib[4]),
            border: theme.border(),
          }),
          children: addkeys([
            $('div', {
              children: fixture.title,
            }),
          ]),
        }),
        $(Table, {
          head: {
            one: {label: 'Team 1', grow: 3},
            two: {label: 'Team 2', grow: 3},
            time: {label: 'Time', grow: 2},
            place: {label: 'Place', grow: 2},
          },
          body: fixture.games.map((game) => {
            const team1 = teams.find((i) => i.id === game.team1Id)
            const team2 = teams.find((i) => i.id === game.team2Id)
            return {
              key: game.id,
              data: {
                one: {
                  value: team1?.name ?? '[unknown]',
                  color: team1?.color,
                },
                two: {
                  value: team2?.name ?? '[unknown]',
                  color: team2?.color,
                },
                time: {value: game.time},
                place: {value: game.place},
              },
            }
          }),
        }),
      ]),
    }),
  })
}
