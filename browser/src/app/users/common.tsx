import {TUserGender, USER_GENDERS} from '@shared/schemas/ioUserGender'
import {ConfirmDialog, type ButtonVariant, type ConfirmDialogProps} from '@ui'
import {useRef} from 'react'
import {GENDER_OPTIONS} from '../../utils/constants'

export const genderOptions = GENDER_OPTIONS.map((g) => ({
  value: g.key,
  label: g.label,
}))

export const genderLabel = (gender: TUserGender) =>
  GENDER_OPTIONS.find((g) => g.key === gender)?.label ?? gender

export const isUserGender = (value: string | null): value is TUserGender =>
  USER_GENDERS.some((g) => g === value)

/**
 * ConfirmDialog for endpoint actions: stays open (with the endpoint's error
 * toast) when the action fails, closes when it succeeds.
 */
export function ActionConfirm({
  action,
  onOpenChange,
  confirmVariant = 'primary',
  ...rest
}: Omit<ConfirmDialogProps, 'onConfirm' | 'confirmVariant'> & {
  action: () => Promise<unknown>
  confirmVariant?: ButtonVariant
}) {
  const failed = useRef(false)
  return (
    <ConfirmDialog
      {...rest}
      confirmVariant={confirmVariant}
      onOpenChange={(open) => {
        if (!open && failed.current) {
          failed.current = false
          return
        }
        onOpenChange(open)
      }}
      onConfirm={() =>
        action()
          .then(() => undefined)
          .catch(() => {
            failed.current = true
          })
      }
    />
  )
}
