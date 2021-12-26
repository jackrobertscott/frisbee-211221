import {RequestHandler} from 'micro'
import Comment from './Comment'
import Member from './Member'
import Post from './Post'
import Season from './Season'
import Security from './Security'
import Team from './Team'
import User from './User'
/**
 *
 */
export default new Map<string, RequestHandler>([
  ...Comment.entries(),
  ...Member.entries(),
  ...Post.entries(),
  ...Season.entries(),
  ...Security.entries(),
  ...Team.entries(),
  ...User.entries(),
])
