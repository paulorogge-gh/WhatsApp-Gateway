import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboundEvent, InboundMessage, InboundMessageType, MessageStatus, MessageStatusUpdate } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Handshake de verificacao (GET /webhook?hub.mode=subscribe&...), feito uma
// unica vez quando voce configura a URL do webhook no App da Meta.
// ---------------------------------------------------------------------------

/**
 * Resolve o handshake `GET` de verificacao do webhook da Meta.
 * Retorna o `hub.challenge` (string a devolver com HTTP 200) quando valido,
 * ou `null` quando a verificacao falha (nesse caso responda HTTP 403).
 */
export function verifyMetaWebhookSubscription(
  query: Record<string, string | undefined>,
  expectedVerifyToken: string
): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode === "subscribe" && token === expectedVerifyToken && challenge) {
    return challenge;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validacao de assinatura HMAC de cada evento (POST /webhook)
// ---------------------------------------------------------------------------

/**
 * Valida o header `X-Hub-Signature-256` enviado pela Meta em cada POST de
 * webhook, usando o app secret do seu App na Meta. Use SEMPRE o corpo cru
 * (raw body, antes do `JSON.parse`) - por isso a assinatura precisa ser
 * calculada no middleware que le o body, nao depois de parseado.
 */
export function verifyMetaWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

// ---------------------------------------------------------------------------
// Parsing do payload (POST /webhook) para os tipos normalizados do modulo
// ---------------------------------------------------------------------------

const MEDIA_TYPES = new Set(["image", "document", "audio", "video", "sticker"]);

const STATUS_MAP: Record<string, MessageStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

/**
 * Converte o corpo (ja parseado como JSON) de um webhook de mensagens da
 * Meta (`entry[].changes[].value`) em eventos normalizados. Um unico POST
 * pode conter varias mensagens e/ou varios status de entrega.
 */
export function parseMetaWebhookPayload(body: unknown): InboundEvent[] {
  const events: InboundEvent[] = [];
  const entries = asArray((body as Record<string, unknown> | undefined)?.["entry"]);

  for (const entry of entries) {
    const changes = asArray((entry as Record<string, unknown>)?.["changes"]);

    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.["value"] as Record<string, unknown> | undefined;
      if (!value) continue;

      const routingKey = String((value["metadata"] as Record<string, unknown> | undefined)?.["phone_number_id"] ?? "");

      for (const rawMessage of asArray(value["messages"])) {
        events.push({ kind: "message", message: toInboundMessage(rawMessage as Record<string, unknown>, routingKey) });
      }

      for (const rawStatus of asArray(value["statuses"])) {
        events.push({ kind: "status", status: toStatusUpdate(rawStatus as Record<string, unknown>, routingKey) });
      }
    }
  }

  return events;
}

function toInboundMessage(raw: Record<string, unknown>, routingKey: string): InboundMessage {
  const type = String(raw["type"] ?? "unknown");
  const messageType: InboundMessageType = (
    ["text", "image", "document", "audio", "video", "sticker", "location", "button", "interactive"].includes(type)
      ? type
      : "unknown"
  ) as InboundMessageType;

  const message: InboundMessage = {
    provider: "meta",
    messageId: String(raw["id"] ?? ""),
    from: String(raw["from"] ?? ""),
    routingKey,
    timestamp: unixSecondsToIso(raw["timestamp"]),
    type: messageType,
    raw,
  };

  if (messageType === "text") {
    message.text = String((raw["text"] as Record<string, unknown> | undefined)?.["body"] ?? "");
  } else if (MEDIA_TYPES.has(messageType)) {
    const media = raw[messageType] as Record<string, unknown> | undefined;
    message.mediaId = media?.["id"] ? String(media["id"]) : undefined;
    message.mimeType = media?.["mime_type"] ? String(media["mime_type"]) : undefined;
    message.caption = media?.["caption"] ? String(media["caption"]) : undefined;
  }

  return message;
}

function toStatusUpdate(raw: Record<string, unknown>, routingKey: string): MessageStatusUpdate {
  const statusValue = String(raw["status"] ?? "");
  const errors = asArray(raw["errors"]);
  const firstError = errors[0] as Record<string, unknown> | undefined;

  return {
    provider: "meta",
    providerMessageId: String(raw["id"] ?? ""),
    routingKey,
    status: STATUS_MAP[statusValue] ?? "failed",
    timestamp: unixSecondsToIso(raw["timestamp"]),
    recipient: String(raw["recipient_id"] ?? ""),
    errorMessage: firstError ? String(firstError["title"] ?? firstError["message"] ?? "") : undefined,
    raw,
  };
}

function unixSecondsToIso(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
