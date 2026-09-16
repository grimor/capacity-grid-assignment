package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"
)

// maxWeeks caps how many weeks one request may cover. 54 fits any calendar
// year once the range is widened to whole weeks.
const maxWeeks = 54

// capacityResponse is the body of GET /api/capacity.
//
// Weeks run Monday to Sunday. The requested range is widened to whole weeks;
// From and To are the range actually covered.
type capacityResponse struct {
	From       string           `json:"from"`
	To         string           `json:"to"`
	WeekStarts []string         `json:"weekStarts"`
	People     []personCapacity `json:"people"`
}

// personCapacity is one row of the grid.
//
// WeeklyHours is the person's capacity in each week of the range — it is the
// same value PATCH /api/people/{id} edits, and it is deliberately not copied
// into every week, so an edit has exactly one number to replace.
//
// Weeks holds one entry per WeekStarts, in the same order.
type personCapacity struct {
	ID          int              `json:"id"`
	Name        string           `json:"name"`
	WeeklyHours float64          `json:"weeklyHours"`
	Weeks       []weekAllocation `json:"weeks"`
}

type weekAllocation struct {
	WeekStart      string  `json:"weekStart"`
	AllocatedHours float64 `json:"allocatedHours"`
}

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// It returns, for every person and every week in the requested range, how
// many hours they are allocated and how much capacity they have.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rng, err := parseWeekRange(q.Get("from"), q.Get("to"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	people, err := s.loadCapacity(r.Context(), rng.Weeks)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return // the client went away; nobody to answer
		}
		log.Printf("capacity %s..%s: %v", rng.From.Format(time.DateOnly), rng.To.Format(time.DateOnly), err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	weekStarts := make([]string, len(rng.Weeks))
	for i, week := range rng.Weeks {
		weekStarts[i] = week.Format(time.DateOnly)
	}
	writeJSON(w, http.StatusOK, capacityResponse{
		From:       rng.From.Format(time.DateOnly),
		To:         rng.To.Format(time.DateOnly),
		WeekStarts: weekStarts,
		People:     people,
	})
}

// weekRange is a date range widened to whole weeks.
type weekRange struct {
	From  time.Time   // a Monday
	To    time.Time   // a Sunday
	Weeks []time.Time // the Monday of each week, ascending
}

// parseWeekRange validates the from/to query parameters and widens them to
// the Monday on or before from and the Sunday on or after to.
func parseWeekRange(fromParam, toParam string) (weekRange, error) {
	from, err := parseDateParam("from", fromParam)
	if err != nil {
		return weekRange{}, err
	}
	to, err := parseDateParam("to", toParam)
	if err != nil {
		return weekRange{}, err
	}
	if to.Before(from) {
		return weekRange{}, errors.New("to must not be before from")
	}

	// time.Weekday counts from Sunday = 0; shift so Monday = 0.
	from = from.AddDate(0, 0, -(int(from.Weekday())+6)%7)
	to = to.AddDate(0, 0, (7-int(to.Weekday()))%7)

	// Dates parse as UTC midnight, so every day is exactly 24 hours.
	weeks := int(to.Sub(from).Hours()/24+1) / 7
	if weeks > maxWeeks {
		return weekRange{}, fmt.Errorf("range covers %d weeks; at most %d are allowed", weeks, maxWeeks)
	}

	starts := make([]time.Time, weeks)
	for i := range starts {
		starts[i] = from.AddDate(0, 0, 7*i)
	}
	return weekRange{From: from, To: to, Weeks: starts}, nil
}

func parseDateParam(name, value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("%s is required, as YYYY-MM-DD", name)
	}
	t, err := time.Parse(time.DateOnly, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be a date as YYYY-MM-DD, got %q", name, value)
	}
	return t, nil
}

// capacityQuery returns one row per person per week in $1, ordered by person
// and then week, including weeks where the person has nothing allocated.
//
// Only working days count: an assignment contributes hours_per_day for each
// Monday–Friday day it covers, start_date and end_date inclusive.
//
// Every assignment row counts. The data stores one assignment as several rows
// whose hours_per_day add up to the real figure, so rows that look like
// duplicates must be summed, not collapsed.
const capacityQuery = `
WITH weeks AS (
	SELECT unnest($1::date[]) AS week_start
),
allocated AS (
	SELECT
		a.person_id,
		w.week_start,
		sum(a.hours_per_day * (
			least(a.end_date, w.week_start + 4) - greatest(a.start_date, w.week_start) + 1
		)) AS hours
	FROM weeks w
	JOIN assignments a
		ON a.start_date <= w.week_start + 4 -- starts by Friday
		AND a.end_date >= w.week_start      -- ends on or after Monday
	GROUP BY a.person_id, w.week_start
)
SELECT
	p.id,
	p.name,
	p.weekly_hours::float8 AS weekly_hours,
	w.week_start,
	coalesce(al.hours, 0)::float8 AS allocated_hours
FROM people p
CROSS JOIN weeks w
LEFT JOIN allocated al ON al.person_id = p.id AND al.week_start = w.week_start
ORDER BY p.name COLLATE "und-x-icu", p.id, w.week_start
`

// capacityRow is one row of capacityQuery.
type capacityRow struct {
	ID             int       `db:"id"`
	Name           string    `db:"name"`
	WeeklyHours    float64   `db:"weekly_hours"`
	WeekStart      time.Time `db:"week_start"`
	AllocatedHours float64   `db:"allocated_hours"`
}

func (s *server) loadCapacity(ctx context.Context, weeks []time.Time) ([]personCapacity, error) {
	// The pgx driver sends the []time.Time as a date[] for $1. Rows are read
	// one at a time rather than with SelectContext, so a year of weeks isn't
	// held in memory twice.
	rows, err := s.db.QueryxContext(ctx, capacityQuery, weeks)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	people := []personCapacity{}
	for rows.Next() {
		var row capacityRow
		if err := rows.StructScan(&row); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		// Rows arrive grouped by person, so a new id starts a new row.
		if len(people) == 0 || people[len(people)-1].ID != row.ID {
			people = append(people, personCapacity{
				ID:          row.ID,
				Name:        row.Name,
				WeeklyHours: row.WeeklyHours,
				Weeks:       make([]weekAllocation, 0, len(weeks)),
			})
		}
		person := &people[len(people)-1]
		person.Weeks = append(person.Weeks, weekAllocation{
			WeekStart:      row.WeekStart.Format(time.DateOnly),
			AllocatedHours: row.AllocatedHours,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}
	return people, nil
}
