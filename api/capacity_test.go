package main

import (
	"testing"
	"time"
)

func TestParseWeekRange(t *testing.T) {
	tests := []struct {
		name      string
		from, to  string
		wantFrom  string
		wantTo    string
		wantWeeks int
	}{
		{"already whole weeks", "2025-12-29", "2026-01-18", "2025-12-29", "2026-01-18", 3},
		{"Monday to Friday widens to Sunday", "2025-12-29", "2026-01-16", "2025-12-29", "2026-01-18", 3},
		{"mid-week widens both ends", "2025-12-31", "2026-01-01", "2025-12-29", "2026-01-04", 1},
		{"Sunday from belongs to the week before", "2026-01-04", "2026-01-05", "2025-12-29", "2026-01-11", 2},
		{"single day", "2026-01-07", "2026-01-07", "2026-01-05", "2026-01-11", 1},
		{"leap year starting Sunday fits the cap", "2012-01-01", "2012-12-31", "2011-12-26", "2013-01-06", 54},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseWeekRange(tt.from, tt.to)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if f := got.From.Format(time.DateOnly); f != tt.wantFrom {
				t.Errorf("From = %s, want %s", f, tt.wantFrom)
			}
			if f := got.To.Format(time.DateOnly); f != tt.wantTo {
				t.Errorf("To = %s, want %s", f, tt.wantTo)
			}
			if len(got.Weeks) != tt.wantWeeks {
				t.Fatalf("got %d weeks, want %d", len(got.Weeks), tt.wantWeeks)
			}
			for i, week := range got.Weeks {
				if week.Weekday() != time.Monday {
					t.Errorf("Weeks[%d] = %s, not a Monday", i, week.Format(time.DateOnly))
				}
				if want := got.From.AddDate(0, 0, 7*i); !week.Equal(want) {
					t.Errorf("Weeks[%d] = %s, want %s", i, week.Format(time.DateOnly), want.Format(time.DateOnly))
				}
			}
		})
	}
}

func TestParseWeekRangeRejects(t *testing.T) {
	tests := []struct {
		name     string
		from, to string
	}{
		{"missing from", "", "2026-01-16"},
		{"missing to", "2025-12-29", ""},
		{"not zero-padded", "2026-1-5", "2026-01-16"},
		{"not a real date", "2026-02-30", "2026-03-06"},
		{"timestamp instead of date", "2025-12-29T00:00:00Z", "2026-01-16"},
		{"to before from", "2026-01-16", "2025-12-29"},
		{"more than maxWeeks", "2026-01-05", "2027-01-18"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := parseWeekRange(tt.from, tt.to); err == nil {
				t.Errorf("parseWeekRange(%q, %q) succeeded, want an error", tt.from, tt.to)
			}
		})
	}
}
