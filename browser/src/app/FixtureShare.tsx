import {TFixture} from '@shared/schemas/ioFixture'
import {Button, DataTable, EmptyState, Heading, Stack, Text, toast} from '@ui'
import {ArrowLeft, CalendarX, Link2, Printer} from 'lucide-react'
import {config} from '../config'
import {useLoad} from '../core/useLoad'
import {$FeatureFixtureViewLoad} from '../endpoints/Feature'
import {go} from '../utils/go'
import {Logo} from './Logo'
import {Loading, TeamName, fmtDate} from './shared'

type TGame = TFixture['games'][number]

/** Focused, frame-less fixture view for sharing or display at the fields (`/?fixtureId=…`). */
export function FixtureShare({fixtureId}: {fixtureId: string}) {
  // Public view: call the endpoint directly so an unknown id shows a message here instead of
  // useEndpoint's "missing record" handling (which resets stored state and leaves the page).
  const view = useLoad(() => $FeatureFixtureViewLoad.fetch({fixtureId}), [fixtureId])
  const fixture = view.data?.fixture
  const teams = view.data?.teams ?? []
  const teamById = (id: string) => teams.find((t) => t.id === id)
  const games = [...(fixture?.games ?? [])].sort((a, b) => {
    if (a.time !== b.time) return a.time.localeCompare(b.time)
    return a.place.localeCompare(b.place)
  })
  const copyLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Link copied'))
      .catch(() => toast.error('Could not copy the link'))
  }
  return (
    <div className="fr-share">
      <div className="fr-share__bar">
        <Button
          variant="ghost"
          size="sm"
          leading={<ArrowLeft />}
          onClick={() => go.to('/fixtures')}
        >
          Back to fixtures
        </Button>
        <Stack direction="row" gap={2}>
          <Button size="sm" leading={<Link2 />} onClick={copyLink}>
            Copy link
          </Button>
          <Button
            size="sm"
            leading={<Printer />}
            onClick={() => window.print()}
            disabled={!fixture}
          >
            Print
          </Button>
        </Stack>
      </div>
      {!fixture ? (
        view.loading ? (
          <Loading />
        ) : (
          <div className="fr-share__sheet">
            <EmptyState
              icon={<CalendarX />}
              title="Fixture not found"
              description="This link may be out of date, or the fixture was removed."
              actions={
                <Button onClick={() => go.to('/fixtures')}>See all fixtures</Button>
              }
            />
          </div>
        )
      ) : (
        <div className="fr-share__sheet" id="clip">
          <Stack direction="row" gap={3} align="center">
            <Logo size={40} />
            <div>
              <Text size="xs" tone="tertiary">
                {config.title}
              </Text>
              <Heading level={1} size="2xl">
                {fixture.title}
              </Heading>
            </div>
            <Text size="sm" tone="secondary" className="fr-share__date">
              {fmtDate(fixture.date)}
            </Text>
          </Stack>
          <DataTable<TGame>
            rowKey={(g) => g.id}
            rows={games}
            columns={[
              {key: 'time', header: 'Time', width: 90, nowrap: true},
              {key: 'place', header: 'Place', width: 90, nowrap: true},
              {
                key: 'team1',
                header: 'Team 1',
                render: (g) => <TeamName team={teamById(g.team1Id)} size="md" />,
              },
              {
                key: 'vs',
                header: '',
                width: 40,
                align: 'center',
                render: () => (
                  <Text as="span" size="xs" tone="tertiary">
                    vs
                  </Text>
                ),
              },
              {
                key: 'team2',
                header: 'Team 2',
                render: (g) => <TeamName team={teamById(g.team2Id)} size="md" />,
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
