import {
  isSeasonGenderDivision,
  TSeason,
  TSeasonGenderDivision,
} from '@shared/schemas/ioSeason'
import {
  Button,
  Dialog,
  Field,
  Input,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  toast,
} from '@ui'
import {type FormEvent, useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {$SeasonCreate} from '../../endpoints/Season'

const initialForm = () => ({
  name: '',
  signUpOpen: false,
  scoring: 'simple' as 'simple' | 'official',
  genderDivision: 'mixed' as TSeasonGenderDivision,
})

/** Creates a season; `switchTo` makes it the current season (used when no season exists yet). */
export function SeasonCreateDialog({
  open,
  onOpenChange,
  onCreated,
  switchTo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (season: TSeason) => void
  switchTo?: boolean
}) {
  const auth = useAuth()
  const $create = useEndpoint($SeasonCreate)
  const [form, formSet] = useState(initialForm)
  const [nameError, nameErrorSet] = useState<string>()
  useEffect(() => {
    if (!open) return
    formSet(initialForm())
    nameErrorSet(undefined)
  }, [open])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!form.name.trim()) return nameErrorSet('Give the season a name.')
    $create
      .fetch({
        name: form.name.trim(),
        signUpOpen: form.signUpOpen,
        genderDivision: form.genderDivision,
        useOfficialScoring: form.scoring === 'official',
      })
      .then((season) => {
        toast.success(`${season.name} created`)
        onCreated?.(season)
        onOpenChange(false)
        if (switchTo) auth.seasonSet(season)
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New season"
      description="A season contains a fixed number of games. A single team will be determined the winner at the end of the season."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={$create.loading}
            onClick={() => submit()}
          >
            Create season
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap={4}>
          <Field label="Name" error={nameError}>
            <Input
              value={form.name}
              onChange={(e) => {
                formSet({...form, name: e.target.value})
                nameErrorSet(undefined)
              }}
              placeholder="e.g. Summer 2022"
              autoFocus
            />
          </Field>
          <Field label="Season type">
            <Select
              value={form.genderDivision}
              onValueChange={(v) =>
                v &&
                isSeasonGenderDivision(v) &&
                formSet({...form, genderDivision: v})
              }
              options={[
                {value: 'mixed', label: 'Mixed'},
                {value: 'men', label: 'Men’s'},
                {value: 'women', label: 'Women’s'},
              ]}
            />
          </Field>
          <Field label="Scoring system">
            <RadioGroup
              value={form.scoring}
              onValueChange={(v) =>
                formSet({...form, scoring: v === 'official' ? 'official' : 'simple'})
              }
              variant="card"
            >
              <Radio
                value="simple"
                label="Simple scoring"
                description="1 MVP per gender, 4 spirit points."
              />
              <Radio
                value="official"
                label="Official scoring"
                description="2 MVPs per gender, 20 spirit points across five categories."
              />
            </RadioGroup>
          </Field>
          <Switch
            checked={form.signUpOpen}
            onCheckedChange={(v) => formSet({...form, signUpOpen: v})}
            label="Sign up open"
            description="Teams and players can sign up while this is active."
            labelPosition="start"
          />
        </Stack>
      </form>
    </Dialog>
  )
}
