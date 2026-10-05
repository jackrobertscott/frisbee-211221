import {RequestHandler} from 'micro'
import Feature from './Feature'
import Member from './Member'
import Report from './Report'
import Fixture from './Fixture'
import Season from './Season'
import Security from './Security'
import Team from './Team'
import User from './User'
import Port from './Port'

export default new Map<string, RequestHandler>([
  ...Feature.entries(),
  ...Fixture.entries(),
  ...Member.entries(),
  ...Port.entries(),
  ...Report.entries(),
  ...Season.entries(),
  ...Security.entries(),
  ...Team.entries(),
  ...User.entries(),
])
