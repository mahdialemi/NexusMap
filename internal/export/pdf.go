package export

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/mahdialemi/NexusMap/internal/db"
)

func ToPDF(results []db.ResultRow, scan *db.Scan) ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetAutoPageBreak(true, 20)
	pdf.SetMargins(10, 10, 10)

	hostMap := groupByHost(results)

	pdf.AddPage()
	drawHeader(pdf, scan)
	drawSummary(pdf, hostMap)
	pdf.Ln(4)
	drawHostTable(pdf, hostMap)
	pdf.Ln(4)
	drawPortTable(pdf, hostMap)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func groupByHost(results []db.ResultRow) map[string][]db.ResultRow {
	m := make(map[string][]db.ResultRow)
	for _, r := range results {
		m[r.IP] = append(m[r.IP], r)
	}
	return m
}

func drawHeader(pdf *fpdf.Fpdf, scan *db.Scan) {
	pdf.SetFont("Helvetica", "B", 18)
	pdf.SetTextColor(79, 196, 207)
	pdf.CellFormat(0, 12, "NexusMap Scan Report", "", 1, "L", false, 0, "")
	pdf.SetTextColor(100, 100, 120)
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(0, 5, fmt.Sprintf("Target: %s  |  Profile: %s  |  Scan #%d", scan.Target, scan.Profile, scan.ID), "", 1, "L", false, 0, "")
	started := ""
	if !scan.StartedAt.IsZero() {
		started = scan.StartedAt.Format("2006-01-02 15:04:05")
	}
	completed := ""
	if scan.CompletedAt != nil && !scan.CompletedAt.IsZero() {
		completed = scan.CompletedAt.Format("2006-01-02 15:04:05")
	}
	pdf.CellFormat(0, 5, fmt.Sprintf("Started: %s  |  Completed: %s  |  %s", started, completed, time.Now().Format("2006-01-02 15:04")), "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	pdf.Ln(4)
	pdf.SetDrawColor(79, 196, 207)
	pdf.SetLineWidth(0.8)
	pw, _ := pdf.GetPageSize()
	pdf.Line(10, pdf.GetY(), pw-10, pdf.GetY())
	pdf.Ln(6)
}

func drawSummary(pdf *fpdf.Fpdf, hostMap map[string][]db.ResultRow) {
	totalHosts := len(hostMap)
	totalOpen := 0
	totalPorts := 0
	for _, rows := range hostMap {
		for _, r := range rows {
			if r.Port != 0 {
				totalPorts++
				if r.State == "open" {
					totalOpen++
				}
			}
		}
	}

	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetTextColor(60, 60, 80)
	pdf.CellFormat(0, 6, "Summary", "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Helvetica", "", 9)

	pw, _ := pdf.GetPageSize()
	colW := (pw - 20) / 5
	rowH := 7.0

	pdf.SetFillColor(245, 245, 250)
	pdf.SetDrawColor(220, 220, 230)
	pdf.RoundedRect(10, pdf.GetY(), colW*5, rowH, 2, "1234", "FD")

	y := pdf.GetY()
	pdf.SetXY(10, y)
	pdf.CellFormat(colW, rowH, fmt.Sprintf("  Hosts: %d", totalHosts), "", 0, "L", false, 0, "")
	pdf.CellFormat(colW, rowH, fmt.Sprintf("Ports: %d", totalPorts), "", 0, "L", false, 0, "")
	pdf.CellFormat(colW, rowH, fmt.Sprintf("Open: %d", totalOpen), "", 0, "L", false, 0, "")
	pdf.CellFormat(colW*2, rowH, fmt.Sprintf("Closed/Filtered: %d", totalPorts-totalOpen), "", 0, "L", false, 0, "")
	pdf.Ln(rowH + 2)
}

func drawHostTable(pdf *fpdf.Fpdf, hostMap map[string][]db.ResultRow) {
	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetTextColor(60, 60, 80)
	pdf.CellFormat(0, 6, "Hosts", "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	colW := []float64{40, 55, 50, 30, 50}
	header := []string{"IP", "Hostname", "MAC", "OS", "Status"}
	rowH := 6.0

	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetFillColor(79, 196, 207)
	pdf.SetTextColor(255, 255, 255)
	for i, h := range header {
		pdf.CellFormat(colW[i], rowH, h, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(rowH)

	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(40, 40, 50)
	fill := false
	for ip, rows := range hostMap {
		r := rows[0]
		if fill {
			pdf.SetFillColor(245, 245, 250)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}
		pdf.CellFormat(colW[0], rowH, ip, "1", 0, "C", true, 0, "")
		pdf.CellFormat(colW[1], rowH, truncate(r.Hostname, 24), "1", 0, "C", true, 0, "")
		pdf.CellFormat(colW[2], rowH, truncate(r.MAC, 20), "1", 0, "C", true, 0, "")
		pdf.CellFormat(colW[3], rowH, truncate(r.OS, 14), "1", 0, "C", true, 0, "")
		status := r.HostStatus
		if status == "" {
			status = "up"
		}
		pdf.CellFormat(colW[4], rowH, status, "1", 0, "C", true, 0, "")
		pdf.Ln(rowH)
		fill = !fill
	}
	pdf.Ln(4)
}

func drawPortTable(pdf *fpdf.Fpdf, hostMap map[string][]db.ResultRow) {
	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetTextColor(60, 60, 80)
	pdf.CellFormat(0, 6, "Ports", "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	colW := []float64{35, 28, 18, 22, 42, 48, 42}
	header := []string{"IP", "Port", "Proto", "State", "Service", "Product", "Version"}
	rowH := 5.5

	pdf.SetFont("Helvetica", "B", 7.5)
	pdf.SetFillColor(79, 196, 207)
	pdf.SetTextColor(255, 255, 255)
	for i, h := range header {
		pdf.CellFormat(colW[i], rowH, h, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(rowH)

	pdf.SetFont("Helvetica", "", 7.5)
	pdf.SetTextColor(40, 40, 50)
	fill := false
	totalRows := 0
	for ip, rows := range hostMap {
		for _, r := range rows {
			if r.Port == 0 {
				continue
			}
			if totalRows > 0 && totalRows%35 == 0 {
				pdf.AddPage()
				pdf.SetFont("Helvetica", "B", 7.5)
				pdf.SetFillColor(79, 196, 207)
				pdf.SetTextColor(255, 255, 255)
				for i, h := range header {
					pdf.CellFormat(colW[i], rowH, h, "1", 0, "C", true, 0, "")
				}
				pdf.Ln(rowH)
				pdf.SetFont("Helvetica", "", 7.5)
				pdf.SetTextColor(40, 40, 50)
			}

			if fill {
				pdf.SetFillColor(245, 245, 250)
			} else {
				pdf.SetFillColor(255, 255, 255)
			}
			portStr := fmt.Sprintf("%d/%s", r.Port, r.Protocol)
			pdf.CellFormat(colW[0], rowH, ip, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[1], rowH, portStr, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[2], rowH, r.Protocol, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[3], rowH, r.State, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[4], rowH, truncate(r.Service, 16), "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[5], rowH, truncate(r.Product, 20), "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[6], rowH, truncate(r.Version, 18), "1", 0, "C", true, 0, "")
			pdf.Ln(rowH)
			fill = !fill
			totalRows++
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.TrimSpace(s[:n]) + "..."
}
