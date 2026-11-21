// Validation tests: the `400` boundary of the sync server (ruling A158).
//
// Pure functions, no HTTP and no database.
package model_test

import (
	"encoding/json"
	"strings"
	"testing"

	"inlinenotes/server/internal/model"
)

func validNote() model.NoteInput {
	return model.NoteInput{
		ID:      "aaaa1111",
		Text:    "selected text",
		Comment: "заметка",
		Anchor:  json.RawMessage(`{"text":"selected text","prefix":"","suffix":"","fragmentCount":1}`),
	}
}

func TestValidateSaveRequestAcceptsAWellFormedBody(t *testing.T) {
	req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{validNote()}}
	if err := model.ValidateSaveRequest(&req); err != nil {
		t.Fatalf("valid body rejected: %v", err)
	}
}

func TestValidateSaveRequestAcceptsAnEmptyNoteList(t *testing.T) {
	req := model.SaveRequest{AuthorID: "Анна"}
	if err := model.ValidateSaveRequest(&req); err != nil {
		t.Fatalf("empty list rejected: %v", err)
	}
}

func TestValidateSaveRequestRejectsBlankAuthor(t *testing.T) {
	req := model.SaveRequest{AuthorID: "   ", Notes: []model.NoteInput{validNote()}}
	err := model.ValidateSaveRequest(&req)
	ve, ok := model.AsValidationError(err)
	if !ok {
		t.Fatalf("err = %v, want a ValidationError", err)
	}
	if ve.Field != "author_id" {
		t.Fatalf("field = %q, want author_id", ve.Field)
	}
}

func TestValidateSaveRequestRejectsTooManyNotes(t *testing.T) {
	notes := make([]model.NoteInput, model.MaxNotesPerRequest+1)
	for i := range notes {
		notes[i] = validNote()
	}
	req := model.SaveRequest{AuthorID: "Анна", Notes: notes}
	err := model.ValidateSaveRequest(&req)
	ve, ok := model.AsValidationError(err)
	if !ok {
		t.Fatalf("err = %v, want a ValidationError", err)
	}
	if ve.Field != "notes" {
		t.Fatalf("field = %q, want notes", ve.Field)
	}
}

func TestValidateSaveRequestAcceptsExactlyTheCaps(t *testing.T) {
	notes := make([]model.NoteInput, model.MaxNotesPerRequest)
	for i := range notes {
		note := validNote()
		note.Comment = strings.Repeat("я", model.MaxCommentRunes)
		notes[i] = note
	}
	req := model.SaveRequest{AuthorID: strings.Repeat("a", model.MaxAuthorIDRunes), Notes: notes}
	if err := model.ValidateSaveRequest(&req); err != nil {
		t.Fatalf("caps rejected: %v", err)
	}
}

func TestValidateSaveRequestRejectsLongComment(t *testing.T) {
	note := validNote()
	note.Comment = strings.Repeat("я", model.MaxCommentRunes+1)
	req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{note}}
	ve, ok := model.AsValidationError(model.ValidateSaveRequest(&req))
	if !ok || ve.Field != "notes[0].comment" {
		t.Fatalf("err = %v (field %v), want notes[0].comment", model.ValidateSaveRequest(&req), ve)
	}
}

// The cap counts code points, not bytes: 256 cyrillic characters are 512 bytes.
func TestCommentCapCountsCodePoints(t *testing.T) {
	note := validNote()
	note.Comment = strings.Repeat("я", model.MaxCommentRunes)
	if !model.MatchesCommentCap(note.Comment) {
		t.Fatalf("256 code points rejected")
	}
	note.Comment += "я"
	if model.MatchesCommentCap(note.Comment) {
		t.Fatalf("257 code points accepted")
	}
}

func TestValidateSaveRequestRejectsBadAnchors(t *testing.T) {
	cases := map[string]json.RawMessage{
		"missing": nil,
		"empty":   json.RawMessage(""),
		"broken":  json.RawMessage("not-json"),
	}
	for name, anchor := range cases {
		t.Run(name, func(t *testing.T) {
			note := validNote()
			note.Anchor = anchor
			req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{note}}
			if _, ok := model.AsValidationError(model.ValidateSaveRequest(&req)); !ok {
				t.Fatalf("anchor %q accepted", string(anchor))
			}
		})
	}
}

// A154: the server does not know the anchor shape, so any valid JSON passes -
// object, array or scalar. Only `null` and non-JSON are refused.
func TestValidateSaveRequestAcceptsAnyValidJSONAnchor(t *testing.T) {
	for _, anchor := range []string{`[]`, `"text"`, `{"anything":[1,2]}`, `42`} {
		note := validNote()
		note.Anchor = json.RawMessage(anchor)
		req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{note}}
		if err := model.ValidateSaveRequest(&req); err != nil {
			t.Fatalf("anchor %s rejected: %v", anchor, err)
		}
	}
}

// `null` is refused on purpose: the column would hold a row that can never
// re-anchor, and the brief makes `anchor` required.
func TestValidateSaveRequestRejectsNullAnchor(t *testing.T) {
	note := validNote()
	note.Anchor = json.RawMessage(`null`)
	req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{note}}
	ve, ok := model.AsValidationError(model.ValidateSaveRequest(&req))
	if !ok || ve.Field != "notes[0].anchor" {
		t.Fatalf("err = %v, want notes[0].anchor", model.ValidateSaveRequest(&req))
	}
}

func TestValidateSaveRequestRejectsEmptyFields(t *testing.T) {
	for _, field := range []string{"id", "text"} {
		t.Run(field, func(t *testing.T) {
			note := validNote()
			switch field {
			case "id":
				note.ID = "  "
			case "text":
				note.Text = ""
			}
			req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{note}}
			if _, ok := model.AsValidationError(model.ValidateSaveRequest(&req)); !ok {
				t.Fatalf("%s accepted when empty", field)
			}
		})
	}
}

func TestValidatePageID(t *testing.T) {
	if err := model.ValidatePageID(""); err == nil {
		t.Fatalf("empty page id accepted")
	}
	if err := model.ValidatePageID("   "); err == nil {
		t.Fatalf("blank page id accepted")
	}
	if err := model.ValidatePageID("https://example.com/a/b?b=2&a=1#frag"); err != nil {
		t.Fatalf("real page key rejected: %v", err)
	}
}

func TestValidateAuthorIDRejectsOverlong(t *testing.T) {
	if err := model.ValidateAuthorID(strings.Repeat("a", model.MaxAuthorIDRunes+1)); err == nil {
		t.Fatalf("overlong author id accepted")
	}
	if err := model.ValidateAuthorID("Анна"); err != nil {
		t.Fatalf("valid author rejected: %v", err)
	}
}
