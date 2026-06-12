package handlers

import (
	"fmt"
	"log"
	"os"
	"sync/atomic"
	"time"
)

const (
	LogLevelDebug = 0
	LogLevelInfo  = 1
	LogLevelWarn  = 2
	LogLevelError = 3
)

var currentLogLevel atomic.Int32

func init() {
	level := int32(LogLevelInfo)
	switch os.Getenv("LOG_LEVEL") {
	case "debug":
		level = LogLevelDebug
	case "warn":
		level = LogLevelWarn
	case "error":
		level = LogLevelError
	}
	currentLogLevel.Store(level)
}

func LogDebug(msg string, fields ...map[string]interface{}) {
	if currentLogLevel.Load() <= LogLevelDebug {
		logLine("DEBUG", msg, fields)
	}
}

func LogInfo(msg string, fields ...map[string]interface{}) {
	if currentLogLevel.Load() <= LogLevelInfo {
		logLine("INFO", msg, fields)
	}
}

func LogWarn(msg string, fields ...map[string]interface{}) {
	if currentLogLevel.Load() <= LogLevelWarn {
		logLine("WARN", msg, fields)
	}
}

func LogError(msg string, fields ...map[string]interface{}) {
	if currentLogLevel.Load() <= LogLevelError {
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
