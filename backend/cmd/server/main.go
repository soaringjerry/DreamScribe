package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/pcas/dreams-cli/backend/internal/api"
	"github.com/pcas/dreams-cli/backend/internal/config"
)

func main() {
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "../../configs/config.example.yaml"
	}

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	api.RegisterRoutes(router, cfg)

	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	fmt.Printf("Backend server started at http://%s\n", addr)
	
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}