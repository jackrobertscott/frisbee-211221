import {authPoint} from '@shared/auth/authAccess'
import {Button, Card, ConfirmDialog, EmptyState, Stack, Text} from '@ui'
import {CalendarPlus, CalendarX, LogOut} from 'lucide-react'
import {config} from '../../config'
import {useAuth} from '../../core/auth/useAuth'
import {Logo} from '../shell/Logo'
import {useShell} from '../shell/ShellProvider'
import {SeasonCreateDialog} from './SeasonCreateDialog'

/** Shown when no season exists. Admins can create one; everyone else is asked to come back later. */
export function SeasonSetup() {
  const auth = useAuth()
  const shell = useShell()
  const canManage = auth.can(authPoint.seasonManage)
  return (
    <div className="fr-auth">
      <div className="fr-auth__inner">
        <Stack align="center" gap={3}>
          <Logo size={config.leagueKey === 'marlow' ? 64 : 88} />
          <Text weight="semibold">{config.title}</Text>
        </Stack>
        <Card padding="lg" className="fr-auth__card">
          {canManage ? (
            <EmptyState
              icon={<CalendarPlus />}
              title="Start a new season"
              description="There’s no active season yet. Create one to open team registrations and start building fixtures."
              actions={
                <Button
                  variant="primary"
                  leading={<CalendarPlus />}
                  onClick={() => shell.open({kind: 'seasonCreate'})}
                >
                  Create season
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<CalendarX />}
              title="Season not ready"
              description="Looks like you got here too early. Please come back when the new season registrations are open."
            />
          )}
        </Card>
        {auth.current && (
          <Button
            variant="ghost"
            size="sm"
            leading={<LogOut />}
            onClick={() => shell.open({kind: 'logout'})}
            className="fr-auth__back"
          >
            Log out
          </Button>
        )}
      </div>
      <SeasonCreateDialog
        switchTo
        open={shell.overlay?.kind === 'seasonCreate'}
        onOpenChange={(open) => !open && shell.close()}
      />
      <ConfirmDialog
        open={shell.overlay?.kind === 'logout'}
        onOpenChange={(open) => !open && shell.close()}
        icon={<LogOut />}
        title="Log out?"
        description="Are you sure you wish to sign out of your account?"
        confirmLabel="Log out"
        onConfirm={() => auth.logout()}
      />
    </div>
  )
}
