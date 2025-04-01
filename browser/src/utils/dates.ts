/**
 *
 */
export const DATETIME_PERIOD = ['AM', 'PM']
/**
 *
 */
export const DATETIME_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
/**
 *
 */
export const DATETIME_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
/**
 *
 */
export const DATETIME_YEARS = new Array(100)
  .fill(0)
  .map((_, index) => (new Date().getFullYear() + 3 - index).toString())
