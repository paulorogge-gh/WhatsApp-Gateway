import type {
  EventGridValidationResponse,
  InboundEvent,
  InboundMessage,
  InboundMessageType,
  MessageStatus,
  MessageStatusUpdate,
} from "../../core/types.js";

/**
 * Mensagens e status de entrega do Azure Advanced Messaging nao chegam por
 * um webhook simples com assinatura HMAC como na Meta: eles chegam via
 * Azure Event Grid, empurrados como um array de eventos para o endpoint
 * HTTPS que voce cadastrar numa Event Grid Subscription.
 *
 * A seguranca desse endpoint nao e por assinatura de corpo, e sim por:
 *  - o handshake de validacao abaixo (obrigatorio, senao a subscription
 *    fica "presa" em estado de validacao e nunca entrega eventos);
 *  - opcionalmente, um segredo na propria URL do endpoint e/ou Azure AD
 *    (Event Grid pull delivery) - configure isso no lado da infraestrutura.
 */

const EVENT_TYPE_VALIDATION = "Microsoft.EventGrid.SubscriptionValidationEvent";
const EVENT_TYPE_MESSAGE_RECEIVED = "Microsoft.Communication.AdvancedMessageReceived";
const EVENT_TYPE_DELIVERY_STATUS = "Microsoft.Communication.AdvancedMessageDeliveryStatusUpdated";

const MEDIA_MESSAGE_TYPES = new Set(["image", "document", "audio", "video", "sticker"]);

const STATUS_MAP: Record<string, MessageStatus> = {
  Sent: "sent",
  Delivered: "delivered",
  Read: "read",
  Failed: "failed",
};

interface EventGridEvent {
  id?: string;
  eventType?: string;
  eventTime?: string;
  data?: Record<string, unknown>;
}

/**
 * Processa o array de eventos do Event Grid recebido no corpo do POST.
 *
 * Retorna `EventGridValidationResponse` quando o payload e o handshake de
 * validacao (responda com HTTP 200 e `{ validationResponse }` no corpo);
 * caso contrario, retorna a lista de eventos normalizados (mensagens e/ou
 * atualizacoes de status).
 */
export function parseAzureEventGridPayload(body: unknown): InboundEvent[] | EventGridValidationResponse {
  const events = Array.isArray(body) ? (body as EventGridEvent[]) : [];

  const validationEvent = events.find((event) => event.eventType === EVENT_TYPE_VALIDATION);
  if (validationEvent) {
    const validationCode = String(validationEvent.data?.["validationCode"] ?? "");
    return { kind: "validation", validationResponse: validationCode };
  }

  const inboundEvents: InboundEvent[] = [];

  for (const event of events) {
    if (event.eventType === EVENT_TYPE_MESSAGE_RECEIVED && event.data) {
      inboundEvents.push({ kind: "message", message: toInboundMessage(event.data, event.eventTime) });
    } else if (event.eventType === EVENT_TYPE_DELIVERY_STATUS && event.data) {
      inboundEvents.push({ kind: "status", status: toStatusUpdate(event.data, event.eventTime) });
    }
  }

  return inboundEvents;
}

function toInboundMessage(data: Record<string, unknown>, eventTime: string | undefined): InboundMessage {
  const messageType = String(data["messageType"] ?? "unknown");
  const type: InboundMessageType = (
    ["text", "image", "document", "audio", "video", "sticker", "location", "button", "interactive"].includes(messageType)
      ? messageType
      : "unknown"
  ) as InboundMessageType;

  const media = data["media"] as Record<string, unknown> | undefined;

  return {
    provider: "azure",
    messageId: String(data["messageId"] ?? ""),
    from: String(data["fromBSUID"] ?? data["from"] ?? ""),
    // `to` no payload da Azure e o channelRegistrationId (GUID) do canal que recebeu.
    routingKey: String(data["to"] ?? ""),
    timestamp: String(data["receivedTimestamp"] ?? eventTime ?? new Date().toISOString()),
    type,
    text: type === "text" ? String(data["content"] ?? "") : undefined,
    mediaId: MEDIA_MESSAGE_TYPES.has(type) ? (media?.["id"] ? String(media["id"]) : undefined) : undefined,
    mimeType: MEDIA_MESSAGE_TYPES.has(type) ? (media?.["mimeType"] ? String(media["mimeType"]) : undefined) : undefined,
    caption: MEDIA_MESSAGE_TYPES.has(type) ? (media?.["caption"] ? String(media["caption"]) : undefined) : undefined,
    raw: data,
  };
}

function toStatusUpdate(data: Record<string, unknown>, eventTime: string | undefined): MessageStatusUpdate {
  const statusValue = String(data["status"] ?? "");
  const error = data["error"] as Record<string, unknown> | undefined;

  return {
    provider: "azure",
    providerMessageId: String(data["messageId"] ?? ""),
    // `from` no payload de status e o channelRegistrationId (GUID) do canal que enviou.
    routingKey: String(data["from"] ?? ""),
    status: STATUS_MAP[statusValue] ?? "failed",
    timestamp: String(data["receivedTimestamp"] ?? eventTime ?? new Date().toISOString()),
    recipient: String(data["toBSUID"] ?? data["to"] ?? ""),
    errorMessage: error ? String(error["channelMessage"] ?? "") : undefined,
    raw: data,
  };
}
