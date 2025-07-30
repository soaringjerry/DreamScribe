package pcas

import (
	"context"

	"github.com/google/uuid"
	busv1 "github.com/pcas/dreams-cli/backend/gen/pcas/bus/v1"
	eventsv1 "github.com/soaringjerry/pcas/gen/go/pcas/events/v1"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Publisher struct {
	client busv1.EventBusServiceClient
}

func NewPublisher(conn *grpc.ClientConn) *Publisher {
	return &Publisher{
		client: busv1.NewEventBusServiceClient(conn),
	}
}

func (p *Publisher) PublishMemory(ctx context.Context, text, userID string) error {
	eventID := uuid.New().String()
	event := &eventsv1.Event{
		Id:          eventID,
		Specversion: "1.0",
		Type:        "pcas.memory.create.v1",
		Source:      "/d-app/dreamscribe",
		Subject:     text,
		Time:        timestamppb.Now(),
		UserId:      userID,
	}

	_, err := p.client.Publish(ctx, event)
	return err
}