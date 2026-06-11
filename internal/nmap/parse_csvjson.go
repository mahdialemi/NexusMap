package nmap

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/mahdialemi/NexusMap/v2/internal/db"
)

func ParseCSV(data string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, error) {
	r := csv.NewReader(strings.NewReader(data))
	records, err := r.ReadAll()
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("CSV parse error: %w", err)
	}
	if len(records) < 2 {
		return nil, nil, nil, nil, fmt.Errorf("CSV file is empty or has no data rows")
	}

	header := records[0]
	colMap := make(map[string]int)
	for i, h := range header {
		colMap[strings.TrimSpace(strings.ToLower(h))] = i
	}

	hostMap := make(map[string]*db.Host)
	var ports []db.Port

	for rowIdx := 1; rowIdx < len(records); rowIdx++ {
		cols := records[rowIdx]
		if len(cols) < 7 {
			continue
		}

		ip := getCol(cols, colMap, "ip")
		if ip == "" {
			continue
		}

		if _, ok := hostMap[ip]; !ok {
			hostMap[ip] = &db.Host{
				IP:       ip,
				MAC:      getCol(cols, colMap, "mac"),
				Hostname: getCol(cols, colMap, "hostname"),
				OS:       getCol(cols, colMap, "os"),
			}
		}

		portNum, _ := strconv.Atoi(getCol(cols, colMap, "port"))
		if portNum == 0 {
			continue
		}

		port := db.Port{
			IP:        ip,
			Port:      portNum,
			Protocol:  getCol(cols, colMap, "protocol"),
			State:     getCol(cols, colMap, "state"),
			Service:   getCol(cols, colMap, "service"),
			Version:   getCol(cols, colMap, "version"),
			Product:   getCol(cols, colMap, "product"),
			ExtraInfo: getCol(cols, colMap, "extra_info"),
			Reason:    getCol(cols, colMap, "reason"),
		}
		ports = append(ports, port)
	}

	hosts := make([]db.Host, 0, len(hostMap))
	for _, h := range hostMap {
		hosts = append(hosts, *h)
	}

	return hosts, ports, nil, nil, nil
}

func ParseJSON(data string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, error) {
	var rows []map[string]interface{}
	if err := json.Unmarshal([]byte(data), &rows); err != nil {
		return nil, nil, nil, nil, fmt.Errorf("JSON parse error: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil, nil, nil, fmt.Errorf("JSON array is empty")
	}

	hostMap := make(map[string]*db.Host)
	var ports []db.Port

	for _, row := range rows {
		ip, _ := row["ip"].(string)
		if ip == "" {
			continue
		}

		if _, ok := hostMap[ip]; !ok {
			mac, _ := row["mac"].(string)
			hostname, _ := row["hostname"].(string)
			os, _ := row["os"].(string)
			hostMap[ip] = &db.Host{
				IP:       ip,
				MAC:      mac,
				Hostname: hostname,
				OS:       os,
			}
		}

		var portNum int
		switch v := row["port"].(type) {
		case float64:
			portNum = int(v)
		case int:
			portNum = v
		case string:
			portNum, _ = strconv.Atoi(v)
		}
		if portNum == 0 {
			continue
		}

		protocol, _ := row["protocol"].(string)
		state, _ := row["state"].(string)
		service, _ := row["service"].(string)
		version, _ := row["version"].(string)
		product, _ := row["product"].(string)
		extraInfo, _ := row["extra_info"].(string)
		reason, _ := row["reason"].(string)

		port := db.Port{
			IP:        ip,
			Port:      portNum,
			Protocol:  protocol,
			State:     state,
			Service:   service,
			Version:   version,
			Product:   product,
			ExtraInfo: extraInfo,
			Reason:    reason,
		}
		ports = append(ports, port)
	}

	hosts := make([]db.Host, 0, len(hostMap))
	for _, h := range hostMap {
		hosts = append(hosts, *h)
	}

	return hosts, ports, nil, nil, nil
}

func getCol(cols []string, colMap map[string]int, key string) string {
	idx, ok := colMap[key]
	if !ok || idx >= len(cols) {
		return ""
	}
	return strings.TrimSpace(cols[idx])
}
