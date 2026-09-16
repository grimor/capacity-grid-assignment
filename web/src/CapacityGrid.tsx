import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { useMemo, useState, type CSSProperties } from 'react'
import { capacityQuery, type CapacityResponse, type PersonCapacity } from './api'
import { type DateRange, formatLongDate, formatShortDate, isoWeek, startOfWeek, today } from './dates'
import { CapacityEditor } from './CapacityEditor'
import { RangeControls } from './RangeControls'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Props = {
  range: DateRange
  onRangeChange: (range: DateRange) => void
}

export function CapacityGrid({ range, onRangeChange }: Props) {
  const [overOnly, setOverOnly] = useState(false)
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useQuery({
    ...capacityQuery(range.from, range.to),
    placeholderData: keepPreviousData,
  })

  return (
    <section className="capacity">
      <RangeControls range={range} onChange={onRangeChange} />
      {error && (
        <div className="notice error" role="alert">
          Couldn't load capacity: {error.message}.{' '}
          <Button type="button" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}
      {isPending && !error && <p className="notice">Loading capacity…</p>}
      {data && (
        <CapacityTable
          data={data}
          overOnly={overOnly}
          onOverOnlyChange={setOverOnly}
          loading={isFetching}
          stale={isPlaceholderData}
        />
      )}
    </section>
  )
}

type TableProps = {
  data: CapacityResponse
  overOnly: boolean
  onOverOnlyChange: (overOnly: boolean) => void
  loading: boolean
  stale: boolean
}

// shadcn's Table supplies the semantic table parts; TanStack Table owns the
// dynamic columns and row model. A single table keeps the week headings aligned
// with all 500 people while its container scrolls in both directions.
const features = tableFeatures({})
const columnHelper = createColumnHelper<typeof features, PersonCapacity>()

function CapacityTable({ data, overOnly, onOverOnlyChange, loading, stale }: TableProps) {
  const { overPerWeek, overPeople } = useMemo(() => summarize(data), [data])
  const people = overOnly ? overPeople : data.people
  const currentWeek = data.weekStarts.indexOf(startOfWeek(today()))
  const weekIndex = useMemo(
    () => new Map(data.weekStarts.map((weekStart, index) => [weekStart, index])),
    [data.weekStarts],
  )
  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor('name', { header: 'Person' }),
      columnHelper.accessor('weeklyHours', {
        header: 'Capacity',
        cell: ({ row }) => {
          const { id, name, weeklyHours } = row.original
          return <CapacityEditor key={weeklyHours} id={id} name={name} weeklyHours={weeklyHours} />
        },
      }),
      ...data.weekStarts.map((weekStart, index) =>
        columnHelper.display({
          id: weekStart,
          header: () => (
            <>
              <span className="week-date">{formatShortDate(weekStart)}</span>
              <span className="week-number">W{isoWeek(weekStart)}</span>
              {overPerWeek[index] > 0 && <span className="week-over">{overPerWeek[index]} over</span>}
            </>
          ),
          cell: ({ row }) => {
            const allocated = row.original.weeks[index].allocatedHours
            const capacity = row.original.weeklyHours
            return (
              <>
                {hours.format(allocated)}
                {isOver(allocated, capacity) && (
                  <span className="excess">+{hours.format(allocated - capacity)}</span>
                )}
              </>
            )
          },
        }),
      ),
    ]),
    [data.weekStarts, overPerWeek],
  )
  const table = useTable({ features, data: people, columns, getRowId: (person) => String(person.id) })

  return (
    <>
      <div className="summary">
        <span>
          {data.weekStarts.length} {plural(data.weekStarts.length, 'week')} ·{' '}
          {data.people.length} {plural(data.people.length, 'person', 'people')} ·{' '}
          <strong className={overPeople.length > 0 ? 'over-count' : undefined}>
            {overPeople.length} over-allocated
          </strong>
        </span>
        <label>
          <input type="checkbox" checked={overOnly} onChange={(e) => onOverOnlyChange(e.target.checked)} />
          Only over-allocated
        </label>
        {loading && <span className="loading">Updating…</span>}
      </div>
      <div className={stale ? 'grid-scroll stale' : 'grid-scroll'} aria-busy={loading}>
        <Table className="capacity-table">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const index = weekIndex.get(header.column.id)
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      className={index === undefined
                        ? header.column.id === 'name' ? 'person' : 'capacity-hours'
                        : index === currentWeek ? 'week current' : 'week'}
                      title={index === undefined ? undefined
                        : `Week ${isoWeek(header.column.id)}, starting ${formatLongDate(header.column.id)}`}
                    >
                      {!header.isPlaceholder && <table.FlexRender header={header} />}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => {
                  const index = weekIndex.get(cell.column.id)
                  if (cell.column.id === 'name') {
                    return (
                      <TableHead key={cell.id} scope="row" className="person" title={row.original.name}>
                        <table.FlexRender cell={cell} />
                      </TableHead>
                    )
                  }
                  if (index === undefined) {
                    return (
                      <TableCell key={cell.id} className="capacity-hours">
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    )
                  }
                  const week = row.original.weeks[index]
                  const allocated = week.allocatedHours
                  const capacity = row.original.weeklyHours
                  const over = isOver(allocated, capacity)
                  const load = capacity > 0 ? Math.min(allocated / capacity, 1) : allocated > 0 ? 1 : 0
                  const className = ['allocation', over && 'over', allocated === 0 && 'empty', index === currentWeek && 'current']
                    .filter(Boolean).join(' ')
                  const title = `Week of ${formatLongDate(week.weekStart)}: ${hours.format(allocated)} h allocated of ${hours.format(capacity)} h${over ? ` (${hours.format(allocated - capacity)} h over)` : ''}`
                  return (
                    <TableCell key={cell.id} className={className} style={{ '--load': load } as CSSProperties} title={title}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {people.length === 0 && (
        <p className="notice">
          {overOnly ? 'Nobody is over-allocated in these weeks.' : 'There is nobody on the team yet.'}
        </p>
      )}
    </>
  )
}

const hours = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

function isOver(allocated: number, capacity: number): boolean {
  return allocated > capacity
}

function summarize(data: CapacityResponse) {
  const overPerWeek = data.weekStarts.map(() => 0)
  const overPeople: PersonCapacity[] = []
  for (const person of data.people) {
    let over = false
    person.weeks.forEach((week, i) => {
      if (isOver(week.allocatedHours, person.weeklyHours)) {
        overPerWeek[i]++
        over = true
      }
    })
    if (over) overPeople.push(person)
  }
  return { overPerWeek, overPeople }
}

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many
}
