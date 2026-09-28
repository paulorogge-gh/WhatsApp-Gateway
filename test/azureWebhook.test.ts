import { describe, expect, it } from "vitest";
import { parseAzureEventGridPayload } from "../src/providers/azure/azureWebhook.js";

describe("parseAzureEventGridPayload", () => {
  it("responde o handshake de validacao da subscription", () => {
    const body = [
      {
        id: "evt-1",
        eventType: "Microsoft.EventGrid.SubscriptionValidationEvent",
        data: { validationCode: "abc-123", validationUrl: "https://..." },
      },
    ];

    const result = parseAzureEventGridPayload(body);

    expect(result).toEqual({ kind: "validation", validationResponse: "abc-123" });
  });

  it("normaliza uma mensagem de texto recebida", () => {
    const body = [
      {
        id: "evt-2",
        eventType: "Microsoft.Communication.AdvancedMessageReceived",
        eventTime: "2024-01-01T00:00:00Z",
        data: {
          content: "Ola",
          channelType: "whatsapp",
          messageType: "text",
          from: "sender@id",
          to: "channel-guid-123",
          messageId: "msg-1",
          receivedTimestamp: "2024-01-01T00:00:01Z",
        },
      },
    ];

    const events = parseAzureEventGridPayload(body);

    expect(events).toEqual([
      {
        kind: "message",
        message: expect.objectContaining({
          provider: "azure",
          messageId: "msg-1",
          from: "sender@id",
          routingKey: "channel-guid-123",
          type: "text",
          text: "Ola",
        }),
      },
    ]);
  });

  it("normaliza uma atualizacao de status de entrega com erro", () => {
    const body = [
      {
        id: "evt-3",
        eventType: "Microsoft.Communication.AdvancedMessageDeliveryStatusUpdated",
        data: {
          messageId: "msg-2",
          status: "Failed",
          channelType: "whatsapp",
          from: "channel-guid-123",
          to: "receiver@id",
          receivedTimestamp: "2024-01-01T00:00:02Z",
          error: { channelCode: "131026", channelMessage: "Message Undeliverable." },
        },
      },
    ];

    const events = parseAzureEventGridPayload(body);

    expect(events).toEqual([
      {
        kind: "status",
        status: expect.objectContaining({
          provider: "azure",
          providerMessageId: "msg-2",
          routingKey: "channel-guid-123",
          status: "failed",
          errorMessage: "Message Undeliverable.",
        }),
      },
    ]);
  });

  it("retorna array vazio para um corpo que nao e array", () => {
    expect(parseAzureEventGridPayload({})).toEqual([]);
  });
});
