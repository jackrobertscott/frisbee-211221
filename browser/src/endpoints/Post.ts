import {PostCreateDef, PostDeleteDef, PostListDef, PostUpdateDef} from '@shared/endpoints/PostDef'
import {createEndpoint} from '../utils/endpoints'

export const $PostList = createEndpoint(PostListDef)

export const $PostCreate = createEndpoint(PostCreateDef)

export const $PostUpdate = createEndpoint(PostUpdateDef)

export const $PostDelete = createEndpoint(PostDeleteDef)