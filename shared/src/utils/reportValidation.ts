export type OfficialSpiritFields = {
  spiritComment: string
  spiritP1?: number
  spiritP2?: number
  spiritP3?: number
  spiritP4?: number
  spiritP5?: number
}

export const OFFICIAL_SPIRIT_COMMENT_MIN_TOTAL = 9
export const OFFICIAL_SPIRIT_COMMENT_MAX_TOTAL = 11

export function getOfficialSpiritScoreTotal({
  spiritP1,
  spiritP2,
  spiritP3,
  spiritP4,
  spiritP5,
}: Omit<OfficialSpiritFields, 'spiritComment'>): number | undefined {
  if (
    spiritP1 === undefined ||
    spiritP2 === undefined ||
    spiritP3 === undefined ||
    spiritP4 === undefined ||
    spiritP5 === undefined
  ) {
    return undefined
  }

  return spiritP1 + spiritP2 + spiritP3 + spiritP4 + spiritP5
}

export function officialSpiritCommentRequired(
  formData: Omit<OfficialSpiritFields, 'spiritComment'>
): boolean {
  const total = getOfficialSpiritScoreTotal(formData)

  return (
    total !== undefined &&
    (total < OFFICIAL_SPIRIT_COMMENT_MIN_TOTAL ||
      total > OFFICIAL_SPIRIT_COMMENT_MAX_TOTAL)
  )
}

export function hasSpiritComment(comment: string): boolean {
  return comment.trim().length > 0
}

export function validateOfficialSpiritComment(
  formData: OfficialSpiritFields
): string | undefined {
  if (
    officialSpiritCommentRequired(formData) &&
    !hasSpiritComment(formData.spiritComment)
  ) {
    return 'A comment is required when the total spirit score is below 9 or above 11.'
  }

  return undefined
}
