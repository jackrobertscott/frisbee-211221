import {TUserGender} from '@shared/schemas/ioUserGender'

export const GENDER_OPTIONS: Array<{
  key: TUserGender
  label: string
}> = [
  {key: 'male', label: 'Male'},
  {key: 'female', label: 'Female'},
  {key: 'non-binary', label: 'Non-Binary'},
  {key: 'other', label: 'Other'},
]

export const SPIRIT_OPTIONS: Array<{
  key: string
  label: string
}> = [
  {
    key: '4',
    label: `4: This team was god-tier in their attitudes on and off the field.`,
  },
  {
    key: '3',
    label: `3: They upheld the truth of a situation even if it didn't benefit them, or displayed advanced rules knowledge.`,
  },
  {
    key: '2',
    label: `2: They were fair minded, and had sufficient rules knowledge.`,
  },
  {
    key: '1',
    label: `1: They were somewhat fair minded, or didn't have a good rules knowledge.`,
  },
  {
    key: '0',
    label: `0: They were not fair minded, or did not know the rules, or were not willing to communicate.`,
  },
]

// Spirit Category Options for Official Scoring
export const SPIRIT_CATEGORY_OPTIONS: Array<{
  key: string
  label: string
}> = [
  {key: '4', label: '4. Legendary'},
  {key: '3', label: '3. Great'},
  {key: '2', label: '2. Average'},
  {key: '1', label: '1. Poor'},
  {key: '0', label: '0. Terrible'},
]

// Spirit Category Descriptions for Official Scoring
export const SPIRIT_CATEGORY_DESCRIPTIONS = {
  spiritP1: {
    title: 'Rules Knowledge and Use',
    description:
      'Knowledge of the rules, avoiding intentional infractions, unnecessary stoppages, and explaining the rules',
  },
  spiritP2: {
    title: 'Fouls and Body Contact',
    description:
      'Avoiding body contact, dangerous plays, and unnecessary fouls',
  },
  spiritP3: {
    title: 'Fair-Mindedness',
    description:
      "Fair-minded attitude, self-calls, and respect for opponent's calls",
  },
  spiritP4: {
    title: 'Attitude and Self-Control',
    description:
      'Positive attitude, avoiding emotional reactions, and appropriate celebration',
  },
  spiritP5: {
    title: 'Communication',
    description:
      'Good communication, respectful discussions, and avoiding inflammatory remarks',
  },
}
