import {RequestHandler} from 'micro'
import Comment from './Comment'
import Member from './Member'
import Post from './Post'
import Report from './Report'
import Fixture from './Fixture'
import Season from './Season'
import Security from './Security'
import Team from './Team'
import User from './User'
import Port from './Port'
/**
 *
 */
export default new Map<string, RequestHandler>([
  ...Comment.entries(),
  ...Fixture.entries(),
  ...Member.entries(),
  ...Port.entries(),
  ...Post.entries(),
  ...Report.entries(),
  ...Season.entries(),
  ...Security.entries(),
  ...Team.entries(),
  ...User.entries(),
])
