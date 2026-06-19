package nmap

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/mahdialemi/NexusMap/internal/db"
)

var (
	nmapHostReportRe = regexp.MustCompile(`Nmap scan report for (.+)`)
	nmapPortRe       = regexp.MustCompile(`^(\d+)/(tcp|udp)\s+(\S+)\s+(\S+)\s*(.*)`)
	nmapPortAltRe    = regexp.MustCompile(`^(\d+)\s+\S+\s+(\S+)\s+(\S+)\s*(.*)`)
	macAddressRe     = regexp.MustCompile(`MAC Address:\s*([0-9A-Fa-f:]+)\s*(?:\((.+)\))?`)
	osDetailRe       = regexp.MustCompile(`OS details:\s*(.+)`)
	osGuessRe        = regexp.MustCompile(`Aggressive OS guesses:\s*(.+)`)
	serviceInfoRe    = regexp.MustCompile(`^(\d+)/(tcp|udp)\s+(\S+)\s+(\S+)\s+(.+?)(?:\s+(.+))?$`)
	hostUpRe         = regexp.MustCompile(`Host is up`)
	hostDownRe       = regexp.MustCompile(`Host is down`)
	portStateRe      = regexp.MustCompile(`^(\d+)/(tcp|udp)\s+(\S+)\s+(\S+)`)
)

func ParseNmapNormal(data string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, error) {
	lines := strings.Split(data, "\n")

	var hosts []db.Host
	var ports []db.Port
	var portScripts []db.PortScript
	var hostScripts []db.HostScript

	var currentHost *db.Host
	inPortSection := false
	hostIndexMap := make(map[string]int)

	for i := 0; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")

		if strings.HasPrefix(line, "Nmap scan report for") {
			target := strings.TrimPrefix(line, "Nmap scan report for ")
			hostname := ""
			if idx := strings.Index(target, " ("); idx > 0 {
				hostname = target[idx+2 : strings.LastIndex(target, ")")]
				target = target[:idx]
			}
			if idx2, exists := hostIndexMap[target]; exists {
				currentHost = &hosts[idx2]
				if hostname != "" && currentHost.Hostname == "" {
					currentHost.Hostname = hostname
				}
				inPortSection = false
				continue
			}
			currentHost = &db.Host{Status: "up", IP: target, Hostname: hostname}
			hosts = append(hosts, *currentHost)
			hostIndexMap[currentHost.IP] = len(hosts) - 1
			inPortSection = false
			continue
		}

		if currentHost == nil {
			continue
		}
		hostIdx := hostIndexMap[currentHost.IP]

		if strings.HasPrefix(line, "MAC Address:") {
			if m := macAddressRe.FindStringSubmatch(line); m != nil {
				hosts[hostIdx].MAC = m[1]
				if len(m) > 2 && m[2] != "" {
					hosts[hostIdx].Vendor = m[2]
				}
			}
			continue
		}

		if matches := osDetailRe.FindStringSubmatch(line); matches != nil {
			hosts[hostIdx].OS = matches[1]
			continue
		}
		if matches := osGuessRe.FindStringSubmatch(line); matches != nil {
			if hosts[hostIdx].OS == "" {
				hosts[hostIdx].OS = matches[1]
			}
			continue
		}

		if hostDownRe.MatchString(line) {
			hosts[hostIdx].Status = "down"
			continue
		}
		if hostUpRe.MatchString(line) {
			hosts[hostIdx].Status = "up"
			continue
		}

		if strings.HasPrefix(line, "PORT") {
			inPortSection = true
			continue
		}

		if inPortSection && line == "" {
			inPortSection = false
			continue
		}

		if inPortSection && !strings.HasPrefix(line, "#") {
			if m := parseNormalPortLine(line); m != nil {
				port := db.Port{
					IP:       currentHost.IP,
					Port:     m.port,
					Protocol: m.protocol,
					State:    m.state,
					Service:  m.service,
					Product:  m.product,
					Version:  m.version,
				}
				ports = append(ports, port)
			}
		}
	}

	return hosts, ports, portScripts, hostScripts, nil
}

type parsedPort struct {
	port     int
	protocol string
	state    string
	service  string
	product  string
	version  string
}

func parseNormalPortLine(line string) *parsedPort {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}

	parts := strings.Fields(line)
	if len(parts) < 3 {
		return nil
	}

	var port int
	var protocol, state, service, product, version string

	if strings.Contains(parts[0], "/") {
		pp := strings.SplitN(parts[0], "/", 2)
		if _, err := fmt.Sscanf(pp[0], "%d", &port); err != nil {
			return nil
		}
		protocol = pp[1]
		state = parts[1]
		if len(parts) >= 3 {
			service = parts[2]
		}
		if len(parts) >= 4 {
			remainder := strings.Join(parts[3:], " ")
			if idx := strings.LastIndex(remainder, " "); idx > 0 {
				product = remainder[:idx]
				version = remainder[idx+1:]
			} else {
				product = remainder
			}
		}
	} else {
		if _, err := fmt.Sscanf(parts[0], "%d", &port); err != nil {
			return nil
		}
		protocol = "tcp"
		state = parts[1]
		if len(parts) >= 3 {
			service = parts[2]
		}
		if len(parts) >= 4 {
			product = strings.Join(parts[3:], " ")
		}
	}

	if port == 0 {
		return nil
	}

	return &parsedPort{
		port:     port,
		protocol: protocol,
		state:    state,
		service:  service,
		product:  product,
		version:  version,
	}
}
