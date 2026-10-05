import {Field, Input, NumberInput, Stack, SwatchPicker} from '@ui'
import {Mail, Phone} from 'lucide-react'
import {TEAM_COLORS} from '../../utils/colors'
import './team.css'

const colorLabel = (color: string) => {
  const index = TEAM_COLORS.indexOf(color)
  return index < 0 ? color : `Colour ${index + 1}`
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/** Client-side checks shown inline once the user tries to save. */
export const teamFormErrors = (value: TTeamFormValue, contact = true) => {
  const errors: {name?: string; email?: string} = {}
  if (!value.name.trim()) errors.name = 'Give the team a name.'
  if (contact && value.email.trim() && !isEmail(value.email.trim()))
    errors.email = 'Enter a valid email address.'
  return errors
}

export const hasTeamFormErrors = (value: TTeamFormValue, contact = true) =>
  Object.keys(teamFormErrors(value, contact)).length > 0

export interface TTeamFormValue {
  name: string
  phone: string
  email: string
  color: string
  division?: number
}

/** Editable team fields shared by admin create/edit, captain settings and team setup. */
export function TeamFormFields({
  value,
  onChange,
  contact = true,
  division,
  autoFocus,
  showErrors,
}: {
  value: TTeamFormValue
  onChange: (value: TTeamFormValue) => void
  contact?: boolean
  division?: boolean
  autoFocus?: boolean
  /** Show validation messages (set after the first save attempt). */
  showErrors?: boolean
}) {
  const set = (patch: Partial<TTeamFormValue>) => onChange({...value, ...patch})
  const errors = showErrors ? teamFormErrors(value, contact) : {}
  return (
    <Stack gap={4}>
      <Field label="Team name" error={errors.name}>
        <Input
          value={value.name}
          onChange={(e) => set({name: e.target.value})}
          autoFocus={autoFocus}
        />
      </Field>
      {contact && (
        <div className="fr-grid-2">
          <Field label="Public phone" optional>
            <Input
              leading={<Phone />}
              value={value.phone}
              onChange={(e) => set({phone: e.target.value})}
              placeholder="04xx xxx xxx"
            />
          </Field>
          <Field label="Public email" optional error={errors.email}>
            <Input
              leading={<Mail />}
              type="email"
              value={value.email}
              onChange={(e) => set({email: e.target.value})}
              placeholder="team@example.com"
            />
          </Field>
        </div>
      )}
      {division && (
        <Field
          label="Division"
          description="Fixtures are generated within each division."
          optional
        >
          <NumberInput
            value={value.division ?? null}
            onValueChange={(n) => set({division: n ?? undefined})}
            min={0}
            placeholder="Unassigned"
          />
        </Field>
      )}
      <Field label="Colour" description="Shown next to the team name across the app.">
        <SwatchPicker
          className="fr-team-colors"
          colors={TEAM_COLORS}
          value={value.color}
          onValueChange={(color) => set({color})}
          getLabel={colorLabel}
          size="sm"
        />
      </Field>
    </Stack>
  )
}

export const teamFormFrom = (team?: {
  name: string
  phone?: string
  email?: string
  color: string
  division?: number
}): TTeamFormValue => ({
  name: team?.name ?? '',
  phone: team?.phone ?? '',
  email: team?.email ?? '',
  color: team?.color ?? TEAM_COLORS[0],
  division: team?.division,
})
