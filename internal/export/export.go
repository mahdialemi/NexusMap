package export

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"scanner-mgmt/internal/db"
	"strings"

	"github.com/xuri/excelize/v2"
)

func escapeCSV(s string) string {
	if len(s) > 0 && (s[0] == '=' || s[0] == '+' || s[0] == '-' || s[0] == '@') {
		return "'" + s
	}
	return s
}

func safeCSV(s string) string {
	return escapeCSV(strings.TrimSpace(s))
}

func ToExcel(results []db.ResultRow, scan *db.Scan) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Scan Results"
	f.SetSheetName("Sheet1", sheetName)

	headers := []string{
		"IP", "MAC", "Hostname", "OS", "Host Status",
		"Port", "Protocol", "State", "Service", "Version",
		"Product", "Extra Info", "Reason", "Modified",
	}

	for i, h := range headers {
		cell := fmt.Sprintf("%c1", 'A'+i)
		f.SetCellValue(sheetName, cell, h)
	}

	style, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#4472C4"}, Pattern: 1},
	})
	f.SetCellStyle(sheetName, "A1", "N1", style)

	for i, r := range results {
		row := i + 2
		modified := "No"
		if r.IsModified {
			modified = "Yes"
		}
		values := []interface{}{
			r.IP, r.MAC, r.Hostname, r.OS, r.HostStatus,
			r.Port, r.Protocol, r.State, r.Service, r.Version,
			r.Product, r.ExtraInfo, r.Reason, modified,
		}
		for j, v := range values {
			cell := fmt.Sprintf("%c%d", 'A'+j, row)
			f.SetCellValue(sheetName, cell, v)
		}
	}

	f.SetColWidth(sheetName, "A", "N", 18)

	buf := new(bytes.Buffer)
	if err := f.Write(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func ToJSON(results []db.ResultRow) ([]byte, error) {
	var output []map[string]interface{}
	for _, r := range results {
		output = append(output, map[string]interface{}{
			"ip":          r.IP,
			"mac":         r.MAC,
			"hostname":    r.Hostname,
			"os":          r.OS,
			"host_status": r.HostStatus,
			"port":        r.Port,
			"protocol":    r.Protocol,
			"state":       r.State,
			"service":     r.Service,
			"version":     r.Version,
			"product":     r.Product,
			"extra_info":  r.ExtraInfo,
			"reason":      r.Reason,
			"is_modified": r.IsModified,
		})
	}
	return json.MarshalIndent(output, "", "  ")
}

func ToCSV(results []db.ResultRow) ([]byte, error) {
	buf := new(bytes.Buffer)
	w := csv.NewWriter(buf)

	w.Write([]string{
		"IP", "MAC", "Hostname", "OS", "Host Status",
		"Port", "Protocol", "State", "Service", "Version",
		"Product", "Extra Info", "Reason", "Modified",
	})

	for _, r := range results {
		modified := "No"
		if r.IsModified {
			modified = "Yes"
		}
		w.Write([]string{
			safeCSV(r.IP), safeCSV(r.MAC), safeCSV(r.Hostname), safeCSV(r.OS), safeCSV(r.HostStatus),
			fmt.Sprintf("%d", r.Port), safeCSV(r.Protocol), safeCSV(r.State), safeCSV(r.Service), safeCSV(r.Version),
			safeCSV(r.Product), safeCSV(r.ExtraInfo), safeCSV(r.Reason), modified,
		})
	}

	w.Flush()
	return buf.Bytes(), w.Error()
}

func ToConsolidatedExcelWithScripts(hosts []db.ConsolidatedHost, ports []db.ConsolidatedPort, scripts []db.ConsolidatedScript) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	portSheet := "Ports"
	f.SetSheetName("Sheet1", portSheet)

	portHeaders := []string{
		"IP", "Port", "Protocol", "State", "Service", "Version",
		"Product", "Extra Info", "Changes", "Last Seen",
	}
	for i, h := range portHeaders {
		cell := fmt.Sprintf("%c1", 'A'+i)
		f.SetCellValue(portSheet, cell, h)
	}
	portStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#4472C4"}, Pattern: 1},
	})
	f.SetCellStyle(portSheet, "A1", "J1", portStyle)

	for i, p := range ports {
		row := i + 2
		values := []interface{}{
			p.IP, p.Port, p.Protocol, p.State, p.Service, p.Version,
			p.Product, p.ExtraInfo, p.ChangeCount, p.LastSeen,
		}
		for j, v := range values {
			cell := fmt.Sprintf("%c%d", 'A'+j, row)
			f.SetCellValue(portSheet, cell, v)
		}
	}

	if len(hosts) > 0 {
		hostSheet := "Hosts"
		f.NewSheet(hostSheet)

		hostHeaders := []string{
			"IP", "MAC", "Hostname", "OS", "Status",
			"Discovery Methods", "First Seen", "Last Seen",
		}
		for i, h := range hostHeaders {
			cell := fmt.Sprintf("%c1", 'A'+i)
			f.SetCellValue(hostSheet, cell, h)
		}
		f.SetCellStyle(hostSheet, "A1", "H1", portStyle)

		for i, h := range hosts {
			row := i + 2
			values := []interface{}{
				h.IP, h.MAC, h.Hostname, h.OS, h.Status,
				h.DiscoveryMethods, h.FirstSeen, h.LastSeen,
			}
			for j, v := range values {
				cell := fmt.Sprintf("%c%d", 'A'+j, row)
				f.SetCellValue(hostSheet, cell, v)
			}
		}
	}

	if len(scripts) > 0 {
		scriptSheet := "Scripts"
		f.NewSheet(scriptSheet)

		scriptHeaders := []string{
			"IP", "Port", "Protocol", "Service", "State",
			"Script ID", "Output",
		}
		for i, h := range scriptHeaders {
			cell := fmt.Sprintf("%c1", 'A'+i)
			f.SetCellValue(scriptSheet, cell, h)
		}
		f.SetCellStyle(scriptSheet, "A1", "G1", portStyle)

		for i, s := range scripts {
			row := i + 2
			values := []interface{}{
				s.IP, s.Port, s.Protocol, s.Service, s.State,
				s.ScriptID, s.Output,
			}
			for j, v := range values {
				cell := fmt.Sprintf("%c%d", 'A'+j, row)
				f.SetCellValue(scriptSheet, cell, v)
			}
		}

		f.SetColWidth(scriptSheet, "G", "G", 80)
		f.SetColWidth(scriptSheet, "A", "F", 18)
	}

	f.SetColWidth(portSheet, "A", "J", 18)

	buf := new(bytes.Buffer)
	if err := f.Write(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func ToConsolidatedJSON(hosts []db.ConsolidatedHost, ports []db.ConsolidatedPort, scripts []db.ConsolidatedScript) ([]byte, error) {
	output := map[string]interface{}{
		"hosts":   hosts,
		"ports":   ports,
		"scripts": scripts,
	}
	return json.MarshalIndent(output, "", "  ")
}

func ToConsolidatedTXT(ports []db.ConsolidatedPort, scripts []db.ConsolidatedScript) ([]byte, error) {
	buf := new(bytes.Buffer)

	buf.WriteString("=== Consolidated Ports ===\n\n")
	buf.WriteString(fmt.Sprintf("%-16s %-6s %-6s %-10s %-16s %-10s %-16s %s\n",
		"IP", "Port", "Proto", "State", "Service", "Version", "Product", "Extra"))
	buf.WriteString(strings.Repeat("-", 100) + "\n")

	for _, p := range ports {
		buf.WriteString(fmt.Sprintf("%-16s %-6d %-6s %-10s %-16s %-10s %-16s %s\n",
			p.IP, p.Port, p.Protocol, p.State, p.Service, p.Version, p.Product, p.ExtraInfo))
	}

	buf.WriteString("\n=== NSE Scripts ===\n\n")
	for _, s := range scripts {
		buf.WriteString(fmt.Sprintf("%s:%d/%s [%s] %s: %s\n",
			s.IP, s.Port, s.Protocol, s.Service, s.ScriptID, s.Output))
	}

	return buf.Bytes(), nil
}

func ToExcelWithScripts(results []db.ResultRow, scan *db.Scan, scripts []db.ScanScriptExport) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Scan Results"
	f.SetSheetName("Sheet1", sheetName)

	headers := []string{
		"IP", "MAC", "Hostname", "OS", "Host Status",
		"Port", "Protocol", "State", "Service", "Version",
		"Product", "Extra Info", "Reason", "Modified",
	}

	for i, h := range headers {
		cell := fmt.Sprintf("%c1", 'A'+i)
		f.SetCellValue(sheetName, cell, h)
	}

	style, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#4472C4"}, Pattern: 1},
	})
	f.SetCellStyle(sheetName, "A1", "N1", style)

	for i, r := range results {
		row := i + 2
		modified := "No"
		if r.IsModified {
			modified = "Yes"
		}
		values := []interface{}{
			r.IP, r.MAC, r.Hostname, r.OS, r.HostStatus,
			r.Port, r.Protocol, r.State, r.Service, r.Version,
			r.Product, r.ExtraInfo, r.Reason, modified,
		}
		for j, v := range values {
			cell := fmt.Sprintf("%c%d", 'A'+j, row)
			f.SetCellValue(sheetName, cell, v)
		}
	}

	if len(scripts) > 0 {
		scriptSheet := "Scripts"
		f.NewSheet(scriptSheet)

		scriptHeaders := []string{
			"IP", "Port", "Protocol", "Service", "State",
			"Script ID", "Type", "Output",
		}
		for i, h := range scriptHeaders {
			cell := fmt.Sprintf("%c1", 'A'+i)
			f.SetCellValue(scriptSheet, cell, h)
		}
		f.SetCellStyle(scriptSheet, "A1", "H1", style)

		for i, s := range scripts {
			row := i + 2
			values := []interface{}{
				s.IP, s.Port, s.Protocol, s.Service, s.State,
				s.ScriptID, s.Type, s.Output,
			}
			for j, v := range values {
				cell := fmt.Sprintf("%c%d", 'A'+j, row)
				f.SetCellValue(scriptSheet, cell, v)
			}
		}

		f.SetColWidth(scriptSheet, "H", "H", 80)
		f.SetColWidth(scriptSheet, "A", "G", 18)
	}

	f.SetColWidth(sheetName, "A", "N", 18)

	buf := new(bytes.Buffer)
	if err := f.Write(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func ToCSVWithScripts(results []db.ResultRow, scripts []db.ScanScriptExport) ([]byte, error) {
	buf := new(bytes.Buffer)
	w := csv.NewWriter(buf)

	w.Write([]string{
		"IP", "MAC", "Hostname", "OS", "Host Status",
		"Port", "Protocol", "State", "Service", "Version",
		"Product", "Extra Info", "Reason", "Modified",
	})

	for _, r := range results {
		modified := "No"
		if r.IsModified {
			modified = "Yes"
		}
		w.Write([]string{
			safeCSV(r.IP), safeCSV(r.MAC), safeCSV(r.Hostname), safeCSV(r.OS), safeCSV(r.HostStatus),
			fmt.Sprintf("%d", r.Port), safeCSV(r.Protocol), safeCSV(r.State), safeCSV(r.Service), safeCSV(r.Version),
			safeCSV(r.Product), safeCSV(r.ExtraInfo), safeCSV(r.Reason), modified,
		})
	}

	w.Write([]string{""})

	w.Write([]string{
		"IP", "Port", "Protocol", "Service", "State",
		"Script ID", "Type", "Output",
	})

	for _, s := range scripts {
		w.Write([]string{
			safeCSV(s.IP), fmt.Sprintf("%d", s.Port), safeCSV(s.Protocol), safeCSV(s.Service), safeCSV(s.State),
			safeCSV(s.ScriptID), safeCSV(s.Type), safeCSV(s.Output),
		})
	}

	w.Flush()
	return buf.Bytes(), w.Error()
}

func ToScriptsExcel(hosts []db.ConsolidatedHost, ports []db.ConsolidatedPort, scripts []db.ConsolidatedScript) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	scriptSheet := "Scripts"
	f.SetSheetName("Sheet1", scriptSheet)

	scriptHeaders := []string{
		"IP", "Port", "Protocol", "Service", "State",
		"Script ID", "Output",
	}
	for i, h := range scriptHeaders {
		cell := fmt.Sprintf("%c1", 'A'+i)
		f.SetCellValue(scriptSheet, cell, h)
	}

	style, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#4472C4"}, Pattern: 1},
	})
	f.SetCellStyle(scriptSheet, "A1", "G1", style)

	for i, s := range scripts {
		row := i + 2
		values := []interface{}{
			s.IP, s.Port, s.Protocol, s.Service, s.State,
			s.ScriptID, s.Output,
		}
		for j, v := range values {
			cell := fmt.Sprintf("%c%d", 'A'+j, row)
			f.SetCellValue(scriptSheet, cell, v)
		}
	}

	f.SetColWidth(scriptSheet, "G", "G", 80)
	f.SetColWidth(scriptSheet, "A", "F", 18)

	if len(hosts) > 0 {
		hostSheet := "Hosts"
		f.NewSheet(hostSheet)

		hostHeaders := []string{
			"IP", "MAC", "Hostname", "OS", "Status",
			"Discovery Methods", "First Seen", "Last Seen",
		}
		for i, h := range hostHeaders {
			cell := fmt.Sprintf("%c1", 'A'+i)
			f.SetCellValue(hostSheet, cell, h)
		}
		f.SetCellStyle(hostSheet, "A1", "H1", style)

		for i, h := range hosts {
			row := i + 2
			values := []interface{}{
				h.IP, h.MAC, h.Hostname, h.OS, h.Status,
				h.DiscoveryMethods, h.FirstSeen, h.LastSeen,
			}
			for j, v := range values {
				cell := fmt.Sprintf("%c%d", 'A'+j, row)
				f.SetCellValue(hostSheet, cell, v)
			}
		}
	}

	if len(ports) > 0 {
		portSheet := "Ports"
		f.NewSheet(portSheet)

		portHeaders := []string{
			"IP", "Port", "Protocol", "State", "Service", "Version",
			"Product", "Extra Info", "Changes", "Last Seen",
		}
		for i, h := range portHeaders {
			cell := fmt.Sprintf("%c1", 'A'+i)
			f.SetCellValue(portSheet, cell, h)
		}
		f.SetCellStyle(portSheet, "A1", "J1", style)

		for i, p := range ports {
			row := i + 2
			values := []interface{}{
				p.IP, p.Port, p.Protocol, p.State, p.Service, p.Version,
				p.Product, p.ExtraInfo, p.ChangeCount, p.LastSeen,
			}
			for j, v := range values {
				cell := fmt.Sprintf("%c%d", 'A'+j, row)
				f.SetCellValue(portSheet, cell, v)
			}
		}

		f.SetColWidth(portSheet, "A", "J", 18)
	}

	buf := new(bytes.Buffer)
	if err := f.Write(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func ToScriptsCSV(scripts []db.ConsolidatedScript) ([]byte, error) {
	buf := new(bytes.Buffer)
	w := csv.NewWriter(buf)

	w.Write([]string{
		"IP", "Port", "Protocol", "Service", "State",
		"Script ID", "Output",
	})

	for _, s := range scripts {
		w.Write([]string{
			safeCSV(s.IP), fmt.Sprintf("%d", s.Port), safeCSV(s.Protocol), safeCSV(s.Service), safeCSV(s.State),
			safeCSV(s.ScriptID), safeCSV(s.Output),
		})
	}

	w.Flush()
	return buf.Bytes(), w.Error()
}

func ToScriptsTXT(scripts []db.ConsolidatedScript) ([]byte, error) {
	buf := new(bytes.Buffer)
	buf.WriteString("=== NSE Scripts ===\n\n")
	buf.WriteString(fmt.Sprintf("%-16s %-6s %-6s %-16s %-10s %-20s %s\n",
		"IP", "Port", "Proto", "Service", "State", "Script ID", "Output"))
	buf.WriteString(strings.Repeat("-", 120) + "\n")
	for _, s := range scripts {
		out := strings.ReplaceAll(s.Output, "\n", "\\n")
		if len(out) > 80 { out = out[:80] + "..." }
		buf.WriteString(fmt.Sprintf("%-16s %-6d %-6s %-16s %-10s %-20s %s\n",
			s.IP, s.Port, s.Protocol, s.Service, s.State, s.ScriptID, out))
	}
	return buf.Bytes(), nil
}

func ToXML(results []db.ResultRow, scan *db.Scan) ([]byte, error) {
	hosts := make(map[string][]db.ResultRow)
	for _, r := range results {
		hosts[r.IP] = append(hosts[r.IP], r)
	}

	var buf bytes.Buffer
	buf.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	buf.WriteString("<!DOCTYPE nmaprun>\n")
	buf.WriteString("<nmaprun scanner=\"nexusmap\" args=\"system-generated\" start=\"0\" version=\"7.94\">\n")
	buf.WriteString("<scaninfo type=\"syn\" protocol=\"tcp\" numservices=\"1000\" services=\"1-1000\"/>\n")
	buf.WriteString("<verbose level=\"0\"/>\n")
	buf.WriteString("<debugging level=\"0\"/>\n")

	for ip, ports := range hosts {
		h := ports[0]
		buf.WriteString(fmt.Sprintf("<host starttime=\"0\" endtime=\"0\">\n"))
		buf.WriteString(fmt.Sprintf("<status state=\"%s\" reason=\"generated\"/>\n", h.HostStatus))
		buf.WriteString(fmt.Sprintf("<address addr=\"%s\" addrtype=\"ipv4\"/>\n", ip))
		if h.MAC != "" {
			buf.WriteString(fmt.Sprintf("<address addr=\"%s\" addrtype=\"mac\"/>\n", h.MAC))
		}
		if h.Hostname != "" {
			buf.WriteString(fmt.Sprintf("<hostnames><hostname name=\"%s\" type=\"user\"/></hostnames>\n", h.Hostname))
		}
		buf.WriteString("<ports>\n")
		for _, p := range ports {
			buf.WriteString(fmt.Sprintf("<port protocol=\"%s\" portid=\"%d\">", p.Protocol, p.Port))
			buf.WriteString(fmt.Sprintf("<state state=\"%s\" reason=\"%s\"/>", p.State, p.Reason))
			buf.WriteString(fmt.Sprintf("<service name=\"%s\"", p.Service))
			if p.Product != "" {
				buf.WriteString(fmt.Sprintf(" product=\"%s\"", p.Product))
			}
			if p.Version != "" {
				buf.WriteString(fmt.Sprintf(" version=\"%s\"", p.Version))
			}
			if p.ExtraInfo != "" {
				buf.WriteString(fmt.Sprintf(" extrainfo=\"%s\"", p.ExtraInfo))
			}
			buf.WriteString("/>\n")
			buf.WriteString("</port>\n")
		}
		buf.WriteString("</ports>\n")
		if h.OS != "" {
			buf.WriteString(fmt.Sprintf("<os><osmatch name=\"%s\" accuracy=\"100\"/></os>\n", h.OS))
		}
		buf.WriteString("</host>\n")
	}

	buf.WriteString("<runstats><finished time=\"0\" timestr=\"generated\"/><hosts up=\"1\" down=\"0\" total=\"1\"/></runstats>\n")
	buf.WriteString("</nmaprun>\n")

	return buf.Bytes(), nil
}

func ToNmap(results []db.ResultRow, scan *db.Scan) ([]byte, error) {
	if scan == nil {
		scan = &db.Scan{Profile: "unknown", Target: "unknown"}
	}

	var buf bytes.Buffer
	buf.WriteString("# Nmap 7.94 scan initiated (system-generated)\n")
	buf.WriteString(fmt.Sprintf("# Nmap scan report for %s\n", scan.Target))
	buf.WriteString(fmt.Sprintf("# Profile: %s\n", scan.Profile))
	buf.WriteString("Host is up\n")

	hosts := make(map[string][]db.ResultRow)
	for _, r := range results {
		hosts[r.IP] = append(hosts[r.IP], r)
	}

	for ip, ports := range hosts {
		h := ports[0]
		buf.WriteString(fmt.Sprintf("\nNmap scan report for %s", ip))
		if h.Hostname != "" {
			buf.WriteString(fmt.Sprintf(" (%s)", h.Hostname))
		}
		buf.WriteString(fmt.Sprintf("\nHost is up (%s)\n", h.HostStatus))
		if h.OS != "" {
			buf.WriteString(fmt.Sprintf("OS: %s\n", h.OS))
		}
		buf.WriteString("PORT      STATE    SERVICE       VERSION\n")
		for _, p := range ports {
			if p.Port > 0 {
				ver := p.Service
				if p.Version != "" {
					ver += " " + p.Version
				}
				buf.WriteString(fmt.Sprintf("%d/%-8s %-8s %s\n", p.Port, p.Protocol, p.State, ver))
			}
		}
	}
	buf.WriteString(fmt.Sprintf("\n# Scan complete: %d hosts up\n", len(hosts)))
	return buf.Bytes(), nil
}

func ToGnmap(results []db.ResultRow, scan *db.Scan) ([]byte, error) {
	if scan == nil {
		scan = &db.Scan{Profile: "unknown", Target: "unknown"}
	}

	var buf bytes.Buffer

	hosts := make(map[string][]db.ResultRow)
	for _, r := range results {
		hosts[r.IP] = append(hosts[r.IP], r)
	}

	for ip, ports := range hosts {
		h := ports[0]
		buf.WriteString(fmt.Sprintf("Host: %s", ip))
		if h.Hostname != "" {
			buf.WriteString(fmt.Sprintf(" (%s)", h.Hostname))
		}
		buf.WriteString(fmt.Sprintf(" ()\tStatus: %s\n", h.HostStatus))

		var openPorts []string
		for _, p := range ports {
			if p.Port > 0 {
				openPorts = append(openPorts, fmt.Sprintf("%d/%s/%s//%s///", p.Port, p.Protocol, p.State, p.Service))
			}
		}
		if len(openPorts) > 0 {
			buf.WriteString(fmt.Sprintf("Ports: %s\n", strings.Join(openPorts, ", ")))
		}
		if h.OS != "" {
			buf.WriteString(fmt.Sprintf("OS: %s\n", h.OS))
		}
	}
	buf.WriteString("# Scan complete\n")
	return buf.Bytes(), nil
}
