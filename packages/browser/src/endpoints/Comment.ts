import {
  CommentCreateDef,
  CommentDeleteDef,
  CommentListOfPostDef,
  CommentUpdateDef,
} from '@shared/endpoints/CommentDef'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $CommentListOfPost = createEndpoint(CommentListOfPostDef)
/**
 *
 */
export const $CommentCreate = createEndpoint(CommentCreateDef)
/**
 *
 */
export const $CommentUpdate = createEndpoint(CommentUpdateDef)
/**
 *
 */
export const $CommentDelete = createEndpoint(CommentDeleteDef)
