import {Button} from '@ui'

/**
 * TODO(conversion): port legacy MissingReportsControl. Self-contained: a button
 * that opens a dialog listing fixtures with teams that haven't reported.
 */
export function MissingReportsButton(_props: {
  seasonId: string
  label?: string
  size?: 'sm' | 'md'
}) {
  return <Button size={_props.size ?? 'sm'}>{_props.label ?? 'Missing reports'}</Button>
}
