import {TUser, TUserPublic} from '@shared/schemas/ioUser'
import {objectify} from '../utils/objectify'
/**
 *
 */
export const selectPublicUserFields = (user: TUser): TUserPublic => {
  return objectify.pick(user, [
    'id',
    'createdOn',
    'updatedOn',
    'firstName',
    'lastName',
    'gender',
    'avatarUrl',
  ])
}
