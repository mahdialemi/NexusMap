package nmap

import (
	"encoding/xml"
	"fmt"
	"strings"

	"github.com/mahdialemi/NexusMap/internal/db"
)

type nmaprun struct {
	XMLName xml.Name `xml:"nmaprun"`
	Hosts   []host   `xml:"host"`
}

type host struct {
	Status    status     `xml:"status"`
	Addresses []address  `xml:"address"`
	Hostnames hostnames  `xml:"hostnames"`
	OS        osData     `xml:"os"`
	Ports     ports      `xml:"ports"`
	Scripts   []script   `xml:"hostscript>script"`
}

type status struct {
	State  string `xml:"state,attr"`
	Reason string `xml:"reason,attr"`
}

type address struct {
	Addr     string `xml:"addr,attr"`
	AddrType string `xml:"addrtype,attr"`
	Vendor   string `xml:"vendor,attr"`
}

type hostnames struct {
	Entries []hostname `xml:"hostname"`
}

type hostname struct {
	Name string `xml:"name,attr"`
	Type string `xml:"type,attr"`
}

type osData struct {
	Matches []osMatch `xml:"osmatch"`
}

type osMatch struct {
	Name string `xml:"name,attr"`
}

type ports struct {
	Entries []portEntry `xml:"port"`
}

type portEntry struct {
	Protocol string   `xml:"protocol,attr"`
	PortID   int      `xml:"portid,attr"`
	State    status   `xml:"state"`
	Service  service  `xml:"service"`
	Scripts  []script `xml:"script"`
}

type service struct {
	Name      string `xml:"name,attr"`
	Product   string `xml:"product,attr"`
	Version   string `xml:"version,attr"`
	ExtraInfo string `xml:"extrainfo,attr"`
	Method    string `xml:"method,attr"`
	Conf      string `xml:"conf,attr"`
	CPE       string `xml:"cpe,attr"`
	Tunnel    string `xml:"tunnel,attr"`
}

type script struct {
	ID     string `xml:"id,attr"`
	Output string `xml:"output,attr"`
}

func ParseXML(xmlData string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, error) {
	var result nmaprun
	if err := xml.Unmarshal([]byte(xmlData), &result); err != nil {
		return nil, nil, nil, nil, fmt.Errorf("xml parse error: %w", err)
	}

	var hosts []db.Host
	var ports []db.Port
	var portScripts []db.PortScript
	var hostScripts []db.HostScript

	for _, h := range result.Hosts {
		if h.Status.State != "up" {
			continue
		}

		host := db.Host{
			Status: h.Status.State,
		}
		for _, a := range h.Addresses {
			switch a.AddrType {
			case "ipv4":
				host.IP = a.Addr
			case "mac":
				host.MAC = a.Addr
				host.Vendor = a.Vendor
			}
		}
		if host.IP == "" {
			for _, a := range h.Addresses {
				if a.AddrType == "ipv6" {
					host.IP = a.Addr
					break
				}
			}
		}
		if host.IP == "" {
			continue
		}

		if len(h.Hostnames.Entries) > 0 {
			host.Hostname = h.Hostnames.Entries[0].Name
		}

		if len(h.OS.Matches) > 0 {
			host.OS = h.OS.Matches[0].Name
		}

		hosts = append(hosts, host)

		for _, pe := range h.Ports.Entries {
			port := db.Port{
				IP:        host.IP,
				Port:      pe.PortID,
				Protocol:  pe.Protocol,
				State:     pe.State.State,
				Service:   pe.Service.Name,
				Version:   pe.Service.Version,
				ExtraInfo: pe.Service.ExtraInfo,
				Product:   pe.Service.Product,
				CPE:       pe.Service.CPE,
				Reason:    pe.State.Reason,
			}
			ports = append(ports, port)

			for _, s := range pe.Scripts {
				ps := db.PortScript{
					IP:       host.IP,
					Port:     pe.PortID,
					Protocol: pe.Protocol,
					ScriptID: s.ID,
					Output:   s.Output,
				}
				portScripts = append(portScripts, ps)
			}
		}

		for _, s := range h.Scripts {
			hs := db.HostScript{
				IP:       host.IP,
				ScriptID: s.ID,
				Output:   s.Output,
			}
			hostScripts = append(hostScripts, hs)
		}
	}

	return hosts, ports, portScripts, hostScripts, nil
}

// isNmapXML checks if the data looks like nmap XML by scanning for key elements.
func isNmapXML(data string) bool {
	lower := strings.ToLower(data)
	return strings.Contains(lower, "<nmaprun") || strings.Contains(lower, "<nmaprun>")
}
