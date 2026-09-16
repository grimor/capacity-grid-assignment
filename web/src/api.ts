import { queryOptions } from '@tanstack/react-query'

// CapacityResponse mirrors capacityResponse in api/capacity.go.
export type CapacityResponse = {
  /** The Monday on or before the requested from. */
  from: string
  /** The Sunday on or after the requested to. */
  to: string
  /** The Monday of each week in the range, ascending. */
  weekStarts: string[]
  people: PersonCapacity[]
}

export type PersonCapacity = {
  id: number
  name: string
  /** Capacity in every week of the range. */
  weeklyHours: number
  /** One entry per weekStarts, in the same order. */
  weeks: WeekAllocation[]
}

export type WeekAllocation = {
  weekStart: string
  allocatedHours: number
}

/** An error response from the API, carrying its user-facing message. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function getJSON<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res))
  }
  return (await res.json()) as T
}

// errorMessage reads the API's {"error": "..."} body, falling back to the
// status for anything else (e.g. the dev proxy failing to reach the API).
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error
    }
  } catch {
    // Not JSON; use the fallback.
  }
  return `request failed with status ${res.status}`
}

// Every capacity query key starts with 'capacity', so a change to a person
// can reach all cached ranges at once.
export function capacityQuery(from: string, to: string) {
  return queryOptions({
    queryKey: ['capacity', { from, to }],
    queryFn: ({ signal }) =>
      getJSON<CapacityResponse>(`/api/capacity?${new URLSearchParams({ from, to })}`, signal),
  })
}

// Person mirrors personResponse in api/people.go.
export type Person = {
  id: number
  name: string
  weeklyHours: number
}

export async function updateWeeklyHours(id: number, weeklyHours: number): Promise<Person> {
  const res = await fetch(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res))
  }
  return (await res.json()) as Person
}
