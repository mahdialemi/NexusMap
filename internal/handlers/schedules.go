package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mahdialemi/NexusMap/v2/internal/db"
	"github.com/mahdialemi/NexusMap/v2/internal/nmap"
)

func (s *Server) HandleGetSchedules(w http.ResponseWriter, r *http.Request) {
	projectID := parseIntID(r.PathValue("id"))
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}
	schedules, err := s.DB.GetSchedules(projectID)
	if err != nil {
		serverError(w, err)
		return
	}
	if schedules == nil {
		schedules = []db.ScanSchedule{}
	}
	jsonResponse(w, 200, schedules)
}

func (s *Server) HandleCreateSchedule(w http.ResponseWriter, r *http.Request) {
	projectID := parseIntID(r.PathValue("id"))
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}
	var req struct {
		Name            string `json:"name"`
		Profile         string `json:"profile"`
		Target          string `json:"target"`
		TriggerType     string `json:"trigger_type"`
		ScheduledAt     string `json:"scheduled_at"`
		DependsOnScanID *int   `json:"depends_on_scan_id,omitempty"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request"})
		return
	}
	if req.Target == "" {
		jsonResponse(w, 400, map[string]string{"error": "target is required"})
		return
	}
	if req.TriggerType == "" {
		req.TriggerType = "time"
	}
	if req.TriggerType == "time" && req.ScheduledAt == "" {
		jsonResponse(w, 400, map[string]string{"error": "scheduled_at is required for time trigger"})
		return
	}
	if req.TriggerType == "dependency" && req.DependsOnScanID == nil {
		jsonResponse(w, 400, map[string]string{"error": "depends_on_scan_id is required for dependency trigger"})
		return
	}
	if req.Name == "" {
		req.Name = req.Target
	}
	id, err := s.DB.CreateSchedule(projectID, req.Name, req.Profile, req.Target, req.TriggerType, req.ScheduledAt, req.DependsOnScanID)
	if err != nil {
		serverError(w, err)
		return
	}
	s.LogAndNotify("schedule_created", "Schedule #"+strconv.FormatInt(id, 10)+" for "+req.Target, getRequestUser(r).Username)
	jsonResponse(w, 200, map[string]int64{"id": id})
}

func (s *Server) HandleDeleteSchedule(w http.ResponseWriter, r *http.Request) {
	projectID := parseIntID(r.PathValue("id"))
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}
	scheduleID := parseIntID(r.PathValue("schedule_id"))
	if err := s.DB.DeleteSchedule(scheduleID); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) StartScheduler() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		schedules, err := s.DB.GetDueSchedules()
		if err != nil {
			log.Printf("scheduler: get due: %v", err)
			continue
		}
		for _, sc := range schedules {
			// For dependency type, verify the dependent scan has finished
			if sc.TriggerType == "dependency" {
				if sc.DependsOnScanID == nil {
					s.DB.MarkScheduleRun(sc.ID)
					continue
				}
				depScan, err := s.DB.GetScan(*sc.DependsOnScanID)
				if err != nil {
					log.Printf("scheduler: schedule %d: dep scan %d not found, skipping", sc.ID, *sc.DependsOnScanID)
					s.DB.MarkScheduleRun(sc.ID)
					continue
				}
				if depScan.Status == "running" || depScan.Status == "pending" {
					continue // not finished yet
				}
			}

			sid, err := s.DB.CreateScan(sc.ProjectID, sc.Profile, sc.Target, "", &sc.ID)
			if err != nil {
				log.Printf("scheduler: create scan for schedule %d: %v", sc.ID, err)
				continue
			}
			if err := s.DB.MarkScheduleRun(sc.ID); err != nil {
				log.Printf("scheduler: mark schedule %d run: %v", sc.ID, err)
			}
			scanID := int(sid)
			if err := s.DB.StartScan(scanID); err != nil {
				log.Printf("scheduler: start scan %d: %v", scanID, err)
				continue
			}
			args := nmap.GetProfileArgs(sc.Profile)
			args = append(args, sc.Target)
			cmdStr := "nmap " + strings.Join(args, " ")
			s.ScanWG.Add(1)
			go func() {
				defer s.ScanWG.Done()
				s.runCommand(scanID, cmdStr, sc.Target, "system")
			}()
			s.LogAndNotify("scheduled_scan", "Scheduled scan #"+strconv.Itoa(scanID)+" for "+sc.Target, "system")
		}
	}
}
