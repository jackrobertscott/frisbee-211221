import {authPoint} from '@shared/auth/authAccess'
import {TSeason} from '@shared/schemas/ioSeason'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  IconButton,
  Link,
  Menu,
  MenuHeader,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  Tab,
  TabList,
  Tabs,
  Text,
  Tooltip,
  toast,
} from '@ui'
import {
  CalendarPlus,
  ChevronDown,
  ExternalLink,
  LogIn,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  Moon,
  Settings,
  Sun,
  Users,
} from 'lucide-react'
import {lazy, type ReactNode, Suspense, useEffect, useState} from 'react'
import {config} from '../../config'
import {useAuth} from '../../core/auth/useAuth'
import {useColorMode} from '../../core/colorMode'
import {Router} from '../../core/router/Router'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {$SeasonList} from '../../core/endpoints/Season'
import {navigate} from '../../core/router/navigate'
import {primaryEmail} from '../common/users'
import {JoinTeamDialog} from '../teams/JoinTeamDialog'
import {ReportDialog} from '../reports/ReportDialog'
import {SettingsDialog} from '../settings/SettingsDialog'
import {Logo} from './Logo'
import {FixturesPage} from '../fixtures/FixturesPage'
import {LadderPage} from '../ladder/LadderPage'
import {TeamsPage} from '../teams/TeamsPage'
import {SeasonCreateDialog} from '../seasons/SeasonCreateDialog'
import {fullName} from '../common/format'
import {Loading} from '../common/Loading'
import {useShell} from './ShellProvider'

/** Admin-only pages load on demand to keep the public bundle small. */
const ReportsPage = lazy(() =>
  import('../reports/ReportsPage').then((m) => ({default: m.ReportsPage})),
)
const SpiritPage = lazy(() =>
  import('../spirit/SpiritPage').then((m) => ({default: m.SpiritPage})),
)
const MvpPage = lazy(() =>
  import('../mvp/MvpPage').then((m) => ({default: m.MvpPage})),
)
const UsersPage = lazy(() =>
  import('../users/UsersPage').then((m) => ({default: m.UsersPage})),
)
const PortPage = lazy(() =>
  import('../port/PortPage').then((m) => ({default: m.PortPage})),
)

const MARLOW_SHOP_URL =
  'https://marlow-street-ultimate.square.site/s/shop?fbclid=IwAR21rulDg_KiLtXACWJmW1bm08W0xoVqRHLie3L12-bg0_0Rtqu8ObB2LDs'

interface TPage {
  path: string
  label: string
  render: () => ReactNode
}

export function Dashboard() {
  const auth = useAuth()
  const shell = useShell()
  const pages: TPage[] = [
    {path: '/ladder', label: 'Ladder', render: () => <LadderPage />},
    {path: '/fixtures', label: 'Fixtures', render: () => <FixturesPage />},
    ...(auth.can(authPoint.reportManage)
      ? [
          {path: '/reports', label: 'Reports', render: () => <ReportsPage />},
          {path: '/spirit', label: 'Spirit', render: () => <SpiritPage />},
          {path: '/mvp', label: 'MVP', render: () => <MvpPage />},
        ]
      : []),
    {path: '/teams', label: 'Teams', render: () => <TeamsPage />},
    ...(auth.can(authPoint.userManage)
      ? [{path: '/users', label: 'Users', render: () => <UsersPage />}]
      : []),
    ...(auth.can(authPoint.portManage)
      ? [{path: '/port', label: 'Port', render: () => <PortPage />}]
      : []),
  ]

  return (
    <div className="fr-app">
      <Header />
      <Router
        fallback="/fixtures"
        routes={pages}
        render={(children, context) => (
          <>
            <nav className="fr-nav" aria-label="Sections">
              <Tabs
                value={context.current.path}
                onValueChange={(path) => navigate(path)}
                className="fr-nav__tabs"
              >
                <TabList aria-label="Sections">
                  {pages.map((p) => (
                    <Tab key={p.path} value={p.path}>
                      {p.label}
                    </Tab>
                  ))}
                </TabList>
              </Tabs>
              {config.leagueKey === 'marlow' && (
                <Link
                  href={MARLOW_SHOP_URL}
                  external
                  subtle
                  className="fr-nav__shop"
                >
                  Shop
                </Link>
              )}
              <Menu
                className="fr-nav__menu"
                trigger={
                  <Button
                    variant="secondary"
                    size="sm"
                    leading={<MenuIcon />}
                    trailing={<ChevronDown />}
                    className="fr-nav__menu-trigger"
                  >
                    {context.current.label}
                  </Button>
                }
              >
                {pages.map((p) => (
                  <MenuItem key={p.path} onSelect={() => navigate(p.path)}>
                    {p.label}
                  </MenuItem>
                ))}
                {config.leagueKey === 'marlow' && (
                  <>
                    <MenuSeparator />
                    <MenuItem
                      icon={<ExternalLink />}
                      onSelect={() => openExternal(MARLOW_SHOP_URL)}
                    >
                      Shop
                    </MenuItem>
                  </>
                )}
              </Menu>
              <Button
                variant="primary"
                size="sm"
                leading={<Megaphone />}
                onClick={shell.reportScore}
                className="fr-nav__report"
              >
                Report score
              </Button>
              <Button
                variant="primary"
                size="sm"
                leading={<Megaphone />}
                onClick={shell.reportScore}
                className="fr-mobile-only fr-nav__report-sm"
              >
                Report
              </Button>
            </nav>
            <main className="fr-main" key={context.current.path}>
              <Suspense fallback={<Loading />}>{children}</Suspense>
            </main>
          </>
        )}
      />
      <Footer />
      <AppDialogs />
    </div>
  )
}

const openExternal = (href: string) => {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.click()
  a.remove()
}

function Header() {
  const auth = useAuth()
  const shell = useShell()
  const [mode, toggleMode] = useColorMode()
  const user = auth.current?.user
  const team = auth.current?.team

  return (
    <header className="fr-header">
      <a
        className="fr-brand"
        href="/"
        tabIndex={-1}
        draggable={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault()
          navigate('/')
        }}
      >
        <Logo />
        <div className="fr-brand__text">
          <Text as="span" weight="semibold" size="sm" className="fr-brand__name">
            {config.title}
          </Text>
        </div>
      </a>

      <div className="fr-header__actions">
        {user &&
          (team ? (
            <Button
              variant="ghost"
              size="sm"
              className="fr-header__team"
              leading={
                <span
                  className="fr-dot"
                  style={{background: team.color}}
                  aria-hidden
                />
              }
              onClick={() => shell.open({kind: 'settings', tab: 'team'})}
            >
              <span className="fr-header__team-name">{team.name}</span>
            </Button>
          ) : (
            <Button
              variant="soft"
              size="sm"
              leading={<Users />}
              aria-label="Join a team"
              onClick={() => shell.open({kind: 'join'})}
            >
              Join<span className="fr-hide-xs"> a team</span>
            </Button>
          ))}

        <SeasonSwitcher />

        <Tooltip content={mode === 'dark' ? 'Use light theme' : 'Use dark theme'}>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Toggle colour mode"
            onClick={toggleMode}
          >
            {mode === 'dark' ? <Sun /> : <Moon />}
          </IconButton>
        </Tooltip>

        {user ? (
          <>
            <Tooltip content="Settings">
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Settings"
                onClick={() => shell.open({kind: 'settings'})}
                className="fr-hide-sm"
              >
                <Settings />
              </IconButton>
            </Tooltip>
            <Menu
              placement="bottom-end"
              minWidth={230}
              trigger={
                <button
                  type="button"
                  className="fr-avatar-btn"
                  aria-label="Account menu"
                >
                  <Avatar size="sm" name={fullName(user)} src={user.avatarUrl} />
                </button>
              }
            >
              <MenuHeader>
                <Text size="sm" weight="medium">
                  {fullName(user)}
                </Text>
                <Text size="xs" tone="tertiary">
                  {primaryEmail(user)}
                </Text>
              </MenuHeader>
              <MenuSeparator />
              <MenuItem
                icon={<Settings />}
                onSelect={() => shell.open({kind: 'settings'})}
              >
                Settings
              </MenuItem>
              {!team && (
                <MenuItem
                  icon={<Users />}
                  onSelect={() => shell.open({kind: 'join'})}
                >
                  Join a team
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                icon={<LogOut />}
                onSelect={() => shell.open({kind: 'logout'})}
              >
                Log out
              </MenuItem>
            </Menu>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            leading={<LogIn />}
            onClick={() => navigate('/auth/welcome')}
          >
            Log in
          </Button>
        )}
      </div>
    </header>
  )
}

/** Season picker. Hidden for visitors when there's only one season to choose. */
function SeasonSwitcher() {
  const auth = useAuth()
  const shell = useShell()
  const canManage = auth.can(authPoint.seasonManage)
  const $seasonList = useEndpoint($SeasonList)
  const [seasons, seasonsSet] = useState<TSeason[]>()
  useEffect(() => {
    $seasonList
      .fetch({})
      .then(seasonsSet)
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.version])
  const season = auth.season
  if (!season) return null
  if ((seasons?.length ?? 0) <= 1 && !canManage) return null
  const visible = (seasons ?? []).filter((s) => canManage || !s.isHidden)

  return (
    <Menu
      placement="bottom-end"
      minWidth={240}
      trigger={
        <Button
          variant="secondary"
          size="sm"
          trailing={<ChevronDown />}
          className="fr-header__season"
          aria-label={`Season: ${season.name}`}
        >
          <span className="fr-header__season-name">{season.name}</span>
        </Button>
      }
    >
      <MenuLabel>Seasons</MenuLabel>
      {seasons === undefined ? (
        <MenuItem disabled>Loading…</MenuItem>
      ) : (
        <MenuRadioGroup
          value={season.id}
          onValueChange={(id) => {
            const next = visible.find((s) => s.id === id)
            if (next && next.id !== season.id) auth.seasonSet(next)
          }}
        >
          {visible.map((s) => (
            <MenuRadioItem key={s.id} value={s.id} keepOpen={false}>
              <span className="fr-season-option">
                {s.name}
                {s.isHidden && (
                  <Badge size="sm" tone="warning">
                    Hidden
                  </Badge>
                )}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      )}
      {canManage && (
        <>
          <MenuSeparator />
          <MenuItem
            icon={<CalendarPlus />}
            onSelect={() => shell.open({kind: 'seasonCreate'})}
          >
            Create new season
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

function Footer() {
  return (
    <footer className="fr-footer">
      {config.leagueKey === 'marlow' ? (
        <Link
          href="https://drive.google.com/file/d/1A9ZQTAly2_rSdF6h710ZUYS0tXz8LQzg/view"
          external
          subtle
        >
          Policy &amp; rules
        </Link>
      ) : (
        <Link href="https://rules.wfdf.sport/resources/" external subtle>
          WFDF rules
        </Link>
      )}
      <Link href="https://rules.wfdf.sport/accreditation/" external subtle>
        Accreditation
      </Link>
      <Link href="https://afda.com/claims-procedure" external subtle>
        Injury &amp; insurance
      </Link>
    </footer>
  )
}

function AppDialogs() {
  const auth = useAuth()
  const shell = useShell()
  const overlay = shell.overlay
  const onOpenChange = (open: boolean) => {
    if (!open) shell.close()
  }
  return (
    <>
      {auth.current && (
        <ReportDialog
          open={overlay?.kind === 'report'}
          onOpenChange={onOpenChange}
          onSubmitted={() => {
            shell.close()
            shell.invalidate()
            toast.success('Score submitted successfully.')
          }}
        />
      )}
      {auth.current && (
        <SettingsDialog
          open={overlay?.kind === 'settings'}
          onOpenChange={onOpenChange}
          initialTab={overlay?.kind === 'settings' ? overlay.tab : undefined}
        />
      )}
      {auth.current && (
        <JoinTeamDialog
          open={overlay?.kind === 'join'}
          onOpenChange={onOpenChange}
        />
      )}
      <SeasonCreateDialog
        open={overlay?.kind === 'seasonCreate'}
        onOpenChange={onOpenChange}
        onCreated={() => shell.invalidate()}
      />
      <ConfirmDialog
        open={overlay?.kind === 'logout'}
        onOpenChange={onOpenChange}
        icon={<LogOut />}
        title="Log out?"
        description="Are you sure you wish to sign out of your account?"
        confirmLabel="Log out"
        onConfirm={() => {
          shell.close()
          auth.logout()
        }}
      />
    </>
  )
}
