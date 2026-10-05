import {ConfirmDialog, type ButtonVariant, type ConfirmDialogProps} from '@ui'

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
  return (
    <ConfirmDialog
      {...rest}
      confirmVariant={confirmVariant}
      onOpenChange={onOpenChange}
      onConfirm={() => action().then(() => undefined)}
    />
  )
}
