package nmap

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/mahdialemi/NexusMap/internal/db"
)

var (
	gnmapHostRe     = regexp.MustCompile(`^Host:\s+(\S+)\s+(?:\(([^)]*)\))?\s*`)
	gnmapPortsRe    = regexp.MustCompile(`Ports:\s*(.*)`)
	gnmapOSRe       = regexp.MustCompile(`OS:\s*(.*)`)
	gnmapPortEntry  = regexp.MustCompile(`(\d+)/(open|closed|filtered|unfiltered)/(tcp|udp)//([^/]*)//([^/]*)//([^/]*)//([^/]*)`)
	gnmapIgnoredRe  = regexp.MustCompile(`Ignored State:\s*(.*)`)
)

func ParseImportGnmap(data string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, error) {
	lines := strings.Split(data, "\n")

	var hosts []db.Host
	var ports []db.Port
	var portScripts []db.PortScript
	var hostScripts []db.HostScript

	hostIndexMap := make(map[string]int)

	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(line, "Host:") {
			hostMatch := gnmapHostRe.FindStringSubmatch(line)
			if hostMatch == nil {
				continue
			}

			ip := hostMatch[1]
			hostname := ""
			if len(hostMatch) > 2 {
				hostname = strings.TrimSpace(hostMatch[2])
			}

			host := db.Host{
				IP:       ip,
				Hostname: hostname,
				Status:   "up",
			}

			if osMatch := gnmapOSRe.FindStringSubmatch(line); osMatch != nil {
				host.OS = strings.TrimSpace(osMatch[1])
			}

			hosts = append(hosts, host)
			hostIdx := len(hosts) - 1
			hostIndexMap[ip] = hostIdx

			if portMatch := gnmapPortsRe.FindStringSubmatch(line); portMatch != nil {
				portStr := portMatch[1]
				for _, entry := range gnmapPortEntry.FindAllStringSubmatch(portStr, -1) {
					if len(entry) < 8 {
						continue
					}
					var portNum int
					fmt.Sscanf(entry[1], "%d", &portNum)
					if portNum == 0 {
						continue
					}

					state := entry[2]
					protocol := entry[3]
					service := entry[4]
					version := entry[5]
					extraInfo := entry[6]
					product := entry[7]

					port := db.Port{
						IP:        ip,
						Port:      portNum,
						Protocol:  protocol,
						State:     state,
						Service:   service,
						Version:   version,
						ExtraInfo: extraInfo,
						Product:   product,
					}
					ports = append(ports, port)
				}
			}

			continue
		}
	}

	return hosts, ports, portScripts, hostScripts, nil
}
