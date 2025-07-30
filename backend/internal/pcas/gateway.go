package pcas

import (
	"context"
	"fmt"
	"io"
	"log"
	"sync"

	"github.com/pcas/dreams-cli/backend/internal/distiller"
	busv1 "github.com/pcas/dreams-cli/backend/gen/pcas/bus/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Gateway struct {
	address   string
	conn      *grpc.ClientConn
	client    busv1.EventBusServiceClient
	publisher *Publisher
	distiller *distiller.Distiller
}

func NewGateway(address string) (*Gateway, error) {
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PCAS: %w", err)
	}

	return &Gateway{
		address:   address,
		conn:      conn,
		client:    busv1.NewEventBusServiceClient(conn),
		publisher: NewPublisher(conn),
		distiller: distiller.NewDistiller(),
	}, nil
}

func (g *Gateway) Close() error {
	if g.conn != nil {
		return g.conn.Close()
	}
	return nil
}

func (g *Gateway) ProcessStream(ctx context.Context, eventType string, audioFromClient <-chan []byte, textToClient chan<- []byte, userID string) error {
	stream, err := g.client.InteractStream(ctx)
	if err != nil {
		return fmt.Errorf("failed to create interact stream: %w", err)
	}

	configReq := &busv1.InteractRequest{
		RequestType: &busv1.InteractRequest_Config{
			Config: &busv1.StreamConfig{
				EventType: eventType,
				Attributes: map[string]string{
					"source": "dreamscribe",
				},
			},
		},
	}
	if err := stream.Send(configReq); err != nil {
		return fmt.Errorf("failed to send config: %w", err)
	}

	resp, err := stream.Recv()
	if err != nil {
		return fmt.Errorf("failed to receive ready response: %w", err)
	}

	ready, ok := resp.ResponseType.(*busv1.InteractResponse_Ready)
	if !ok {
		return fmt.Errorf("expected ready response, got %T", resp.ResponseType)
	}
	log.Printf("Stream established with ID: %s", ready.Ready.StreamId)

	var wg sync.WaitGroup
	errChan := make(chan error, 2)

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case audio, ok := <-audioFromClient:
				if !ok {
					if err := stream.Send(&busv1.InteractRequest{
						RequestType: &busv1.InteractRequest_ClientEnd{
							ClientEnd: &busv1.StreamEnd{},
						},
					}); err != nil {
						errChan <- fmt.Errorf("failed to send client end: %w", err)
						return
					}
					log.Println("Client audio stream closed, sent end signal to PCAS")
					return
				}

				dataReq := &busv1.InteractRequest{
					RequestType: &busv1.InteractRequest_Data{
						Data: &busv1.StreamData{
							Content: audio,
						},
					},
				}
				if err := stream.Send(dataReq); err != nil {
					errChan <- fmt.Errorf("failed to send audio data: %w", err)
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
		defer close(textToClient)
		
		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				log.Println("PCAS stream ended")
				return
			}
			if err != nil {
				errChan <- fmt.Errorf("failed to receive from PCAS: %w", err)
				return
			}

			switch resp := resp.ResponseType.(type) {
			case *busv1.InteractResponse_Data:
				text := string(resp.Data.Content)
				
				if sentence := g.distiller.Process(text); sentence != "" {
					if err := g.publisher.PublishMemory(ctx, sentence, userID); err != nil {
						log.Printf("Failed to publish memory: %v", err)
					} else {
						log.Printf("Published memory event: %s", sentence)
					}
				}
				
				textToClient <- resp.Data.Content
			case *busv1.InteractResponse_Error:
				errChan <- fmt.Errorf("PCAS error: %s", resp.Error.Message)
				return
			case *busv1.InteractResponse_ServerEnd:
				log.Println("PCAS server ended stream")
				return
			}
		}
	}()

	wg.Wait()

	select {
	case err := <-errChan:
		return err
	default:
		return nil
	}
}