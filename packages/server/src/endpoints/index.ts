import {RequestHandler} from 'micro'
import Member from './Member'
import Season from './Season'
import Security from './Security'
import Team from './Team'
import User from './User'
/**
 *
 */
export default new Map<string, RequestHandler>([
  ...Member.entries(),
  ...Season.entries(),
  ...Security.entries(),
  ...Team.entries(),
  ...User.entries(),
])
