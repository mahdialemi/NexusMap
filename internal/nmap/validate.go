package nmap

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	validNmapFlag   = regexp.MustCompile(`^(--?)[a-zA-Z0-9-]+$`)
	nmapFlagWithVal = regexp.MustCompile(`^(--?)([a-zA-Z0-9-]+)(.+)$`)
	safeArgRe       = regexp.MustCompile(`^[a-zA-Z0-9./_\-:,\[\]{}@!~*?+$%^&()=<>]+$`)
)

func ValidateNmapArgs(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("empty args")
	}

	for _, arg := range args {
		if strings.Contains(arg, "`") || strings.Contains(arg, "$(") || strings.Contains(arg, ";") || strings.Contains(arg, "|") || strings.Contains(arg, "&&") || strings.Contains(arg, "||") || strings.Contains(arg, "\n") || strings.Contains(arg, "\r") {
			return fmt.Errorf("invalid characters in args: %s", arg)
		}

		if strings.HasPrefix(arg, "-o") && !strings.HasPrefix(arg, "-o-") {
			return fmt.Errorf("output flags not allowed in custom args")
		}

		if strings.HasPrefix(arg, "--stylesheet") {
			return fmt.Errorf("stylesheet flag not allowed")
		}

		if strings.HasPrefix(arg, "--datadir") {
			return fmt.Errorf("datadir flag not allowed")
		}

		if strings.HasPrefix(arg, "-") {
			flagName := arg
			val := ""
			if idx := strings.Index(arg, "="); idx > 0 {
				flagName = arg[:idx]
				val = strings.Trim(arg[idx+1:], `"'`)
			} else if m := nmapFlagWithVal.FindStringSubmatch(arg); m != nil {
				flagName = m[1] + m[2]
				val = m[3]
			}
			if !validNmapFlag.MatchString(flagName) {
				return fmt.Errorf("invalid flag: %s", arg)
			}
			if val != "" && !safeArgRe.MatchString(val) {
				return fmt.Errorf("invalid flag value in: %s", arg)
			}
			continue
		}

		if strings.HasPrefix(arg, "/") || strings.HasPrefix(arg, ".") || strings.HasPrefix(arg, "~") {
			resolved, err := filepath.Abs(arg)
			if err == nil {
				if _, err := exec.LookPath(filepath.Base(resolved)); err == nil {
					continue
				}
			}
			if !safeArgRe.MatchString(arg) {
				return fmt.Errorf("invalid path arg: %s", arg)
			}
		}
	}

	return nil
}

func GetProfileArgs(profile string) []string {
	switch strings.ToLower(profile) {
	case "default", "fast":
		return strings.Fields("-sV -T4 --top-ports 1000")
	case "arp-discovery":
		return strings.Fields("-sn -PR")
	case "ping-sweep", "host-discovery":
		return strings.Fields("-sn -PE -PP -PM -n")
	case "quick-tcp":
		return strings.Fields("-F -T4")
	case "fast-top-1000":
		return strings.Fields("-sV -sC -O -T4 -n -Pn")
	case "full-port-scan":
		return strings.Fields("-sV -sC -O -T4 -n -Pn -p-")
	case "stealth-syn":
		return strings.Fields("-sS -p- -T4 --min-rate 1000")
	case "full-connect":
		return strings.Fields("-sT -p-")
	case "version-only":
		return strings.Fields("-sV")
	case "os-fingerprint", "os-detection":
		return strings.Fields("-O --osscan-guess")
	case "aggressive", "-a":
		return strings.Fields("-A")
	case "default-scripts":
		return strings.Fields("-sC")
	case "udp-fast":
		return strings.Fields("-sU -sV --version-intensity 0 -n -F -T4")
	case "udp-version":
		return strings.Fields("-sU -sV -sC -n -F -T4")
	case "udp-common":
		return strings.Fields("-sU -p 53,67,68,69,123,135,137,138,139,161,162,445,500,514,520,631,1434,1900,4500,5353")
	case "udp-top-1000":
		return strings.Fields("-sU -sV --version-intensity 0 -n -T4")
	case "fragmentation":
		return strings.Fields("-f")
	case "fin-scan":
		return strings.Fields("-sF")
	case "xmas-scan":
		return strings.Fields("-sX")
	case "null-scan":
		return strings.Fields("-sN")
	case "ack-scan":
		return strings.Fields("-sA")
	case "window-scan":
		return strings.Fields("-sW")
	case "maimon-scan":
		return strings.Fields("-sM")
	case "decoys":
		return strings.Fields("-D RND:10")
	case "source-port":
		return strings.Fields("-g 53")
	case "paranoid-t0":
		return strings.Fields("-T0")
	case "sneaky-t1":
		return strings.Fields("-T1")
	case "polite-t2":
		return strings.Fields("-T2")
	case "data-length":
		return strings.Fields("--data-length 200")
	case "mac-spoof":
		return strings.Fields("--spoof-mac 0")
	case "live-discovery":
		return strings.Fields("-sn -PE -PP -PM")
	case "full-tcp":
		return strings.Fields("-p- -T4 --open")
	case "udp-scan":
		return strings.Fields("-sU -T4 --top-ports 100")
	case "tcp-udp":
		return strings.Fields("-sS -sU -T4 --top-ports 100")
	case "comprehensive", "full":
		return strings.Fields("-A -T4 -p- --open")
	default:
		return strings.Fields("-sV -T4 --top-ports 1000")
	}
}
