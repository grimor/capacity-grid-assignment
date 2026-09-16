import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { DateRange as PickerRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  type DateRange,
  MAX_WEEKS,
  addDays,
  formatLongDate,
  moveRange,
  shiftWeeks,
  startOfWeek,
  today,
  wholeWeeks,
} from './dates'

type Props = {
  range: DateRange
  onChange: (range: DateRange) => void
}

// Every applied range covers whole weeks, Monday through Sunday.
export function RangeControls({ range, onChange }: Props) {
  const thisMonday = startOfWeek(today())

  return (
    <div className="range-controls">
      <div className="week-nav" role="group" aria-label="Move by week">
        <Button type="button" variant="outline" onClick={() => onChange(shiftWeeks(range, -1))}>
          ← Previous week
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(moveRange(range, thisMonday))}
          disabled={range.from === thisMonday}
        >
          This week
        </Button>
        <Button type="button" variant="outline" onClick={() => onChange(shiftWeeks(range, 1))}>
          Next week →
        </Button>
      </div>
      {/* Reset the draft when navigation changes the displayed range. */}
      <RangePicker key={`${range.from}/${range.to}`} range={range} onChange={onChange} />
    </div>
  )
}

function RangePicker({ range, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PickerRange | undefined>({
    from: toLocalDate(range.from),
    to: toLocalDate(range.to),
  })
  const from = selected?.from && toISODate(selected.from)
  const to = selected?.to && toISODate(selected.to)
  const valid = Boolean(from && to && to >= from && to <= addDays(startOfWeek(from), 7 * MAX_WEEKS - 1))

  function applyRange() {
    if (!from || !to || !valid) return
    onChange(wholeWeeks(from, to))
    setOpen(false)
  }

  function selectDay(_range: PickerRange | undefined, day: Date) {
    // A complete range means the next click starts a fresh selection. This
    // also lets a manager start inside the range currently being shown.
    setSelected((current) => {
      if (!current?.from || current.to || day < current.from) return { from: day, to: undefined }
      return { from: current.from, to: day }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label="Choose date range">
          <CalendarDays aria-hidden="true" />
          {formatLongDate(range.from)} – {formatLongDate(range.to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={toLocalDate(range.from)}
          selected={selected}
          onSelect={selectDay}
        />
        <div className="date-picker-actions">
          <span className="hint" role="status">
            {!selected?.from || !selected?.to
              ? 'Select a start and end date.'
              : valid
                ? `Whole weeks, up to ${MAX_WEEKS}.`
                : `Choose at most ${MAX_WEEKS} weeks.`}
          </span>
          <Button type="button" onClick={applyRange} disabled={!valid}>
            Show
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// DayPicker uses local calendar dates; keep those separate from the API's UTC
// ISO strings so a viewer's time zone never moves a selected day.
function toLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toISODate(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
