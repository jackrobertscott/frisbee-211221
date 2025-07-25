import { GameDayUser, GameDayTeam, GameDayRegistration } from './gameday'
import { TUser } from '@shared/schemas/ioUser'
import { TTeam } from '@shared/schemas/ioTeam'
import { TMember } from '@shared/schemas/ioMember'
import { userEmail } from '../endpoints/userEmail'

/**
 * Map GameDay User to internal User schema
 */
export const mapGameDayUserToInternal = (gdUser: GameDayUser): Omit<TUser, 'id' | 'createdOn' | 'updatedOn'> => {
  return {
    firstName: gdUser.firstName,
    lastName: gdUser.lastName,
    gender: determineGenderFromData(gdUser),
    emails: [userEmail.create(gdUser.email, true)],
    termsAccepted: false, // Default for synced users
    avatarUrl: undefined,
    bio: undefined,
    admin: false,
    gamedayId: gdUser.id, // Track GameDay ID for future syncs
    userMergedIds: undefined,
    isMock: false,
    password: undefined,
    email: null,
    lastSeasonId: undefined,
  }
}

/**
 * Map GameDay Team to internal Team schema
 */
export const mapGameDayTeamToInternal = (gdTeam: GameDayTeam, seasonId: string): Omit<TTeam, 'id' | 'createdOn' | 'updatedOn'> => {
  return {
    seasonId,
    name: gdTeam.name,
    color: 'hsla(0, 0%, 100%, 1)', // Default color, preserve existing if team exists
    division: parseDivisionFromGameDay(gdTeam),
    phone: undefined, // GameDay doesn't provide this
    email: undefined, // GameDay doesn't provide this
    gamedayId: gdTeam.id, // Track GameDay ID for future syncs
    grade: gdTeam.grade,
    ageGroup: gdTeam.ageGroup,
    shortName: gdTeam.shortName,
    isMock: false,
  }
}

/**
 * Map GameDay Registration to internal Member schema
 */
export const mapGameDayRegistrationToMember = (
  registration: GameDayRegistration,
  userId: string,
  teamId: string,
  seasonId: string
): Omit<TMember, 'id' | 'createdOn' | 'updatedOn'> => {
  return {
    seasonId,
    teamId,
    userId,
    captain: registration.role === 'coach', // Map coaches to captains
    pending: registration.status !== 'active',
    gamedayRegistrationId: registration.id, // Track GameDay registration ID
    isMock: false,
  }
}

/**
 * Determine gender from GameDay user data
 * This is a helper function to map any gender information from GameDay
 */
function determineGenderFromData(gdUser: GameDayUser): string {
  // GameDay might not provide gender, so we'll default to empty string
  // This can be enhanced based on actual GameDay response structure
  return ''
}

/**
 * Parse division from GameDay team data
 */
function parseDivisionFromGameDay(gdTeam: GameDayTeam): number {
  if (gdTeam.division) {
    const div = parseInt(gdTeam.division)
    if (!isNaN(div)) return div
  }
  // Try to parse from grade or other fields
  if (gdTeam.grade) {
    const gradeDiv = parseInt(gdTeam.grade)
    if (!isNaN(gradeDiv)) return gradeDiv
  }
  return 1 // Default division
}

/**
 * Update existing user with GameDay data
 * Merges GameDay data with existing user while preserving local preferences
 */
export const updateUserWithGameDayData = (existingUser: TUser, gdUser: GameDayUser): Partial<TUser> => {
  const updates: Partial<TUser> = {}
  
  // Update basic info if it's different
  if (existingUser.firstName !== gdUser.firstName) {
    updates.firstName = gdUser.firstName
  }
  
  if (existingUser.lastName !== gdUser.lastName) {
    updates.lastName = gdUser.lastName
  }
  
  // Update GameDay ID for tracking
  if (existingUser.gamedayId !== gdUser.id) {
    updates.gamedayId = gdUser.id
  }
  
  // Merge email addresses - add GameDay email if not present
  const existingEmails = existingUser.emails?.map(e => e.value.toLowerCase()) || []
  if (!existingEmails.includes(gdUser.email.toLowerCase())) {
    const newEmails = [...(existingUser.emails || []), userEmail.create(gdUser.email, false)]
    updates.emails = newEmails
  }
  
  return updates
}

/**
 * Update existing team with GameDay data
 * Updates team information while preserving local settings like colors
 */
export const updateTeamWithGameDayData = (existingTeam: TTeam, gdTeam: GameDayTeam): Partial<TTeam> => {
  const updates: Partial<TTeam> = {}
  
  // Update name if different
  if (existingTeam.name !== gdTeam.name) {
    updates.name = gdTeam.name
  }
  
  // Update division
  const newDivision = parseDivisionFromGameDay(gdTeam)
  if (existingTeam.division !== newDivision) {
    updates.division = newDivision
  }
  
  // Update GameDay-specific fields
  if (existingTeam.gamedayId !== gdTeam.id) {
    updates.gamedayId = gdTeam.id
  }
  
  if (existingTeam.grade !== gdTeam.grade) {
    updates.grade = gdTeam.grade
  }
  
  if (existingTeam.ageGroup !== gdTeam.ageGroup) {
    updates.ageGroup = gdTeam.ageGroup
  }
  
  if (existingTeam.shortName !== gdTeam.shortName) {
    updates.shortName = gdTeam.shortName
  }
  
  return updates
}

/**
 * Normalize team name for matching
 */
export const normalizeTeamName = (name: string): string => {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Normalize email for matching
 */
export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim()
}