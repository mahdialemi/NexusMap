package banner

import (
	"fmt"

	"github.com/mahdialemi/NexusMap/internal/version"
)

var Art = fmt.Sprintf(`
  ========================================
        N E X U S M A P   %s
         Network Scanner GUI
  ========================================

`, version.Version)
