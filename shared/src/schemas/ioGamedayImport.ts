import {io, TypeIoValue} from '@shared/torva'
import {ioSeason} from './ioSeason'

export const GAMEDAY_IMPORT_RUN_TRIGGERS = ['manual', 'scheduled'] as const
export const GAMEDAY_IMPORT_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const

export const ioGamedayImportConfig = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: ioSeason.shape.id,
  username: io.string().trim(),
  passwordEncrypted: io.string(),
  association: io.string().trim(),
  competition: io.string().trim(),
  scheduleEnabled: io.boolean(),
  scheduleStartOn: io.optional(io.date()),
  scheduleEndOn: io.optional(io.date()),
  lastScheduledRunKey: io.optional(io.string().trim()),
  scheduleLockedUntil: io.optional(io.date()),
  scheduleLockToken: io.optional(io.id()),
})

export type TGamedayImportConfig = TypeIoValue<typeof ioGamedayImportConfig>

export const ioGamedayImportConfigSafe = ioGamedayImportConfig
  .omit(['passwordEncrypted', 'scheduleLockToken'])
  .extend({
    hasPassword: io.boolean(),
  })

export type TGamedayImportConfigSafe = TypeIoValue<
  typeof ioGamedayImportConfigSafe
>

export const ioGamedayImportRun = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  configId: ioGamedayImportConfig.shape.id,
  seasonId: ioSeason.shape.id,
  trigger: io.enum([...GAMEDAY_IMPORT_RUN_TRIGGERS]),
  status: io.enum([...GAMEDAY_IMPORT_RUN_STATUSES]),
  association: io.string().trim(),
  competition: io.string().trim(),
  startedOn: io.date(),
  finishedOn: io.optional(io.date()),
  rowsImported: io.optional(io.number()),
  teamsCreated: io.optional(io.number()),
  usersCreated: io.optional(io.number()),
  membersCreated: io.optional(io.number()),
  note: io.optional(io.string().emptyok()),
  errorMessage: io.optional(io.string().emptyok()),
})

export type TGamedayImportRun = TypeIoValue<typeof ioGamedayImportRun>
