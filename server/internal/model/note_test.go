// Validation tests: the `400` boundary of the sync server (ruling A158).
//
// Pure functions, no HTTP and no database.
package model_test

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"inlinenotes/server/internal/model"
)

// notUTF8 is the byte sequence the PM measured on the live stack (S16-1, S16-2):
// the request was decoded out of a Windows-1251 body, so 0xC0 0xED 0xED 0xE0 is
// what reached the server. Every one of those four bytes is invalid UTF-8 on its
// own, so the string is invalid whatever its neighbors are.
var notUTF8 = "\xc0\xed\xed\xe0"

func requireField(t *testing.T, err error, field string) {
	t.Helper()
	ve, ok := model.AsValidationError(err)
	if !ok {
		t.Fatalf("err = %v, want a ValidationError", err)
	}
	if ve.Field != field {
		t.Fatalf("field = %q, want %q", ve.Field, field)
	}
}

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

/* ------------- AC 1-3: invalid UTF-8 is a ValidationError (A159) ---------- */

// The guard the whole task exists for: `utf8.ValidString` must stay the one
// decision the helper makes (AC 11). If this ever degrades to a rune count, the
// Windows-1251 string below is no longer "invalid" and every test in this block
// is worthless.
func TestNotUTF8FixtureIsReallyInvalidUTF8(t *testing.T) {
	if utf8.ValidString(notUTF8) {
		t.Fatalf("the fixture %q is valid UTF-8: the tests below would prove nothing", notUTF8)
	}
	if !utf8.ValidString("Анна") {
		t.Fatalf("the Cyrillic happy path is not valid UTF-8")
	}
}

// AC 1: a path page_id carrying invalid bytes is refused, field page_id.
func TestValidatePageIDRejectsInvalidUTF8(t *testing.T) {
	requireField(t, model.ValidatePageID("https://example.com/"+notUTF8), "page_id")
}

// AC 2: an author id carrying invalid bytes is refused, field author_id.
func TestValidateAuthorIDRejectsInvalidUTF8(t *testing.T) {
	requireField(t, model.ValidateAuthorID(notUTF8), "author_id")
	// The overlong check must not be what rejects it: 4 invalid bytes are far
	// below the 64-code-point cap, so the UTF-8 rule is the only refuser.
	requireField(t, model.ValidateAuthorID(notUTF8+"x"), "author_id")
}

// AC 3: every note string is checked and the field is qualified as
// notes[i].<field>, so a client knows which note to fix.
func TestValidateSaveRequestRejectsInvalidUTF8InEveryNoteField(t *testing.T) {
	cases := map[string]func(*model.NoteInput){
		"notes[0].id":      func(n *model.NoteInput) { n.ID = notUTF8 },
		"notes[0].text":    func(n *model.NoteInput) { n.Text = notUTF8 },
		"notes[0].comment": func(n *model.NoteInput) { n.Comment = notUTF8 },
	}
	for field, mutate := range cases {
		t.Run(field, func(t *testing.T) {
			note := validNote()
			mutate(&note)
			req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{note}}
			requireField(t, model.ValidateSaveRequest(&req), field)
		})
	}
}

// The body's own author_id goes through the same helper as the path one.
func TestValidateSaveRequestRejectsInvalidUTF8Author(t *testing.T) {
	req := model.SaveRequest{AuthorID: notUTF8, Notes: []model.NoteInput{validNote()}}
	requireField(t, model.ValidateSaveRequest(&req), "author_id")
}

// The index in the field name must be the offending note's, not always zero: a
// client with a 20-note batch needs to know which note to fix.
func TestValidateSaveRequestNamesTheOffendingNoteIndex(t *testing.T) {
	good := validNote()
	bad := validNote()
	bad.Comment = notUTF8
	req := model.SaveRequest{AuthorID: "Анна", Notes: []model.NoteInput{good, good, bad}}
	requireField(t, model.ValidateSaveRequest(&req), "notes[2].comment")
}

// AC 10: a Cyrillic body is valid UTF-8 and must keep passing. The cap counts
// code points, so the check cannot be a byte check either.
func TestValidateSaveRequestAcceptsCyrillicEverywhere(t *testing.T) {
	req := model.SaveRequest{
		AuthorID: "Борис",
		Notes: []model.NoteInput{{
			ID:      "идентификатор-01",
			Text:    "выделенный текст статьи",
			Comment: strings.Repeat("я", model.MaxCommentRunes),
			Anchor:  json.RawMessage(`{"text":"выделенный текст","prefix":"до","suffix":"после"}`),
		}},
	}
	if err := model.ValidateSaveRequest(&req); err != nil {
		t.Fatalf("valid Cyrillic body rejected: %v", err)
	}
}

// The helper is the single copy of the rule (AC 11): it answers for the path and
// for the body, and it is exported so there is no reason to write a second one.
func TestRequireValidUTF8NamesTheFieldItWasGiven(t *testing.T) {
	if err := model.RequireValidUTF8("page_id", []byte("https://example.com/a?b=2&a=1#frag")); err != nil {
		t.Fatalf("a real page key rejected: %v", err)
	}
	requireField(t, model.RequireValidUTF8("custom_field", []byte(notUTF8)), "custom_field")
}
