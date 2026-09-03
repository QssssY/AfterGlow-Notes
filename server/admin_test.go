package main

import (
	"strings"
	"testing"
)

func TestValidatePlaylistDefaults(t *testing.T) {
	tests := []struct {
		name string
		list []any
		want string
	}{
		{name: "empty playlist", list: nil},
		{name: "one default", list: []any{map[string]any{"default": true}}},
		{
			name: "missing default",
			list: []any{map[string]any{"title": "song"}},
			want: "必须且只能指定一首",
		},
		{
			name: "multiple defaults",
			list: []any{
				map[string]any{"default": true},
				map[string]any{"default": true},
			},
			want: "必须且只能指定一首",
		},
		{
			name: "invalid default type",
			list: []any{map[string]any{"default": "yes"}},
			want: "default 必须是布尔值",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePlaylistDefaults(tt.list)
			if tt.want == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected error containing %q, got %v", tt.want, err)
			}
		})
	}
}
