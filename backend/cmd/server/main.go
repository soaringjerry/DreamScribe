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

	// Register API routes first
	api.RegisterRoutes(router, cfg)

	// Serve static files if STATIC_PATH is set
	staticPath := os.Getenv("STATIC_PATH")
	if staticPath != "" {
		// Serve index.html for root path
		router.StaticFile("/", staticPath+"/index.html")
		// Serve static assets
		router.Static("/assets", staticPath+"/assets")
		// Serve other static files
		router.StaticFile("/vite.svg", staticPath+"/vite.svg")
		
		// Catch-all route for SPA (Single Page Application)
		// This should be registered after API routes to avoid conflicts
		router.NoRoute(func(c *gin.Context) {
			// Only serve index.html for non-API routes
			path := c.Request.URL.Path
			if len(path) >= 4 && path[:4] == "/ws/" {
				return
			}
			if len(path) >= 5 && path[:5] == "/api/" {
				return
			}
			c.File(staticPath + "/index.html")
		})
	}

	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	fmt.Printf("Backend server started at http://%s\n", addr)
	
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}