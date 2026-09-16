package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
)

// maxWeeklyHours is the most hours a week has. Anything above it is a typo.
const maxWeeklyHours = 168

// updatePersonRequest is the body of PATCH /api/people/{id}.
//
// WeeklyHours is a pointer so a missing field is an error rather than a
// silent reset to 0.
type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

// personResponse is the body PATCH /api/people/{id} returns: the person as
// stored after the update. Its fields match the ones personCapacity carries,
// so the grid can patch the row in place without refetching allocations.
type personResponse struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id}
//
// Body: {"weeklyHours": 32}. Responds with the updated person. Allocations
// don't depend on capacity, so nothing else the grid shows changes.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "id must be a positive integer")
		return
	}

	hours, err := decodeUpdatePerson(http.MaxBytesReader(w, r.Body, 1<<16))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	person, err := s.updateWeeklyHours(r.Context(), id, hours)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "person not found")
	case errors.Is(err, context.Canceled):
		// the client went away; nobody to answer
	case err != nil:
		log.Printf("update person %d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "could not update person")
	default:
		writeJSON(w, http.StatusOK, person)
	}
}

// decodeUpdatePerson reads and validates the request body, returning the new
// weekly hours. Its errors are safe to show to users.
func decodeUpdatePerson(body io.Reader) (float64, error) {
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	var req updatePersonRequest
	if err := dec.Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return 0, errors.New("request body is too large")
		}
		return 0, errors.New(`body must be JSON like {"weeklyHours": 32}`)
	}
	if dec.More() {
		return 0, errors.New("body must be a single JSON object")
	}
	if req.WeeklyHours == nil {
		return 0, errors.New("weeklyHours is required")
	}
	hours := *req.WeeklyHours
	if math.IsNaN(hours) || hours < 0 || hours > maxWeeklyHours {
		return 0, fmt.Errorf("weeklyHours must be between 0 and %d", maxWeeklyHours)
	}
	return hours, nil
}

// updateWeeklyHoursQuery sets a person's weekly hours and returns the row as
// stored. It returns no row when the id doesn't exist.
const updateWeeklyHoursQuery = `
UPDATE people
SET weekly_hours = $2::numeric
WHERE id = $1
RETURNING id, name, weekly_hours::float8 AS weekly_hours
`

// personRow is one row of updateWeeklyHoursQuery.
type personRow struct {
	ID          int     `db:"id"`
	Name        string  `db:"name"`
	WeeklyHours float64 `db:"weekly_hours"`
}

// updateWeeklyHours returns sql.ErrNoRows when no person has the id.
func (s *server) updateWeeklyHours(ctx context.Context, id int, hours float64) (personResponse, error) {
	var row personRow
	if err := s.db.GetContext(ctx, &row, updateWeeklyHoursQuery, id, hours); err != nil {
		return personResponse{}, err
	}
	return personResponse(row), nil
}
