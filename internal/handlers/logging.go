package handlers

import (
	"fmt"
	"log"
	"os"
	"time"
)

const (
	LogLevelDebug = 0
	LogLevelInfo  = 1
	LogLevelWarn  = 2
	LogLevelError = 3
)

var currentLogLevel = LogLevelInfo

func init() {
	switch os.Getenv("LOG_LEVEL") {
	case "debug":
		currentLogLevel = LogLevelDebug
	case "warn":
		currentLogLevel = LogLevelWarn
	case "error":
		currentLogLevel = LogLevelError
	default:
		currentLogLevel = LogLevelInfo
	}
}

func LogDebug(msg string, fields ...map[string]interface{}) {
	if currentLogLevel <= LogLevelDebug {
		logLine("DEBUG", msg, fields)
	}
}

func LogInfo(msg string, fields ...map[string]interface{}) {
	if currentLogLevel <= LogLevelInfo {
		logLine("INFO", msg, fields)
	}
}

func LogWarn(msg string, fields ...map[string]interface{}) {
	if currentLogLevel <= LogLevelWarn {
		logLine("WARN", msg, fields)
	}
}

func LogError(msg string, fields ...map[string]interface{}) {
	if currentLogLevel <= LogLevelError {
		logLine("ERROR", msg, fields)
	}
}

func logLine(level, msg string, fields []map[string]interface{}) {
	timestamp := time.Now().Format("2006-01-02T15:04:05.000Z07:00")
	if len(fields) > 0 && len(fields[0]) > 0 {
		f := fields[0]
		parts := make([]string, 0, len(f))
		for k, v := range f {
			parts = append(parts, fmt.Sprintf("%s=%v", k, v))
		}
		log.Printf("[%s] %s %s | %s", timestamp, level, msg, formatFields(parts))
	} else {
		log.Printf("[%s] %s | %s", timestamp, level, msg)
	}
}

func formatFields(parts []string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += " "
		}
		result += p
	}
	return result
}
