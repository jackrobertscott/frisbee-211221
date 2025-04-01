import {ioPost} from '@shared/schemas/ioPost'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

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
  path: '/PostUpdate',
  payload: io.object({
    postId: io.string(),
    title: io.string(),
    content: io.string(),
  }),
  result: ioPost,
} satisfies TEndpointDef

export const PostDeleteDef = {
  path: '/PostDelete',
  payload: io.object({
    postId: io.string(),
  }),
} satisfies TEndpointDef