package nmap

import (
	"fmt"
	"testing"
)

func TestValidateNmapArgs_ScriptWildcards(t *testing.T) {
	tests := []struct {
		args []string
		ok   bool
	}{
		// Should be allowed
		{[]string{"--script", "vuln*"}, true},
		{[]string{"--script", "ftp*"}, true},
		{[]string{"--script=vuln*"}, true},
		{[]string{`--script="ftp*"`}, true},
		{[]string{"--script", "ssh-auth-methods"}, true},
		{[]string{"--script", "safe,default"}, true},

		// Should be blocked
		{[]string{"--script", "/tmp/evil.nse"}, false},
		{[]string{"--script=/tmp/evil.nse"}, false},
		{[]string{"--iL", "/etc/passwd"}, false},
		{[]string{"--iL", "./targets.txt"}, false},
		{[]string{"--excludefile", "/tmp/exclude"}, false},
		{[]string{"--iflist"}, false},
		{[]string{"--webxml"}, false},
		{[]string{"--script-updatedb"}, false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprint(tt.args), func(t *testing.T) {
			err := ValidateNmapArgs(tt.args)
			if tt.ok && err != nil {
				t.Errorf("expected OK, got error: %v", err)
			}
			if !tt.ok && err == nil {
				t.Errorf("expected error, got OK")
			}
		})
	}
}
