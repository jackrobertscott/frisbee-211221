import {authPoint} from '@shared/auth/authAccess'
import {ioPost} from '@shared/schemas/ioPost'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const PostListDef = {
  path: '/PostList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
    limit: io.optional(io.number()),
  }),
  result: io.object({
    posts: io.array(ioPost),
    users: io.array(ioUserPublic),
  }),
} satisfies TEndpointDef

export const PostCreateDef = {
  access: authPoint.postWrite,
  path: '/PostCreate',
  payload: ioPost
    .pick(['seasonId', 'title', 'content'])
    .extend({sendEmail: io.optional(io.boolean())}),
  result: ioPost,
} satisfies TEndpointDef

export const PostUpdateDef = {
  access: authPoint.postWrite,
  path: '/PostUpdate',
  payload: ioPost
    .pick(['title', 'content'])
    .extend({postId: ioPost.shape.id}),
  result: ioPost,
} satisfies TEndpointDef

export const PostDeleteDef = {
  access: authPoint.postWrite,
  path: '/PostDelete',
  payload: io.object({
    postId: ioPost.shape.id,
  }),
} satisfies TEndpointDef
