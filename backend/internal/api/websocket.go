package api

import (
	"context"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pcas/dreams-cli/backend/internal/config"
	"github.com/pcas/dreams-cli/backend/internal/pcas"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Handler struct {
	config *config.Config
}

func RegisterRoutes(router *gin.Engine, cfg *config.Config) {
    h := &Handler{config: cfg}
    router.GET("/ws/transcribe", h.HandleTranscription)
    // API routes for capability streams (translate/summarize/chat)
    h.registerCapabilities(router)
}

func (h *Handler) HandleTranscription(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("New WebSocket connection established from %s", c.ClientIP())

	audioFromClient := make(chan []byte, 10)
	textToClient := make(chan []byte, 10)

	gateway, err := pcas.NewGateway(h.config.PCAS.Address)
	if err != nil {
		log.Printf("Failed to create PCAS gateway: %v", err)
		if err := conn.WriteMessage(websocket.TextMessage, []byte("Failed to connect to transcription service")); err != nil {
			log.Printf("Failed to write error message to client: %v", err)
		}
		return
	}
	defer gateway.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		userID := "default-user"
		if err := gateway.ProcessStream(ctx, h.config.PCAS.EventType, audioFromClient, textToClient, userID); err != nil {
			log.Printf("PCAS gateway error: %v", err)
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case text, ok := <-textToClient:
				if !ok {
					log.Println("Text channel closed")
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, text); err != nil {
					log.Printf("Failed to write text message: %v", err)
					cancel()
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(audioFromClient)
		
		for {
			messageType, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket error: %v", err)
				}
				cancel()
				return
			}

			if messageType == websocket.BinaryMessage {
				select {
				case audioFromClient <- message:
				case <-ctx.Done():
					return
				}
			} else {
				log.Printf("Received non-binary message type: %d", messageType)
			}
		}
	}()

	wg.Wait()
	log.Printf("WebSocket connection closed")
}
