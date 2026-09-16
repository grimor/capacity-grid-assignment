import { useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { wholeWeeks } from './dates'

// The range the grid opens on: the weeks around the seed's worked examples.
const INITIAL_RANGE = wholeWeeks('2025-12-29', '2026-01-16')

export function App() {
  // The page owns the range, so the logged-time timeline that will sit
  // alongside the grid can follow the same weeks.
  const [range, setRange] = useState(INITIAL_RANGE)

  return (
    <main>
      <h1>Team capacity</h1>
      <CapacityGrid range={range} onRangeChange={setRange} />
    </main>
  )
}
