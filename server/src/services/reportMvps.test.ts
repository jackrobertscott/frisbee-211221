import {TUser} from '@shared/schemas/ioUser'
import {describe, expect, it} from 'vitest'
import {collectMvpUserIds, dropIneligibleMvps} from './reportMvps'

describe('collectMvpUserIds', () => {
  it('returns the non-empty picks', () => {
    expect(
      collectMvpUserIds({
        mvpMale: 'M1',
        mvpMale2: '',
        mvpFemale: undefined,
        mvpFemale2: 'F2',
      }),
    ).toEqual(['M1', 'F2'])
    expect(collectMvpUserIds({})).toEqual([])
  })
})

describe('dropIneligibleMvps', () => {
  const users = new Map<string, Pick<TUser, 'gender'>>([
    ['man', {gender: 'male'}],
    ['woman', {gender: 'female'}],
  ])

  it('keeps eligible picks and picks for unknown users', () => {
    expect(
      dropIneligibleMvps(
        {mvpMale: 'man', mvpMale2: 'ghost', mvpFemale: 'woman'},
        users,
      ),
    ).toEqual({
      mvpMale: 'man',
      mvpMale2: 'ghost',
      mvpFemale: 'woman',
      mvpFemale2: undefined,
    })
  })

  it('clears picks in the wrong gender slot and empty picks', () => {
    expect(
      dropIneligibleMvps(
        {mvpMale: 'woman', mvpMale2: '', mvpFemale: 'man', mvpFemale2: 'woman'},
        users,
      ),
    ).toEqual({
      mvpMale: undefined,
      mvpMale2: undefined,
      mvpFemale: undefined,
      mvpFemale2: 'woman',
    })
  })
})
