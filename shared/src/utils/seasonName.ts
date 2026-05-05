export const seasonNameCollation = {
  locale: 'en',
  numericOrdering: true,
  strength: 1 as const,
}

const SEASON_NAME_COLLATOR = new Intl.Collator(seasonNameCollation.locale, {
  numeric: true,
  sensitivity: 'base',
})

export const compareSeasonNames = (left: unknown, right: unknown) =>
  SEASON_NAME_COLLATOR.compare(String(left ?? ''), String(right ?? ''))
