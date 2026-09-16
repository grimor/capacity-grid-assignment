package main

import (
	"strings"
	"testing"
)

func TestDecodeUpdatePerson(t *testing.T) {
	valid := []struct {
		body string
		want float64
	}{
		{`{"weeklyHours": 32}`, 32},
		{`{"weeklyHours": 0}`, 0},
		{`{"weeklyHours": 37.5}`, 37.5},
		{`{"weeklyHours": 168}`, 168},
	}
	for _, tt := range valid {
		got, err := decodeUpdatePerson(strings.NewReader(tt.body))
		if err != nil {
			t.Errorf("%s: unexpected error: %v", tt.body, err)
		} else if got != tt.want {
			t.Errorf("%s: got %v, want %v", tt.body, got, tt.want)
		}
	}

	invalid := []string{
		``,
		`{}`,
		`{"weeklyHours": null}`,
		`{"weeklyHours": "32"}`,
		`{"weeklyHours": -1}`,
		`{"weeklyHours": 168.5}`,
		`{"weeklyHours": 32, "name": "x"}`,
		`{"weeklyHours": 32} {}`,
		`[32]`,
	}
	for _, body := range invalid {
		if _, err := decodeUpdatePerson(strings.NewReader(body)); err == nil {
			t.Errorf("%q: expected an error", body)
		}
	}
}
