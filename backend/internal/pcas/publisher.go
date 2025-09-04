package pcas

import (
    "context"

    "github.com/google/uuid"
    busv1 "github.com/pcas/dreams-cli/backend/gen/pcas/bus/v1"
    eventsv1 "github.com/pcas/dreams-cli/backend/gen/pcas/events/v1"
    "google.golang.org/grpc"
    "google.golang.org/protobuf/types/known/anypb"
    "google.golang.org/protobuf/types/known/structpb"
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

// PublishAdminPolicyAddRule emits an admin policy rule add event to PCAS.
// Attributes may include an admin_token expected by the PCAS server.
func (p *Publisher) PublishAdminPolicyAddRule(ctx context.Context, adminToken, eventType, provider, promptTemplate, name string) error {
    payload := map[string]any{
        "event_type":      eventType,
        "provider":        provider,
    }
    if promptTemplate != "" {
        payload["prompt_template"] = promptTemplate
    }
    if name != "" {
        payload["name"] = name
    }
    st, _ := structpb.NewStruct(payload)
    anyPayload, _ := anypb.New(st)

    attrs := map[string]string{}
    if adminToken != "" {
        attrs["admin_token"] = adminToken
    }

    evt := &eventsv1.Event{
        Id:              uuid.New().String(),
        Specversion:     "1.0",
        Type:            "pcas.admin.policy.add_rule.v1",
        Source:          "/d-app/dreamscribe",
        Subject:         "register rule",
        Time:            timestamppb.Now(),
        Attributes:      attrs,
        Datacontenttype: "application/json",
        Data:            anyPayload,
    }
    _, err := p.client.Publish(ctx, evt)
    return err
}
