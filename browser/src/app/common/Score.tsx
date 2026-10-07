import {Text} from '@ui'

/** A game's score, "13 – 9" with the winner bolded, or a dash before it's played. */
export function Score({a, b}: {a?: number; b?: number}) {
  if (typeof a !== 'number' || typeof b !== 'number')
    return (
      <Text as="span" size="sm" tone="tertiary">
        –
      </Text>
    )
  return (
    <span className="fr-score">
      <b data-win={a > b || undefined}>{a}</b>
      <span>–</span>
      <b data-win={b > a || undefined}>{b}</b>
    </span>
  )
}
