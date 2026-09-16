# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## 2026-09-16 — GET /api/capacity

- **`hours_per_day` is real hours, split across rows.** The values (0.125–1.0) look like fractions, and 117k of 126k rows look like duplicates. Git history shows the old seed used 2/4/6/8 h. The snapshot splits each assignment into 15 rows (14 × H/16 + 1 × H/8) that add up to exactly H; checked for all 8,413 (person, project, start, end) groups. So the query sums every row. `DISTINCT` or treating the values as fractions would both give wrong numbers.
- **Only Mon–Fri count.** An assignment adds `hours_per_day` for each weekday it covers. This matches the scenario rows: Ana's Mon–Sun 8h assignment comes to exactly 40/40, and Bo's Fri–Mon one gives 8h to each week. Holidays and time off are ignored (no data), so 2026-01-01 counts as a working day.
- **Weeks start on Monday, and the requested range is widened to whole weeks.** `from`/`to` in the response are the range actually covered, and `weekStarts` lists the columns. Widening seemed better than prorating capacity for partial weeks, which would confuse the grid.
- **Capacity is `people[].weeklyHours`, not repeated in every week.** The schema has one value per person, and it's the field PATCH edits, so after an edit the client replaces one number and every cell is right again. If per-week capacity arrives later (time off), add `capacityHours` to each week — it doesn't break existing clients.
- **Responses hold raw hours only, nothing derived.** "Over-allocated" is `allocatedHours > weeklyHours`; the grid decides how to show it. Eli has 0 capacity and 20h allocated, so there's no utilisation % to compute.
- **Range capped at 54 weeks** (any calendar year once widened). A full year is ~1.26 MB and ~100 ms. No gzip or pagination of the 500 people yet.
- **Tried first:** expanding assignments into days with `generate_series` and joining on the date — 600 ms for 3 weeks. Computing each week's Mon–Fri overlap directly: 6 ms for 3 weeks, 90 ms for 54.
- **Verified:** the API output matched the day-expansion query on all 27,000 cells for 2025-12-29..2027-01-10. The default range gives Ana 40/0/30, Bo 0/32/8, Cem 0/4/12, Dee 0/45/40 (over), Eli 0/20/0 against 0 capacity (over). Every bad input returns a 400 with `{"error": …}`. The 500 path was not triggered live (would need the DB stopped).
- **People are sorted by name with ICU root collation** (`und-x-icu`), so accented and non-Latin names sort sensibly. Ties are broken by id.
- **Open question:** `weekly_hours` has no history, so a PATCH will also change capacity for past weeks.

## 2026-09-16 — CapacityGrid

- **The range lives in `App`, and the grid is a controlled component** (`range` + `onRangeChange`). The logged-time timeline planned for the same page will need to show the same weeks. The range isn't in the URL yet, so a reload goes back to the default.
- **The client also widens ranges to whole weeks** (Mon–Sun), even though the API already does. This way the date fields always show the weeks on screen, and Wed–Thu and Mon–Sun of the same week share one cache entry. `MAX_WEEKS` = 54 is copied from `api/capacity.go`, so change both together.
- **Picked dates apply on "Show", not on every change.** Applying on change fired a request per keystroke while typing a date, and snapped the field to Monday mid-typing. The "To" field's `min`/`max` make the browser block backwards or over-long ranges.
- **The grid still opens on the seed's worked-example weeks** (29 Dec – 18 Jan), not today. "This week" jumps to the current week and keeps the range length.
- **Query key is `['capacity', {from, to}]`.** The shared `'capacity'` prefix lets the PATCH step reach every cached range. `keepPreviousData` keeps the old weeks on screen, dimmed, while the next ones load. `staleTime` is 30 s, so stepping back and forth doesn't refetch. 4xx responses aren't retried. If a new range fails, the grid is hidden rather than showing the wrong weeks.
- **Capacity is shown once per row, in its own column**, which is where the edit field will go. A cell counts as over only when allocated > capacity; exactly full isn't flagged. The bar under each cell shows how full the week is, capped at 100%. Any hours against 0 capacity show a full bar.
- **Something odd in the data:** the whole team runs in a 3-week cycle. Total allocation is ≈7.5k h, then ≈3.4k h, then 0 h (W3, W6, W9, …). The only exceptions are the five example people, who have 90 h in W3. The per-week totals from the API show the same pattern, so the data causes it, not the grid. I left it as is.
- **Verified in headless Chromium 147:**
  - The example rows match the API check: Ana 40/0/30, Bo 0/32/8, Cem 0/4/12, Dee 45 (+5), Eli 20 (+20 against 0).
  - Previous/next/this week work, and a picked Wed–Wed range widens to whole weeks.
  - Backwards and 55-week ranges are blocked.
  - A full year (26,500 cells) takes ≈1.1 s to show in the dev build. "Only over-allocated" leaves 178 rows.
  - A 400 fails at once. A 502 is retried twice and then shown.
  - Dark mode, and sticky header/columns while scrolling.
- **Dead end:** the machine's `google-chrome` is 113. It doesn't support `light-dark()`, and it makes `color-mix(currentColor)` in `color` transparent, so the grid showed no colours. The styles need Chrome 123+, Firefox 120+ or Safari 17.5+.
- **Dead end:** row lines in the sticky columns drifted out of line with the rest of the grid. Fractional row heights (`0.4rem` padding) round differently on the sticky layer. Padding and line height are now whole pixels, and every body row is 33 px.
- **Dev only:** under StrictMode, the first `/api/capacity` request shows as `ERR_ABORTED`. The query function passes TanStack's abort signal to `fetch`, so the double mount cancels the first fetch.
- **Left undone:**
  - No row virtualisation (a year is ~1 s to render).
  - No name search, sort by overage, or range in the URL.
  - Capacity editing isn't started.

## 2026-09-16 — shadcn controls

- **Used shadcn's Table, Button, Calendar, and Popover with TanStack Table v9.** The week columns are generated from the API's `weekStarts`; all people stay in one scrollable table so sticky headings and capacity columns remain aligned.
- **The date picker keeps a draft until Show.** The first click starts a fresh range even inside the displayed selection; the second completes it. The client widens it to whole weeks and disables Show beyond 54 weeks.
- **Verified in Chromium:** navigation, a Jan 7–21 selection, the over-allocation filter, dark mode, and mobile layout. A 54-week range rendered 500 people and 56 columns in about 1.9 s; 55 weeks was blocked. The table's sticky columns stayed put while scrolling horizontally.

## 2026-09-16 — API on sqlx

- **The whole server now uses one `*sqlx.DB`, not just the capacity endpoint.** It's opened through pgx's `database/sql` driver (`pgx/v5/stdlib`), so pgx still talks to Postgres and no new module was needed. Keeping `pgxpool` for other endpoints would mean two pools and two query APIs in one small service.
- **Connections are capped with `SetMaxOpenConns(10)`.** `database/sql` has no cap by default, while `pgxpool` capped at max(4, NumCPU).
- **Rows are streamed with `QueryxContext` + `StructScan`, not `SelectContext`.** That avoids a second full copy of a year of rows (27k). `$1` is still a `[]time.Time`; the pgx driver sends it as `date[]`.
- **Verified:**
  - The old pgx API (:8080) and the sqlx one (:8081) gave byte-identical bodies, status codes and content types for health, 8 ranges (including a full year, the data's edges, and 2012 with no data) and 4 bad inputs.
  - Year query ≈100 ms on both.
  - 30 parallel year requests all returned 200.
  - A client timeout logged no error.
  - The 500 path is still untested; it would need the DB stopped.
- **Left alone:** `go mod tidy` wants to drop the unused `golang.org/x/crypto`, remove stale `go.sum` hashes and add hashes for sqlx's test-only dependencies. The build doesn't need any of it, so it's not in this change.

## 2026-09-16 — PATCH /api/people/{id}

- **Request is `{"weeklyHours": n}` and the response is `{id, name, weeklyHours}`**, the same fields as a grid row. Allocations don't depend on capacity, so the client can patch `weeklyHours` into every cached `['capacity', …]` range without refetching.
- **Validation:** hours must be between 0 and 168 (the hours in a week); fractions are allowed. A missing or null `weeklyHours`, unknown fields, or trailing JSON return 400. An unknown id returns 404. The update and read happen in one `UPDATE … RETURNING`, so the response shows what was stored.
- **Verified with curl** on the running stack: 200/400/404 cases, and `/api/capacity` showed the new value right away. Ana's hours went back to 40 afterwards.
- **Left undone:** the grid's edit field and cache update (the web side of this step).

## 2026-09-17 — Editing capacity in the grid

- **Each row's Capacity cell has a number input and a Confirm button** (`CapacityEditor.tsx`). Nothing is sent until Confirm or Enter; Escape puts the value back. Confirm stays disabled until the value is new and between 0 and 168 (the same limit as the API). The API's error message shows as the input's tooltip, with a red border.
- **Cache update, not refetch:** on success, `setQueriesData(['capacity'])` writes the new `weeklyHours` into every loaded range. The over-allocation marks, counts and filter update from that. The editor is keyed by `weeklyHours`, so its draft resets once the new value is saved.
- **Checked in headless Chromium:** set Dee to 45 → +5 gone and 40 over-allocated. The next range loaded 45. Set back to 40 with Enter. Only two PATCHes were sent, and there were no extra capacity refetches.
- **Rows are 40 px, not 33 px** as noted earlier: shadcn's `TableHead` adds `h-10` to the row-header cell. The editor fits inside that height, so it isn't the cause.
- **Left undone:**
  - Under "Only over-allocated", a person whose edit fixes their overage leaves the list right away.
  - No success message beyond the value sticking.

## 2026-09-17 — Row virtualisation

- **Only the visible rows are rendered** (`@tanstack/react-virtual`, 10 rows of overscan). Spacer `<tr>`s above and below keep the scroll height, so the table markup and the sticky header and columns didn't change. `aria-rowcount` and `aria-rowindex` give the real position.
- **Rows are a fixed 40 px** (`rowHeight`). There's no per-row measuring: if row height changes in CSS, change the constant too.
- **Only rows are virtualised, not columns.** A 54-week range is about 25 rows × 56 cells in view. Column virtualisation would make the sticky Person and Capacity columns harder, for little gain.
- **Checked in headless Chromium:** 500 rows scroll to 20073 px (500 × 40 + the 73 px header), and the sticky cells line up top, middle and bottom. The "Only over-allocated" filter works, with no console errors. A 54-week range shows its first rows in about 0.6 s, down from about 1.9 s.
- **Known limit:** Ctrl+F in the browser only finds people who are on screen.
