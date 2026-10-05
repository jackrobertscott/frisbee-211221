import {authPoint} from '@shared/auth/authAccess'
import {Dialog, Tab, TabList, TabPanel, Tabs} from '@ui'
import {CalendarCog, KeyRound, Shirt, UserRound, Users} from 'lucide-react'
import {type ReactNode, useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {$MemberListOfTeam} from '../../endpoints/Member'
import {AccountSettings} from '../settings/AccountSettings'
import {
  PasswordSettings,
  SeasonSettings,
  TeamSettings,
} from '../settings/OtherSettings'
import {Loading} from '../shared'
import {TeamMembers} from '../team/TeamMembers'

interface TSettingsTab {
  id: string
  label: string
  icon: ReactNode
  render: () => ReactNode
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: string
}) {
  const auth = useAuth()
  const $memberList = useEndpoint($MemberListOfTeam)
  const team = auth.current?.team
  const isAdmin = auth.isAdmin()
  const [tab, tabSet] = useState('account')
  const [isCaptain, isCaptainSet] = useState<boolean>()
  const [captainOfTeam, captainOfTeamSet] = useState(false)
  useEffect(() => {
    if (open) tabSet(initialTab ?? 'account')
  }, [open, initialTab])
  useEffect(() => {
    if (!open) return
    captainOfTeamSet(false)
    if (!team) {
      isCaptainSet(false)
      return
    }
    isCaptainSet(undefined)
    $memberList
      .fetch(team.id)
      .then((data) => {
        captainOfTeamSet(!!data.current?.captain)
        isCaptainSet(!!data.current?.captain || isAdmin)
      })
      .catch(() => isCaptainSet(isAdmin))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team?.id, isAdmin])

  const tabs: TSettingsTab[] = [
    {
      id: 'account',
      label: 'Account',
      icon: <UserRound />,
      render: () => (
        <AccountSettings
          role={
            isAdmin ? 'Administrator' : captainOfTeam ? 'Team captain' : 'Player'
          }
        />
      ),
    },
    {
      id: 'password',
      label: 'Change password',
      icon: <KeyRound />,
      render: () => <PasswordSettings />,
    },
    ...(team && isCaptain
      ? [{id: 'team', label: 'Team', icon: <Shirt />, render: () => <TeamSettings />}]
      : []),
    ...(team
      ? [
          {
            id: 'members',
            label: 'Members',
            icon: <Users />,
            render: () => (
              <TeamMembers team={team} onLeft={() => onOpenChange(false)} />
            ),
          },
        ]
      : []),
    ...(auth.can(authPoint.seasonManage)
      ? [
          {
            id: 'season',
            label: 'Season',
            icon: <CalendarCog />,
            render: () => <SeasonSettings />,
          },
        ]
      : []),
  ]
  const waitingForTeam = tab === 'team' && !!team && isCaptain === undefined
  const active = tabs.some((t) => t.id === tab)
    ? tab
    : tab === 'team' && team
      ? 'members'
      : 'account'

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      size="xl"
      className="fr-settings"
    >
      <Tabs
        orientation="vertical"
        value={active}
        onValueChange={tabSet}
        className="fr-settings__tabs"
      >
        <TabList aria-label="Settings sections">
          {tabs.map((t) => (
            <Tab key={t.id} value={t.id} icon={t.icon}>
              {t.label}
            </Tab>
          ))}
        </TabList>
        {tabs.map((t) => (
          <TabPanel key={t.id} value={t.id}>
            {waitingForTeam ? <Loading /> : t.render()}
          </TabPanel>
        ))}
      </Tabs>
    </Dialog>
  )
}
