import {TUserSafe} from '@shared/schemas/ioUser'
import {TUserGenderMatching} from '@shared/schemas/ioUserGenderMatching'
import {Button, Dialog, Field, Input, Select, Stack, Switch, toast} from '@ui'
import {Mail} from 'lucide-react'
import {type FormEvent, useEffect, useState} from 'react'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {$UserCreate} from '../../core/endpoints/User'
import {fullName} from '../common/format'
import {genderMatchingOptions, isUserGenderMatching} from '../common/users'

const initialForm = () => ({
  firstName: '',
  lastName: '',
  email: '',
  genderMatching: undefined as TUserGenderMatching | undefined,
  termsAccepted: false,
})

/** Admin: create a user account. */
export function UserCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (user: TUserSafe) => void
}) {
  const $create = useEndpoint($UserCreate)
  const [form, formSet] = useState(initialForm)
  const [genderMatchingError, genderMatchingErrorSet] = useState(false)
  useEffect(() => {
    if (open) {
      formSet(initialForm())
      genderMatchingErrorSet(false)
    }
  }, [open])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if ($create.loading) return
    if (!form.genderMatching) {
      genderMatchingErrorSet(true)
      return
    }
    $create
      .fetch({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        genderMatching: form.genderMatching,
        termsAccepted: form.termsAccepted,
      })
      .then((user) => {
        toast.success(`${fullName(user)} created`)
        onCreated(user)
        onOpenChange(false)
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create user"
      description="Add an account on someone’s behalf."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={$create.loading}
            onClick={() => submit()}
          >
            Create user
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap={4}>
          <div className="fr-grid-2">
            <Field label="First name">
              <Input
                value={form.firstName}
                onChange={(e) => formSet({...form, firstName: e.target.value})}
                autoFocus
              />
            </Field>
            <Field label="Last name">
              <Input
                value={form.lastName}
                onChange={(e) => formSet({...form, lastName: e.target.value})}
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              leading={<Mail />}
              value={form.email}
              onChange={(e) => formSet({...form, email: e.target.value})}
            />
          </Field>
          <Field
            label="Gender matching"
            error={
              genderMatchingError ? 'Choose a gender matching.' : undefined
            }
          >
            <Select
              value={form.genderMatching ?? null}
              placeholder="Select gender matching"
              options={genderMatchingOptions}
              onValueChange={(v) => {
                if (isUserGenderMatching(v)) {
                  formSet({...form, genderMatching: v})
                  genderMatchingErrorSet(false)
                }
              }}
            />
          </Field>
          <Switch
            checked={form.termsAccepted}
            onCheckedChange={(v) => formSet({...form, termsAccepted: v})}
            label="T&Cs accepted"
            description="The user has agreed to the league terms and conditions."
            labelPosition="start"
          />
        </Stack>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
