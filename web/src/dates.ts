// Dates are ISO calendar dates ("2026-01-05") throughout, as the API sends
// them, so they compare correctly as strings. Arithmetic runs on UTC
// midnights, so the viewer's time zone and DST changes never shift a day.

export type DateRange = { from: string; to: string }

// MAX_WEEKS mirrors maxWeeks in api/capacity.go: the most weeks one request
// may cover.
export const MAX_WEEKS = 54

const DAY_MS = 24 * 60 * 60 * 1000

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Whether value is a complete date that the helpers here can work with. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parse(value).getTime())
}

/** Today in the viewer's time zone. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(date: string, days: number): string {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return format(d)
}

function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS)
}

/** The Monday on or before date. */
export function startOfWeek(date: string): string {
  // getUTCDay counts from Sunday = 0; shift so Monday = 0.
  return addDays(date, -((parse(date).getUTCDay() + 6) % 7))
}

/** The Sunday on or after date. */
export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6)
}

/** The ISO 8601 week number: week 1 is the week holding the year's first Thursday. */
export function isoWeek(date: string): number {
  const thursday = parse(addDays(startOfWeek(date), 3))
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1
}

/** Widens a range to whole weeks, Monday to Sunday, as the API does. */
export function wholeWeeks(from: string, to: string): DateRange {
  return { from: startOfWeek(from), to: endOfWeek(to) }
}

export function shiftWeeks(range: DateRange, weeks: number): DateRange {
  return { from: addDays(range.from, 7 * weeks), to: addDays(range.to, 7 * weeks) }
}

/** Moves range to start on from, keeping its length. */
export function moveRange(range: DateRange, from: string): DateRange {
  return { from, to: addDays(from, daysBetween(range.from, range.to)) }
}

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

/** "29 Dec", in the viewer's locale. */
export function formatShortDate(date: string): string {
  return shortDate.format(parse(date))
}

/** "29 Dec 2025", in the viewer's locale. */
export function formatLongDate(date: string): string {
  return longDate.format(parse(date))
}
