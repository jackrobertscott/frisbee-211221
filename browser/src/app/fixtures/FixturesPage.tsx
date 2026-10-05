import {authPoint} from '@shared/auth/authAccess'
import {TFixture} from '@shared/schemas/ioFixture'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  toast,
} from '@ui'
import {
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Share2,
  WandSparkles,
} from 'lucide-react'
import {useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {useLoad} from '../../core/hooks/useLoad'
import {$FeatureCompetitionLoad} from '../../core/endpoints/Feature'
import {navigate} from '../../core/router/navigate'
import {FixtureAdjustDialog} from './FixtureAdjustDialog'
import {FixtureEditDialog} from './FixtureEditDialog'
import {FixtureGames} from './FixtureGames'
import {FixtureGenerateDialog} from './FixtureGenerateDialog'
import './fixtures.css'
import {FixtureRow} from '../common/FixtureRow'
import {Loading} from '../common/Loading'
import {fmtDate} from '../common/format'
import {useShell} from '../shell/ShellProvider'

const DAY = 24 * 60 * 60 * 1000
const isUpcoming = (f: TFixture) =>
  new Date(f.date).getTime() + DAY > Date.now()

const shareUrl = (fixtureId: string) =>
  `${window.location.origin}/?fixtureId=${encodeURIComponent(fixtureId)}`

export function FixturesPage() {
  const auth = useAuth()
  const shell = useShell()
  const isAdmin = auth.can(authPoint.fixtureManage)
  const seasonId = auth.season?.id
  const $load = useEndpoint($FeatureCompetitionLoad)
  const [open, openSet] = useState<string[]>([])
  const [editing, editingSet] = useState<TFixture | 'new' | null>(null)
  const [generating, generatingSet] = useState(false)
  const [adjusting, adjustingSet] = useState(false)
  const competition = useLoad(async () => {
    if (!seasonId) return {teams: [], fixtures: []}
    const data = await $load.fetch({seasonId})
    openSet(data.fixtures.filter(isUpcoming).map((f) => f.id))
    return data
  }, [seasonId, shell.version])
  const teams = competition.data?.teams ?? []
  const fixtures = competition.data?.fixtures ?? []
  const next = fixtures.find(isUpcoming)
  const myTeamId = auth.current?.team?.id
  const toggle = (id: string) =>
    openSet((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))
  const copyLink = (f: TFixture) => {
    navigator.clipboard
      .writeText(shareUrl(f.id))
      .then(() => toast.success('Link copied', {description: f.title}))
      .catch(() => toast.error('Could not copy the link'))
  }
  const done = () => {
    competition.reload()
  }

  return (
    <div className="fr-page">
      {isAdmin && (
        <div className="fr-actions">
          <Button
            leading={<WandSparkles />}
            onClick={() => generatingSet(true)}
            disabled={!competition.data}
          >
            Magic generate
          </Button>
          <Button
            leading={<CalendarClock />}
            onClick={() => adjustingSet(true)}
            disabled={!fixtures.length}
          >
            Adjust fixtures
          </Button>
          <Button
            leading={<Plus />}
            onClick={() => editingSet('new')}
            disabled={!competition.data}
          >
            Add fixture
          </Button>
        </div>
      )}

      {!competition.data ? (
        <Loading
          label="Loading fixtures"
          failed={competition.failed}
          onRetry={competition.reload}
        />
      ) : fixtures.length === 0 ? (
        <EmptyState
          bordered
          icon={<CalendarPlus />}
          title="No fixtures yet"
          description={
            isAdmin
              ? 'Generate a full round robin in one go, or add fixtures one at a time.'
              : 'The draw hasn’t been published yet. Check back soon.'
          }
          actions={
            isAdmin && (
              <Button
                variant="primary"
                leading={<WandSparkles />}
                onClick={() => generatingSet(true)}
              >
                Magic generate
              </Button>
            )
          }
        />
      ) : (
        <Stack gap={2} className="fr-fx-list">
          {fixtures.map((f) => (
            <FixtureRow
              key={f.id}
              open={open.includes(f.id)}
              onToggle={() => toggle(f.id)}
              title={
                <span className="fr-fx-title">
                  <span className="fr-fx-title__text">{f.title}</span>
                  {f.grading && (
                    <Badge size="sm" variant="outline">
                      Grading
                    </Badge>
                  )}
                  {f.id === next?.id && (
                    <Badge size="sm" tone="info" data-next>
                      Next up
                    </Badge>
                  )}
                </span>
              }
              meta={fmtDate(f.date)}
              action={
                <>
                  <Menu
                    placement="bottom-end"
                    trigger={
                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label={`Share ${f.title}`}
                      >
                        <Share2 />
                      </IconButton>
                    }
                  >
                    <MenuItem
                      icon={<ExternalLink />}
                      onSelect={() =>
                        navigate(`/?fixtureId=${encodeURIComponent(f.id)}`)
                      }
                    >
                      Open shareable view
                    </MenuItem>
                    <MenuItem icon={<Link2 />} onSelect={() => copyLink(f)}>
                      Copy link
                    </MenuItem>
                  </Menu>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leading={<Pencil />}
                      aria-label={`Edit ${f.title}`}
                      onClick={() => editingSet(f)}
                    >
                      <span className="fr-fx-edit-label">Edit</span>
                    </Button>
                  )}
                </>
              }
            >
              <FixtureGames fixture={f} teams={teams} myTeamId={myTeamId} />
            </FixtureRow>
          ))}
        </Stack>
      )}

      {isAdmin && seasonId && (
        <>
          <FixtureEditDialog
            fixture={editing}
            teams={teams}
            onClose={() => editingSet(null)}
            onDone={() => {
              editingSet(null)
              done()
            }}
          />
          <FixtureGenerateDialog
            open={generating}
            onOpenChange={generatingSet}
            seasonId={seasonId}
            teams={teams}
            fixtures={fixtures}
            onDone={() => {
              generatingSet(false)
              done()
            }}
          />
          <FixtureAdjustDialog
            open={adjusting}
            onOpenChange={adjustingSet}
            fixtures={fixtures}
            seasonId={seasonId}
            onDone={() => {
              adjustingSet(false)
              done()
            }}
          />
        </>
      )}
    </div>
  )
}
