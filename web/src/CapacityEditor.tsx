import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { updateWeeklyHours, type CapacityResponse, type Person } from './api'
import { Button } from '@/components/ui/button'

// Mirrors maxWeeklyHours in api/people.go.
const MAX_WEEKLY_HOURS = 168

type Props = {
  id: number
  name: string
  weeklyHours: number
}

// CapacityEditor edits one person's weekly hours in place. The draft only
// reaches the API when Confirm is pressed (or Enter); Escape discards it.
// Render it keyed by weeklyHours so the draft resets once the change lands.
export function CapacityEditor({ id, name, weeklyHours }: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(String(weeklyHours))
  const mutation = useMutation({
    mutationFn: (hours: number) => updateWeeklyHours(id, hours),
    // Allocations don't depend on capacity, so every cached range can take
    // the new value directly instead of refetching.
    onSuccess: (person) => {
      queryClient.setQueriesData<CapacityResponse>({ queryKey: ['capacity'] }, (data) =>
        data && patchPerson(data, person),
      )
    },
  })

  const hours = draft.trim() === '' ? NaN : Number(draft)
  const valid = Number.isFinite(hours) && hours >= 0 && hours <= MAX_WEEKLY_HOURS
  const changed = valid && hours !== weeklyHours
  const error = mutation.error?.message ?? (valid ? undefined : `Enter 0–${MAX_WEEKLY_HOURS} hours`)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (changed && !mutation.isPending) mutation.mutate(hours)
  }

  return (
    <form className="capacity-editor" onSubmit={submit}>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_WEEKLY_HOURS}
        step="any"
        value={draft}
        disabled={mutation.isPending}
        aria-label={`Weekly hours for ${name}`}
        aria-invalid={error !== undefined}
        title={error}
        onChange={(e) => {
          setDraft(e.target.value)
          mutation.reset()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(String(weeklyHours))
            mutation.reset()
          }
        }}
      />
      <span className="unit">h</span>
      <Button type="submit" size="xs" className="h-5" disabled={!changed || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Confirm'}
      </Button>
    </form>
  )
}

function patchPerson(data: CapacityResponse, person: Person): CapacityResponse {
  return {
    ...data,
    people: data.people.map((p) => (p.id === person.id ? { ...p, weeklyHours: person.weeklyHours } : p)),
  }
}
