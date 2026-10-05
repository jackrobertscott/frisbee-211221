import {TTeam} from '@shared/schemas/ioTeam'
import {cx, Swatch, Text, type Option} from '@ui'
import {initials} from './format'

/** Anything with a team name and optional colour (teams, report rows, missing-report rows). */
export type TTeamLike = {name: string; color?: string}

/** Team name with its colour chip. */
export function TeamName({
  team,
  size = 'sm',
  short,
  muted,
  wrap,
}: {
  team?: TTeamLike
  size?: 'sm' | 'md'
  short?: boolean
  muted?: boolean
  /** Let a long name wrap instead of widening its column; `'narrow'` wraps only on phones. */
  wrap?: boolean | 'narrow'
}) {
  if (!team)
    return (
      <Text as="span" size="sm" tone="tertiary">
        Unknown team
      </Text>
    )
  const label = short ? initials(team.name) : team.name
  return (
    <span
      className={cx(
        'fr-team',
        muted && 'fr-team--muted',
        wrap && (wrap === true ? 'fr-team--wrap' : `fr-team--wrap-${wrap}`),
      )}
      data-size={size}
    >
      {team.color && (
        <Swatch color={team.color} size={size === 'md' ? 'md' : 'sm'} />
      )}
      <span className="fr-team__name" title={short ? team.name : undefined}>
        {label}
      </span>
    </span>
  )
}

export const teamOptions = (teams: TTeam[]): Option[] =>
  teams.map((t) => ({
    value: t.id,
    label: t.name,
    icon: <Swatch color={t.color} />,
    meta: typeof t.division === 'number' ? `Div ${t.division}` : undefined,
  }))
