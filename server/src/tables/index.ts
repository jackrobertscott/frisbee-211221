import {$AuthAttemptLimit} from './$AuthAttemptLimit'
import {$Fixture} from './$Fixture'
import {$GamedayImportConfig} from './$GamedayImportConfig'
import {$GamedayImportRun} from './$GamedayImportRun'
import {$Member} from './$Member'
import {$Report} from './$Report'
import {$Season} from './$Season'
import {$Session} from './$Session'
import {$Team} from './$Team'
import {$User} from './$User'

/** Every table, for startup work that applies to all collections. */
export const allTables = [
  $AuthAttemptLimit,
  $Fixture,
  $GamedayImportConfig,
  $GamedayImportRun,
  $Member,
  $Report,
  $Season,
  $Session,
  $Team,
  $User,
]
