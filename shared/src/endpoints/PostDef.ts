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
  payload: io.object({
    seasonId: io.optional(io.string()),
    title: io.string(),
    content: io.string(),
    sendEmail: io.optional(io.boolean()),
  }),
  result: ioPost,
} satisfies TEndpointDef

export const PostUpdateDef = {
  access: authPoint.postWrite,
  path: '/PostUpdate',
  payload: io.object({
    postId: io.string(),
    title: io.string(),
    content: io.string(),
  }),
  result: ioPost,
} satisfies TEndpointDef

export const PostDeleteDef = {
  access: authPoint.postWrite,
  path: '/PostDelete',
  payload: io.object({
    postId: io.string(),
  }),
} satisfies TEndpointDef
