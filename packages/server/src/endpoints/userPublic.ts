import {TUser, TUserPublic} from '../../../shared/src/schemas/ioUser'
import {objectify} from '../utils/objectify'
/**
 *
 */
export const userPublic = (user: TUser): TUserPublic => {
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
