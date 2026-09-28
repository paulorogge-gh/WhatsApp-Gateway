import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseMetaWebhookPayload,
  verifyMetaWebhookSignature,
  verifyMetaWebhookSubscription,
} from "../src/providers/meta/metaWebhook.js";

const APP_SECRET = "meu-app-secret-de-teste";

function sign(rawBody: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
}

describe("verifyMetaWebhookSubscription", () => {
  it("retorna o challenge quando mode e token batem", () => {
    const result = verifyMetaWebhookSubscription(
      { "hub.mode": "subscribe", "hub.verify_token": "abc123", "hub.challenge": "desafio-xyz" },
      "abc123"
    );
    expect(result).toBe("desafio-xyz");
  });

  it("retorna null quando o verify_token nao bate", () => {
    const result = verifyMetaWebhookSubscription(
      { "hub.mode": "subscribe", "hub.verify_token": "errado", "hub.challenge": "desafio-xyz" },
      "abc123"
    );
    expect(result).toBeNull();
  });
});

describe("verifyMetaWebhookSignature", () => {
  it("aceita uma assinatura HMAC valida", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    expect(verifyMetaWebhookSignature(rawBody, sign(rawBody), APP_SECRET)).toBe(true);
  });

  it("rejeita uma assinatura invalida", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    expect(verifyMetaWebhookSignature(rawBody, "sha256=0000", APP_SECRET)).toBe(false);
  });

  it("rejeita quando o header esta ausente", () => {
    expect(verifyMetaWebhookSignature("{}", undefined, APP_SECRET)).toBe(false);
  });

  it("rejeita quando o corpo foi alterado depois de assinado", () => {
    const original = JSON.stringify({ amount: 100 });
    const tampered = JSON.stringify({ amount: 999 });
    expect(verifyMetaWebhookSignature(tampered, sign(original), APP_SECRET)).toBe(false);
  });
});

describe("parseMetaWebhookPayload", () => {
  it("normaliza uma mensagem de texto recebida", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "1234567890" },
                messages: [
                  {
                    id: "wamid.abc",
                    from: "5511999998888",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "Oi, tudo bem?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = parseMetaWebhookPayload(payload);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "message",
      message: {
        provider: "meta",
        messageId: "wamid.abc",
        from: "5511999998888",
        routingKey: "1234567890",
        type: "text",
        text: "Oi, tudo bem?",
      },
    });
  });

  it("normaliza um status de entrega", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "1234567890" },
                statuses: [
                  {
                    id: "wamid.xyz",
                    status: "delivered",
                    timestamp: "1700000000",
                    recipient_id: "5511999998888",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = parseMetaWebhookPayload(payload);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "status",
      status: {
        provider: "meta",
        providerMessageId: "wamid.xyz",
        routingKey: "1234567890",
        status: "delivered",
        recipient: "5511999998888",
      },
    });
  });

  it("retorna array vazio para payload sem entry", () => {
    expect(parseMetaWebhookPayload({})).toEqual([]);
  });
});
